import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { InjectBridge } from '@/contentScript/bridge'
import { BRIDGE_HANDSHAKE } from '@/interface/bridge'
import { resetBridgeForTests, installBridge, resolveMock, sendLog } from '@/inject/bridge'
import type { IStore } from '@/interface/mock'
import { MethodEnum } from '@/interface/network'

/**
 * Page scripts must not be able to read mock data. jsdom cannot model the document_start
 * ordering that keeps the page from taking the port, so this checks the other half:
 * nothing but the empty handshake ever goes over window.postMessage.
 */

const SECRET_URL = 'https://internal.example.com/api/v1/private-endpoint'
const SECRET_BODY = '{"secret":"top-secret-response-body"}'
const SECRET_HEADER = 'x-internal-token'

const store = {
	active: true,
	mocks: [
		{
			id: 'mock-1',
			name: 'private',
			method: MethodEnum.GET,
			url: SECRET_URL,
			status: 201,
			response: SECRET_BODY,
			headers: [{ name: SECRET_HEADER, value: 'internal-value' }],
			active: true,
			createdOn: 1,
		},
	],
	collectionTree: undefined,
	sitePermissions: { 'https://app.example.com': { grantedOn: 1 } },
} as unknown as IStore

const state = {
	store,
	urlMap: { [SECRET_URL]: { GET: ['mocks[0]'] } },
	dynamicUrlMap: {},
	origin: 'https://app.example.com',
} as never

let pageVisible: unknown[] = []

const pageListener = (evt: MessageEvent): void => {
	pageVisible.push(evt.data)
}

// jsdom drops postMessage transfer lists, so the handshake is relayed by hand.
const connectBridge = (bridge: InjectBridge): void => {
	const channel = new MessageChannel()
	bridge.attach(channel.port1)
	window.dispatchEvent(
		new MessageEvent('message', {
			data: { type: BRIDGE_HANDSHAKE },
			source: window,
			ports: [channel.port2],
		}),
	)
}

const flush = async (turns = 5): Promise<void> => {
	for (let i = 0; i < turns; i += 1) {
		await new Promise((resolve) => setTimeout(resolve, 0))
	}
}

describe('page isolation', () => {
	let bridge: InjectBridge
	let logs: unknown[]

	beforeEach(() => {
		pageVisible = []
		logs = []
		window.addEventListener('message', pageListener)
		resetBridgeForTests()
		installBridge()
		bridge = new InjectBridge({
			getState: () => state,
			onLog: (_id, message) => logs.push(message),
		})
		connectBridge(bridge)
	})

	afterEach(() => {
		window.removeEventListener('message', pageListener)
		resetBridgeForTests()
		vi.clearAllMocks()
	})

	it('never exposes the mock store as a global in the page world', () => {
		expect((window as unknown as Record<string, unknown>).__MOCKMAN_MOCKS__).toBeUndefined()
	})

	it('answers a matched request with that response only', async () => {
		const answer = await resolveMock('GET', SECRET_URL)

		expect(answer).toEqual({
			status: 201,
			response: SECRET_BODY,
			headers: [{ name: SECRET_HEADER, value: 'internal-value' }],
			delay: undefined,
		})
		expect(JSON.stringify(answer)).not.toContain(SECRET_URL)
	})

	it('keeps mock data off the window channel', async () => {
		await resolveMock('GET', SECRET_URL)
		await resolveMock('GET', 'https://example.com/not-mocked')
		sendLog('id-1', { request: { url: SECRET_URL } })
		bridge.bumpEpoch()
		await flush()

		const serialized = JSON.stringify(pageVisible)
		expect(serialized).not.toContain(SECRET_BODY)
		expect(serialized).not.toContain(SECRET_HEADER)
		expect(serialized).not.toContain('mock-1')
		// At most the empty handshake, which the bridge also stops once it holds the port.
		expect(pageVisible.filter((data) => (data as { type?: string })?.type !== BRIDGE_HANDSHAKE)).toEqual([])
	})

	it('returns nothing for requests that are not mocked', async () => {
		expect(await resolveMock('GET', 'https://example.com/other')).toBeNull()
		expect(await resolveMock('POST', SECRET_URL)).toBeNull()
	})

	it('serves nothing while mocking is switched off', async () => {
		const disabledState = {
			store: { ...store, active: false },
			urlMap: { [SECRET_URL]: { GET: ['mocks[0]'] } },
			dynamicUrlMap: {},
		} as never
		const disabled = new InjectBridge({ getState: () => disabledState, onLog: () => void 0 })
		resetBridgeForTests()
		installBridge()
		connectBridge(disabled)

		expect(await resolveMock('GET', SECRET_URL)).toBeNull()
	})

	it('ignores a handshake replayed by the page', async () => {
		// The injected side binds exactly one port.
		const hostile = new MessageChannel()
		const received: unknown[] = []
		hostile.port1.onmessage = (evt) => received.push(evt.data)
		hostile.port1.start?.()
		window.dispatchEvent(
			new MessageEvent('message', {
				data: { type: BRIDGE_HANDSHAKE },
				source: window,
				ports: [hostile.port2],
			}),
		)

		await resolveMock('GET', SECRET_URL)
		await flush()

		expect(received).toEqual([])
	})

	it('does not answer at all when the bridge is not connected', async () => {
		resetBridgeForTests()
		expect(await resolveMock('GET', SECRET_URL)).toBeNull()
	})

	it('drops logs until a panel asks for them', async () => {
		sendLog('id-1', { request: { url: SECRET_URL } })
		await flush()
		expect(logs).toEqual([])

		bridge.setLogging(true)
		await flush()
		sendLog('id-2', { request: { url: SECRET_URL } })
		await flush()
		expect(logs).toHaveLength(1)
	})
})
