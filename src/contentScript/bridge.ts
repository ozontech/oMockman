/** Isolated-world side of the bridge: owns the mocks and answers one request at a time. */
import { getActiveMockWithPath, getMockPaths } from '@/contentScript/match'
import type { ContentScriptState } from '@/contentScript/state'
import type { ScenarioHit, ScenarioRuntime } from '@/contentScript/scenario'
import type { IMockResponse } from '@/interface/mock'
import { BRIDGE_HANDSHAKE } from '@/interface/bridge'
import type {
	BridgeContentMessage,
	BridgeInjectMessage,
	IBridgeMockAnswer,
	ISendRequest,
	ISendResult,
} from '@/interface/bridge'
import { safeNumberInt } from '@/services/number'
import { hasAnyPermission } from '@/services/origin'
import { coerceRequestPatch } from '@/services/request-patch'
import { resolveMockApply } from '@/services/mock-apply'

const HANDSHAKE_RETRY_MS = 50
const HANDSHAKE_TIMEOUT_MS = 5000
/** The page gives up after 60 s; this only covers a page that never answers. */
const SEND_ANSWER_TIMEOUT_MS = 65_000

/** Headers that would corrupt a synthesized response if copied verbatim. */
const DROPPED_MOCK_HEADERS = new Set(['content-encoding', 'transfer-encoding', 'content-length'])

export interface BridgeHost {
	getState: () => ContentScriptState | undefined
	onLog: (id: string | undefined, message: unknown) => void
	/** Set in the top frame only: collection scenarios run there. */
	scenarios?: ScenarioRuntime
	onScenarioHit?: (logId: string | undefined, hit: ScenarioHit) => void
}

export class InjectBridge {
	private port: MessagePort | null = null
	private epoch = 0
	private acked = false
	private nextSendId = 1
	private readonly sends = new Map<number, (result: ISendResult) => void>()

	constructor(private readonly host: BridgeHost) {}

	/**
	 * Retries until acked: both scripts start at document_start, before any page script,
	 * but their order relative to each other is not guaranteed.
	 */
	connect(): void {
		const channel = new MessageChannel()
		this.attach(channel.port1)

		const deadline = Date.now() + HANDSHAKE_TIMEOUT_MS
		const offer = (): void => {
			if (this.acked) return
			if (Date.now() > deadline) return
			try {
				window.postMessage({ type: BRIDGE_HANDSHAKE }, '*', [channel.port2])
			} catch {
				void 0
			}
			if (!this.acked) setTimeout(offer, HANDSHAKE_RETRY_MS)
		}
		offer()
	}

	attach(port: MessagePort): void {
		this.port = port
		this.port.onmessage = (event: MessageEvent) => {
			try {
				this.handleInjectMessage(event.data as BridgeInjectMessage)
			} catch {
				void 0
			}
		}
		this.port.start?.()
	}

	bumpEpoch(): void {
		this.epoch += 1
		this.send({ k: 'epoch', epoch: this.epoch })
		this.pushGate()
	}

	/** Re-sent on every epoch bump, so a permission granted just now works without a reload. */
	pushGate(): void {
		const state = this.host.getState()
		const open = Boolean(state?.store?.active) && hasAnyPermission(state?.store ?? ({} as never), state?.origin ?? null)
		this.send({ k: 'gate', open })
	}

	setLogging(enabled: boolean): void {
		this.send({ k: 'logging', enabled })
	}

	get connected(): boolean {
		return this.acked
	}

	/** Has the page send a request for the panel, on a site the user allowed. */
	sendRequest(request: ISendRequest): Promise<ISendResult> {
		const state = this.host.getState()
		if (!state?.store || !hasAnyPermission(state.store, state.origin)) {
			return Promise.resolve({ ok: false, reason: 'not_allowed', error: 'Mockman is not allowed on this site.' })
		}
		if (!this.acked || !this.port) {
			return Promise.resolve({ ok: false, reason: 'unavailable', error: 'The page is not connected to Mockman yet.' })
		}

		const id = this.nextSendId
		this.nextSendId += 1
		return new Promise<ISendResult>((resolve) => {
			const timer = setTimeout(() => {
				this.sends.delete(id)
				resolve({ ok: false, reason: 'unavailable', error: 'The page did not answer.' })
			}, SEND_ANSWER_TIMEOUT_MS)
			this.sends.set(id, (result) => {
				clearTimeout(timer)
				this.sends.delete(id)
				resolve(result)
			})
			this.send({ k: 'send', id, request })
		})
	}

	private send(message: BridgeContentMessage): void {
		try {
			this.port?.postMessage(message)
		} catch {
			void 0
		}
	}

	private handleInjectMessage(message: BridgeInjectMessage): void {
		if (message.k === 'ack') {
			this.acked = true
			this.pushGate()
			return
		}
		if (message.k === 'log') {
			this.host.onLog(message.id, message.message)
			return
		}
		if (message.k === 'send:res') {
			this.sends.get(message.id)?.(message.result)
			return
		}
		if (message.k === 'match') {
			const { mock, noCache } = this.findMock(message.method, message.url, message.logId)
			this.send({ k: 'match:res', id: message.id, mock, ...(noCache ? { noCache } : {}) })
		}
	}

	/**
	 * A scenario rule first (top frame only: one flow per tab), then the usual mock for the
	 * endpoint. The page sends only method and url, so it cannot widen its own access.
	 */
	private findMock(method: string, url: string, logId?: string): { mock: IBridgeMockAnswer | null; noCache: boolean } {
		const state = this.host.getState()
		if (!state || !state.store?.active) return { mock: null, noCache: false }
		if (!hasAnyPermission(state.store, state.origin)) return { mock: null, noCache: false }

		if (this.host.scenarios) {
			const { hit, tracked } = this.host.scenarios.match(state.store, method, url)
			if (hit) this.host.onScenarioHit?.(logId, hit)
			if (hit) return { mock: hit.mock ? answerFor(hit.mock) : null, noCache: true }
			if (tracked) return { mock: this.findEndpointMock(method, url), noCache: true }
		}
		return { mock: this.findEndpointMock(method, url), noCache: false }
	}

	private findEndpointMock(method: string, url: string): IBridgeMockAnswer | null {
		const state = this.host.getState()
		if (!state) return null
		const paths = getMockPaths(url, method, {
			urlMap: state.urlMap,
			dynamicUrlMap: state.dynamicUrlMap,
		})
		const { mock } = getActiveMockWithPath(paths, state.store)
		return mock ? answerFor(mock) : null
	}
}

/** What the page gets for a mock: the response to serve, or the changes to make on the way to the network. */
function answerFor(mock: IMockResponse): IBridgeMockAnswer | null {
	const apply = resolveMockApply(mock)
	const headers = (mock.headers ?? [])
		.filter(({ name }) => !DROPPED_MOCK_HEADERS.has(String(name || '').toLowerCase()))
		.map(({ name, value }) => ({ name, value }))
	const delay = mock.delay == null ? undefined : safeNumberInt(String(mock.delay)) ?? undefined

	if (apply.responseBody) {
		return { status: mock.status ?? 200, response: mock.response ?? '', headers: apply.responseHeaders ? headers : [], delay }
	}

	const requestPatch = apply.requestBody ? coerceRequestPatch(mock.requestPatch) : undefined
	const responseHeaders = apply.responseHeaders && headers.length > 0 ? headers : undefined
	if (!requestPatch && !responseHeaders) return null
	return {
		status: 0,
		response: '',
		headers: [],
		delay,
		network: {
			...(requestPatch ? { requestPatch } : {}),
			...(responseHeaders ? { responseHeaders } : {}),
		},
	}
}
