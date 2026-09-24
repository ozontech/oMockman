import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BRIDGE_HANDSHAKE } from '@/interface/bridge'
import type { BridgeInjectMessage } from '@/interface/bridge'
import { installBridge, isBridgeReady, resetBridgeForTests, resolveMock, sendLog } from '@/inject/bridge'

class FakeContentSide {
	readonly received: BridgeInjectMessage[] = []
	private readonly port: MessagePort

	constructor(answer: (method: string, url: string) => unknown = () => null) {
		const channel = new MessageChannel()
		this.port = channel.port1
		this.port.onmessage = (evt: MessageEvent) => {
			const message = evt.data as BridgeInjectMessage
			this.received.push(message)
			if (message.k === 'match') {
				this.port.postMessage({
					k: 'match:res',
					id: message.id,
					mock: answer(message.method, message.url),
				})
			}
		}
		this.port.start?.()

		window.dispatchEvent(
			new MessageEvent('message', {
				data: { type: BRIDGE_HANDSHAKE },
				source: window,
				ports: [channel.port2],
			}),
		)

		this.port.postMessage({ k: 'gate', open: true })
	}

	setGate(open: boolean): void {
		this.port.postMessage({ k: 'gate', open })
	}

	get matchRequests(): BridgeInjectMessage[] {
		return this.received.filter((message) => message.k === 'match')
	}

	bumpEpoch(epoch: number): void {
		this.port.postMessage({ k: 'epoch', epoch })
	}

	setLogging(enabled: boolean): void {
		this.port.postMessage({ k: 'logging', enabled })
	}
}

/** A MessagePort delivery can need more than one turn of the loop: one `setTimeout(0)` was flaky. */
const flush = async (turns = 5): Promise<void> => {
	for (let i = 0; i < turns; i += 1) {
		await new Promise((resolve) => setTimeout(resolve, 0))
	}
}

const MOCK_ANSWER = { status: 200, response: '{"a":1}', headers: [] }

describe('inject/bridge', () => {
	beforeEach(() => {
		resetBridgeForTests()
		installBridge()
	})

	afterEach(() => {
		resetBridgeForTests()
		vi.useRealTimers()
	})

	it('is not ready before the handshake', async () => {
		resetBridgeForTests()
		expect(isBridgeReady()).toBe(false)
		expect(await resolveMock('GET', 'https://example.com')).toBeNull()
	})

	it('acknowledges the handshake so the content script stops retrying', async () => {
		const content = new FakeContentSide()
		await flush()

		expect(isBridgeReady()).toBe(true)
		expect(content.received[0]).toEqual({ k: 'ack' })
	})

	it('resolves a mocked request', async () => {
		const content = new FakeContentSide(() => MOCK_ANSWER)

		expect(await resolveMock('GET', 'https://example.com/api')).toEqual(MOCK_ANSWER)
		expect(content.matchRequests).toEqual([
			{ k: 'match', id: 1, method: 'GET', url: 'https://example.com/api' },
		])
	})

	it('caches negative answers instead of asking again', async () => {
		const content = new FakeContentSide(() => null)

		expect(await resolveMock('GET', 'https://example.com/api')).toBeNull()
		expect(await resolveMock('GET', 'https://example.com/api?query=1')).toBeNull()
		expect(await resolveMock('GET', 'https://example.com/api')).toBeNull()

		// One roundtrip: the query string is not part of the match key.
		expect(content.matchRequests).toHaveLength(1)
	})

	it('does not cache positive answers', async () => {
		const content = new FakeContentSide(() => MOCK_ANSWER)

		await resolveMock('GET', 'https://example.com/api')
		await resolveMock('GET', 'https://example.com/api')

		expect(content.matchRequests).toHaveLength(2)
	})

	it('asks again after the mock set changes', async () => {
		const content = new FakeContentSide(() => null)

		await resolveMock('GET', 'https://example.com/api')
		content.bumpEpoch(1)
		await flush()
		await resolveMock('GET', 'https://example.com/api')

		expect(content.matchRequests).toHaveLength(2)
	})

	it('falls back to the network when the isolated world does not answer', async () => {
		vi.useFakeTimers()
		const channel = new MessageChannel()
		window.dispatchEvent(
			new MessageEvent('message', {
				data: { type: BRIDGE_HANDSHAKE },
				source: window,
				ports: [channel.port2],
			}),
		)

		channel.port1.postMessage({ k: 'gate', open: true })
		await vi.advanceTimersByTimeAsync(0)

		const pending = resolveMock('GET', 'https://example.com/silent')
		await vi.advanceTimersByTimeAsync(1600)

		expect(await pending).toBeNull()
	})

	it('asks again after a timeout instead of caching it as not mocked', async () => {
		const channel = new MessageChannel()
		let matches = 0
		channel.port1.onmessage = (evt: MessageEvent) => {
			const message = evt.data as BridgeInjectMessage
			if (message.k !== 'match') return
			matches += 1
			// The first request goes unanswered, as if the isolated world were busy.
			if (matches > 1) channel.port1.postMessage({ k: 'match:res', id: message.id, mock: MOCK_ANSWER })
		}
		channel.port1.start?.()
		window.dispatchEvent(
			new MessageEvent('message', {
				data: { type: BRIDGE_HANDSHAKE },
				source: window,
				ports: [channel.port2],
			}),
		)
		channel.port1.postMessage({ k: 'gate', open: true })
		await flush()

		vi.useFakeTimers()
		const first = resolveMock('GET', 'https://example.com/api')
		await vi.advanceTimersByTimeAsync(1600)
		expect(await first).toBeNull()
		vi.useRealTimers()

		expect(await resolveMock('GET', 'https://example.com/api')).toEqual(MOCK_ANSWER)
	})

	it('hides the handshake from page listeners added after the bridge', async () => {
		const seen: unknown[] = []
		const pageListener = (evt: MessageEvent) => seen.push(evt.data)
		window.addEventListener('message', pageListener)
		window.addEventListener('message', pageListener, true)
		try {
			const content = new FakeContentSide()
			await flush()
			expect(content.received[0]).toEqual({ k: 'ack' })
		} finally {
			window.removeEventListener('message', pageListener)
			window.removeEventListener('message', pageListener, true)
		}

		expect(seen).toEqual([])
	})

	it('sends logs only while logging is enabled', async () => {
		const content = new FakeContentSide()
		await flush()

		sendLog('a', { hello: 1 })
		await flush()
		expect(content.received.some((message) => message.k === 'log')).toBe(false)

		content.setLogging(true)
		await flush()
		sendLog('b', { hello: 2 })
		await flush()
		expect(content.received.filter((message) => message.k === 'log')).toEqual([
			{ k: 'log', id: 'b', message: { hello: 2 } },
		])
	})
})
