import { fetchFullResponseHeaders } from '@/contentScript/headers'
import { InjectBridge } from '@/contentScript/bridge'
import { inject } from '@/contentScript/inject-to-dom'
import { markMockedInLog } from '@/contentScript/match'
import { getContentPort, onContentPortMessage } from '@/contentScript/port'
import { ContentScriptState } from '@/contentScript/state'
import { ScenarioRuntime } from '@/contentScript/scenario'
import type { ScenarioHit } from '@/contentScript/scenario'
import { buildSentLog } from '@/contentScript/sent-log'
import { isFromExtensionPage } from '@/contentScript/sender-check'
import type { ISendRequest, ISendResult } from '@/interface/bridge'
import type { IEventMessage } from '@/interface/message'
import type { ILog } from '@/interface/mock'
import { STORE_NAME } from '@/panel/app/service/store-actions'
import { SCENARIO_RESET_KEY } from '@/panel/app/service/scenario-client'
import type { ScenarioResetSignal } from '@/panel/app/service/scenario-client'
import { MessageService as messageService } from '@/services/message'
import { MessageAPI } from '@/services/message/api'

/** Isolated world: owns the mock store, answers the injected script, forwards logs to the panel. */

let state: ContentScriptState
let bridge: InjectBridge | undefined

/** Collection scenarios run in the top frame: one flow per tab. */
const scenarios = window === window.top ? new ScenarioRuntime() : undefined
/** The scenario rule each request was answered by, until its log arrives. */
const scenarioHits = new Map<string, ScenarioHit>()
const MAX_SCENARIO_HITS = 500

const postToPanel = (envelope: IEventMessage): void => {
	try {
		getContentPort().postMessage(envelope)
	} catch {
		window.__MOCKMAN_CONTENT_PORT__ = null
	}
}

const sendLogToPanel = (id: string | undefined, log: ILog): void => {
	postToPanel({ message: log, type: 'LOG', from: 'CONTENT', to: 'PANEL', id, extensionName: 'MOCKMAN' })
}

const rememberScenarioHit = (logId: string | undefined, hit: ScenarioHit): void => {
	if (!logId) return
	if (scenarioHits.size >= MAX_SCENARIO_HITS) scenarioHits.delete(scenarioHits.keys().next().value as string)
	scenarioHits.set(logId, hit)
}

const attachScenarioHit = (id: string | undefined, log: ILog): void => {
	const hit = id ? scenarioHits.get(id) : undefined
	if (!hit || !id) return
	scenarioHits.delete(id)
	log.scenario = {
		collectionName: hit.collectionName,
		callNumber: hit.callNumber,
		network: !hit.mock,
	}
}


/** Sends a request for the panel through the page and logs it like the page's own. */
const sendForPanel = async (request: ISendRequest): Promise<ISendResult> => {
	if (!bridge) return { ok: false, reason: 'unavailable', error: 'Mockman is still starting on this page.' }
	const result = await bridge.sendRequest(request)
	if (!result.ok) return result
	try {
		const full = await fetchFullResponseHeaders(result.url.split('?')[0], String(request.method || 'GET').toUpperCase())
		if (full && full.length > 0) result.headers = full
	} catch {
		void 0
	}
	sendLogToPanel(undefined, buildSentLog(request, result))
	return result
}

const onInjectLog = async (id: string | undefined, message: unknown): Promise<void> => {
	try {
		const log = message as ILog
		if (!log?.request) return

		try {
			if (log.response && log.request.url && log.request.method && !log.headersPatched) {
				const full = await fetchFullResponseHeaders(log.request.url, log.request.method)
				if (full && full.length > 0) {
					log.response.headers = full
				}
			}
		} catch {
			void 0
		}

		markMockedInLog(log, state)
		attachScenarioHit(id, log)
		sendLogToPanel(id, log)
	} catch {
		void 0
	}
}

const refreshFromStore = async (): Promise<void> => {
	await state.refresh()
	// Cached "not mocked" decisions in the page world are now stale.
	bridge?.bumpEpoch()
}

const handleMessage = async (event: IEventMessage): Promise<void> => {
	try {
		if (event.type === 'LOG') {
			const log = event.message as ILog
			if (!log?.request) return
			markMockedInLog(log, state)
			sendLogToPanel(typeof event.id === 'string' ? event.id : undefined, log)
			return
		}

		if (event.type === 'NOTIFICATION') {
			if (event.message === 'UPDATE_STORE') {
				await refreshFromStore()
				return
			}
			if (typeof event.message === 'object' && (event.message as { kind?: string })?.kind === 'APPLY_MOCKS') {
				await refreshFromStore()
			}
		}
	} catch {
		void 0
	}
}

function waitForInject(): Promise<void> {
	return new Promise((resolve) => {
		let resolved = false
		const timeout = setTimeout(() => {
			if (!resolved) {
				resolved = true
				resolve()
			}
		}, 2000)

		function handler(evt: MessageEvent) {
			if (evt.source === window && evt.data?.type === 'MOCKMAN_INJECT_READY') {
				if (!resolved) {
					clearTimeout(timeout)
					window.removeEventListener('message', handler)
					resolved = true
					resolve()
				}
			}
		}

		window.addEventListener('message', handler)
		window.postMessage({ type: 'MOCKMAN_CHECK_READY' }, '*')
	})
}

const initScript = async (): Promise<void> => {
	const host = location.host
	try {
		MessageAPI.initFromContent(host)

		inject()
		await waitForInject()

		state = new ContentScriptState()
		await Promise.all([state.refresh(), state.refreshOrigin()])

		bridge = new InjectBridge({
			getState: () => state,
			onLog: (id, message) => void onInjectLog(id, message),
			scenarios,
			onScenarioHit: rememberScenarioHit,
		})
		bridge.connect()

		// Logging stays off until the background reports an open panel.
		onContentPortMessage((message) => {
			const msg = message as { type?: string; enabled?: boolean }
			if (msg?.type === 'MOCKMAN_CAPTURE') {
				bridge?.setLogging(msg.enabled !== false)
			}
		})
		try {
			getContentPort()
		} catch {
			void 0
		}

		// Sent by the background when this port is gone (the worker was stopped meanwhile).
		try {
			chrome.runtime.onMessage.addListener((
				message: { type?: string; enabled?: boolean; origin?: string | null; request?: ISendRequest },
				sender: chrome.runtime.MessageSender,
				sendResponse: (result: ISendResult) => void,
			) => {
				if (message?.type === 'MOCKMAN_SEND_REQUEST') {
					if (!isFromExtensionPage(sender, chrome.runtime.id, chrome.runtime.getURL(''))) {
						sendResponse({ ok: false, reason: 'unavailable', error: 'Only the Mockman panel can send requests.' })
						return undefined
					}
					if (!message.request) {
						sendResponse({ ok: false, reason: 'invalid', error: 'No request to send.' })
						return undefined
					}
					sendForPanel(message.request)
						.then(sendResponse)
						.catch((error: unknown) => sendResponse({
							ok: false,
							reason: 'unavailable',
							error: error instanceof Error ? error.message : String(error),
						}))
					return true
				}
				if (message?.type === 'MOCKMAN_CAPTURE') {
					bridge?.setLogging(message.enabled !== false)
					try {
						getContentPort()
					} catch {
						void 0
					}
					return
				}
				if (message?.type === 'MOCKMAN_ORIGIN_CHANGED') {
					void state?.refreshOrigin().then(() => bridge?.bumpEpoch())
				}
			})
		} catch {
			void 0
		}

		messageService.listen('CONTENT', async (msg: IEventMessage) => {
			await handleMessage(msg)
		})

		try {
			chrome.storage.onChanged.addListener(async (changes, areaName) => {
				try {
					if (areaName !== 'local' || !changes) return
					const reset = changes[SCENARIO_RESET_KEY]?.newValue as ScenarioResetSignal | undefined
					if (reset && scenarios) {
						scenarios.reset(reset.collectionId)
						bridge?.bumpEpoch()
					}
					if (!Object.prototype.hasOwnProperty.call(changes, STORE_NAME)) return
					await refreshFromStore()
				} catch {
					void 0
				}
			})
		} catch {
			void 0
		}
	} catch {
		void 0
	}
}

void initScript()
