/** Main-world side of the bridge. Holds no mock data, only cached "not mocked" answers. */
import { BRIDGE_HANDSHAKE } from '@/interface/bridge'
import type { BridgeContentMessage, BridgeInjectMessage, IBridgeMockAnswer } from '@/interface/bridge'
import { normalizeUrl } from '@/services/url'

const MATCH_TIMEOUT_MS = 1500
const NEGATIVE_CACHE_LIMIT = 1000
/** How long a request waits for the permission verdict before going to the network. */
const GATE_TIMEOUT_MS = 300
/**
 * How long after the page starts a request may wait for the isolated world to connect. A page
 * can fire its first request before the bridge is up; without this it goes out unmocked. The
 * window is counted from install, not per request, so a bridge that never comes costs only the
 * requests of the first second.
 */
const CONNECT_WAIT_MS = 1000

let port: MessagePort | null = null
let installedAt = 0
const portWaiters = new Set<() => void>()
let loggingEnabled = false
let nextRequestId = 1
/** Whether this origin may be served; null until the isolated world says. */
let gateOpen: boolean | null = null
const gateWaiters = new Set<(open: boolean) => void>()

const pending = new Map<number, (answer: IBridgeMockAnswer | null) => void>()
const knownNotMocked = new Set<string>()

const cacheKey = (method: string, url: string): string =>
	`${String(method || '').toUpperCase()} ${normalizeUrl(url)}`

function handleContentMessage(message: BridgeContentMessage): void {
	if (message.k === 'match:res') {
		const resolve = pending.get(message.id)
		if (!resolve) return
		pending.delete(message.id)
		resolve(message.mock)
		return
	}
	if (message.k === 'epoch') {
		knownNotMocked.clear()
		return
	}
	if (message.k === 'logging') {
		loggingEnabled = message.enabled
		return
	}
	if (message.k === 'gate') {
		gateOpen = message.open
		// A grant made just now must not be masked by answers cached while it was closed.
		if (!message.open) knownNotMocked.clear()
		for (const waiter of gateWaiters) waiter(message.open)
		gateWaiters.clear()
	}
}

function waitForPort(): Promise<boolean> {
	if (port) return Promise.resolve(true)
	const left = installedAt + CONNECT_WAIT_MS - Date.now()
	if (!installedAt || left <= 0) return Promise.resolve(false)

	return new Promise<boolean>((resolve) => {
		let settled = false
		const finish = (connected: boolean) => {
			if (settled) return
			settled = true
			clearTimeout(timer)
			portWaiters.delete(onConnect)
			resolve(connected)
		}
		const onConnect = () => finish(true)
		const timer = setTimeout(() => finish(false), left)
		portWaiters.add(onConnect)
	})
}

/** Waits only while a verdict is plausibly coming: no port means nothing to wait for. */
function waitForGate(): Promise<boolean> {
	if (gateOpen !== null) return Promise.resolve(gateOpen)
	if (!port) return Promise.resolve(false)

	return new Promise<boolean>((resolve) => {
		let settled = false
		const finish = (open: boolean) => {
			if (settled) return
			settled = true
			clearTimeout(timer)
			gateWaiters.delete(finish)
			resolve(open)
		}
		const timer = setTimeout(() => finish(false), GATE_TIMEOUT_MS)
		gateWaiters.add(finish)
	})
}

function post(message: BridgeInjectMessage): void {
	try {
		port?.postMessage(message)
	} catch {
		void 0
	}
}

export function installBridge(): void {
	const onWindowMessage = (evt: MessageEvent): void => {
		if (evt.source !== window) return
		if ((evt.data as { type?: string })?.type !== BRIDGE_HANDSHAKE) return

		const received = evt.ports?.[0]
		if (!received) return

		evt.stopImmediatePropagation()
		window.removeEventListener('message', onWindowMessage, true)

		port = received
		port.onmessage = (portEvent: MessageEvent) => {
			try {
				handleContentMessage(portEvent.data as BridgeContentMessage)
			} catch {
				void 0
			}
		}
		port.start?.()
		post({ k: 'ack' })
		for (const waiter of [...portWaiters]) waiter()
	}

	installedAt = Date.now()
	window.addEventListener('message', onWindowMessage, true)
}

export function isBridgeReady(): boolean {
	return port !== null
}

export function isLoggingEnabled(): boolean {
	return loggingEnabled
}

/** Resolves to null, i.e. go to the network, when the bridge is unavailable or too slow. */
export async function resolveMock(method: string, url: string): Promise<IBridgeMockAnswer | null> {
	if (!(await waitForPort())) return null

	const key = cacheKey(method, url)
	if (knownNotMocked.has(key)) return null

	if (!(await waitForGate())) return null
	if (!port) return null

	const id = nextRequestId
	nextRequestId += 1

	return new Promise<IBridgeMockAnswer | null>((resolve) => {
		let settled = false
		const finish = (answer: IBridgeMockAnswer | null, answered: boolean) => {
			if (settled) return
			settled = true
			clearTimeout(timer)
			pending.delete(id)
			// Only a real "not mocked" answer is cached: a timeout says nothing about the mock set.
			if (answered && !answer) {
				if (knownNotMocked.size >= NEGATIVE_CACHE_LIMIT) knownNotMocked.clear()
				knownNotMocked.add(key)
			}
			resolve(answer)
		}

		const timer = setTimeout(() => finish(null, false), MATCH_TIMEOUT_MS)
		pending.set(id, (answer) => finish(answer, true))
		post({ k: 'match', id, method: String(method || 'GET'), url: String(url || '') })
	})
}

export function sendLog(id: string | undefined, message: unknown): void {
	if (!loggingEnabled) return
	post({ k: 'log', id, message })
}

/** Test helper: drops all bridge state. */
export function resetBridgeForTests(): void {
	port = null
	installedAt = 0
	portWaiters.clear()
	loggingEnabled = false
	nextRequestId = 1
	gateOpen = null
	gateWaiters.clear()
	pending.clear()
	knownNotMocked.clear()
}
