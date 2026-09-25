import { fetchFullResponseHeaders } from '@/contentScript/headers'
import { InjectBridge } from '@/contentScript/bridge'
import { inject } from '@/contentScript/inject-to-dom'
import { markMockedInLog } from '@/contentScript/match'
import { getContentPort, onContentPortMessage } from '@/contentScript/port'
import { ContentScriptState } from '@/contentScript/state'
import type { IEventMessage } from '@/interface/message'
import type { ILog } from '@/interface/mock'
import type { ApplyMocksPayload } from '@/interface/xhr'
import { STORE_NAME } from '@/panel/app/service/store-actions'
import { MessageService as messageService } from '@/services/message'
import { MessageAPI } from '@/services/message/api'

/** Isolated world: owns the mock store, answers the injected script, forwards logs to the panel. */

let state: ContentScriptState
let bridge: InjectBridge | undefined

const sendLogToPanel = (id: string | undefined, log: ILog): void => {
	const envelope: IEventMessage = {
		message: log,
		type: 'LOG',
		from: 'CONTENT',
		to: 'PANEL',
		id,
		extensionName: 'MOCKMAN',
	}
	try {
		getContentPort().postMessage(envelope)
	} catch {
		window.__MOCKMAN_CONTENT_PORT__ = null
	}
}

const onInjectLog = async (id: string | undefined, message: unknown): Promise<void> => {
	try {
		const log = message as ILog
		if (!log?.request) return

		try {
			if (log.response && log.request.url && log.request.method) {
				const full = await fetchFullResponseHeaders(log.request.url, log.request.method)
				if (full && full.length > 0) {
					log.response.headers = full
				}
			}
		} catch {
			void 0
		}

		markMockedInLog(log, state)
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
				void (event.message as ApplyMocksPayload)
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
			chrome.runtime.onMessage.addListener((message: { type?: string; enabled?: boolean; origin?: string | null }) => {
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
					if (areaName !== 'local') return
					if (!changes || !Object.prototype.hasOwnProperty.call(changes, STORE_NAME)) return
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
