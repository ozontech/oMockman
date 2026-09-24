/** Isolated-world side of the bridge: owns the mocks and answers one request at a time. */
import { getActiveMockWithPath, getMockPaths } from '@/contentScript/match'
import type { ContentScriptState } from '@/contentScript/state'
import { BRIDGE_HANDSHAKE } from '@/interface/bridge'
import type { BridgeContentMessage, BridgeInjectMessage, IBridgeMockAnswer } from '@/interface/bridge'
import { safeNumberInt } from '@/services/number'
import { hasAnyPermission } from '@/services/origin'

const HANDSHAKE_RETRY_MS = 50
const HANDSHAKE_TIMEOUT_MS = 5000

/** Headers that would corrupt a synthesized response if copied verbatim. */
const DROPPED_MOCK_HEADERS = new Set(['content-encoding', 'transfer-encoding', 'content-length'])

export interface BridgeHost {
	getState: () => ContentScriptState | undefined
	onLog: (id: string | undefined, message: unknown) => void
}

export class InjectBridge {
	private port: MessagePort | null = null
	private epoch = 0
	private acked = false

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
		if (message.k === 'match') {
			this.send({ k: 'match:res', id: message.id, mock: this.findMock(message.method, message.url) })
		}
	}

	private findMock(method: string, url: string): IBridgeMockAnswer | null {
		const state = this.host.getState()
		if (!state || !state.store?.active) return null

		// Checked here, in the isolated world: the page sends only method and url, so it cannot
		// widen its own access.
		if (!hasAnyPermission(state.store, state.origin)) return null

		const paths = getMockPaths(url, method, {
			urlMap: state.urlMap,
			dynamicUrlMap: state.dynamicUrlMap,
		})
		const { mock } = getActiveMockWithPath(paths, state.store)
		if (!mock) return null

		return {
			status: mock.status ?? 200,
			response: mock.response ?? '',
			headers: (mock.headers ?? [])
				.filter(({ name }) => !DROPPED_MOCK_HEADERS.has(String(name || '').toLowerCase()))
				.map(({ name, value }) => ({ name, value })),
			delay: mock.delay == null ? undefined : safeNumberInt(String(mock.delay)) ?? undefined,
		}
	}
}
