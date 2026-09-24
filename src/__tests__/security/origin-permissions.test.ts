import { beforeEach, describe, expect, it } from 'vitest'

import { InjectBridge } from '@/contentScript/bridge'
import { BRIDGE_HANDSHAKE } from '@/interface/bridge'
import type { BridgeContentMessage } from '@/interface/bridge'
import type { IStore } from '@/interface/mock'
import { MethodEnum } from '@/interface/network'
import { installBridge, resetBridgeForTests, resolveMock } from '@/inject/bridge'

/**
 * A mock is served only where the user allowed it. Without this, matching goes by
 * `METHOD + url` alone, so any page could read mock bodies by guessing internal URLs:
 * the wrapper answers before the request leaves the browser, so CORS never applies.
 */

const INTERNAL_URL = 'https://internal.example.com/api/v1/orders'
const SECRET_BODY = '{"orders":["internal-data"]}'
const ALLOWED_ORIGIN = 'https://app.example.com'
const OTHER_ORIGIN = 'https://evil.example.com'

const mock = {
	id: 'mock-1',
	name: 'orders',
	method: MethodEnum.GET,
	url: INTERNAL_URL,
	status: 200,
	response: SECRET_BODY,
	headers: [],
	active: true,
	createdOn: 1,
	collectionId: 'team',
}

const tree = {
	root: [],
	nodes: {
		team: { id: 'team', name: 'Team', parentId: null, active: true, createdOn: 1, entries: [] },
		nested: { id: 'nested', name: 'Nested', parentId: 'team', active: true, createdOn: 1, entries: [] },
		private: { id: 'private', name: 'Private', parentId: null, active: true, createdOn: 1, entries: [] },
	},
}

const makeState = (origin: string | null, permissions: IStore['sitePermissions']) => ({
	store: {
		active: true,
		mocks: [mock],
		collectionTree: tree,
		sitePermissions: permissions,
		ai: { enabled: true, activeProviderId: 'p1', providers: [{ id: 'p1', name: 'x', baseURL: 'https://api', apiKey: 'sk-secret-key', model: 'm', createdOn: 1 }] },
	} as unknown as IStore,
	urlMap: { [INTERNAL_URL]: { GET: ['mocks[0]'] } },
	dynamicUrlMap: {},
	origin,
}) as never

const flush = async (turns = 5): Promise<void> => {
	for (let i = 0; i < turns; i += 1) {
		await new Promise((resolve) => setTimeout(resolve, 0))
	}
}

const connect = (state: never) => {
	const channel = new MessageChannel()
	const received: BridgeContentMessage[] = []
	channel.port2.onmessage = (evt: MessageEvent) => received.push(evt.data as BridgeContentMessage)
	channel.port2.start?.()

	const bridge = new InjectBridge({ getState: () => state, onLog: () => void 0 })
	bridge.attach(channel.port1)

	const ask = (method: string, url: string, id = 1) => channel.port2.postMessage({ k: 'match', id, method, url })
	return { bridge, received, ask }
}

describe('origin permissions', () => {
	beforeEach(() => resetBridgeForTests())

	it('serves nothing to an origin that was never granted anything', async () => {
		const { ask, received } = connect(makeState(OTHER_ORIGIN, {}))

		ask('GET', INTERNAL_URL)
		await flush()

		expect(received).toEqual([{ k: 'match:res', id: 1, mock: null }])
		expect(JSON.stringify(received)).not.toContain('internal-data')
	})

	it('serves the mock once the origin is allowed', async () => {
		const { ask, received } = connect(
			makeState(ALLOWED_ORIGIN, { [ALLOWED_ORIGIN]: { grantedOn: 1 } }),
		)

		ask('GET', INTERNAL_URL)
		await flush()

		expect(received[0]).toMatchObject({ k: 'match:res', mock: { status: 200, response: SECRET_BODY } })
	})

	it('does not serve a grant that belongs to a different origin', async () => {
		// The grant belongs to another site; this page must not benefit from it.
		const { ask, received } = connect(
			makeState(OTHER_ORIGIN, { [ALLOWED_ORIGIN]: { grantedOn: 1 } }),
		)

		ask('GET', INTERNAL_URL)
		await flush()

		expect(received).toEqual([{ k: 'match:res', id: 1, mock: null }])
	})

	it('serves every origin once the user opted into auto-grant', async () => {
		const state = makeState(OTHER_ORIGIN, {}) as unknown as { store: IStore }
		state.store.autoGrantSites = true
		const { ask, received } = connect(state as never)

		ask('GET', INTERNAL_URL)
		await flush()

		expect(received[0]).toMatchObject({ k: 'match:res', mock: { response: SECRET_BODY } })
	})

	it('keeps auto-grant off unless the store says otherwise', async () => {
		// The default must stay closed: the setting is opt-in, never inferred.
		const { ask, received } = connect(makeState(OTHER_ORIGIN, {}))

		ask('GET', INTERNAL_URL)
		await flush()

		expect(received).toEqual([{ k: 'match:res', id: 1, mock: null }])
	})

	it('refuses when the browser could not report an origin', async () => {
		const { ask, received } = connect(
			makeState(null, { [ALLOWED_ORIGIN]: { grantedOn: 1 } }),
		)

		ask('GET', INTERNAL_URL)
		await flush()

		expect(received).toEqual([{ k: 'match:res', id: 1, mock: null }])
	})

	it('never puts provider keys on the bridge, whatever is asked', async () => {
		const { ask, received } = connect(
			makeState(ALLOWED_ORIGIN, { [ALLOWED_ORIGIN]: { grantedOn: 1 } }),
		)

		ask('GET', INTERNAL_URL, 1)
		ask('GET', 'https://internal.example.com/api/v1/anything-else', 2)
		await flush()

		expect(JSON.stringify(received)).not.toContain('sk-secret-key')
	})

	it('tells the page world to stop asking where nothing is allowed', async () => {
		const { bridge, received } = connect(makeState(OTHER_ORIGIN, {}))

		bridge.pushGate()
		await flush()

		expect(received).toContainEqual({ k: 'gate', open: false })
	})

	it('opens the gate for an origin that has a permission', async () => {
		const { bridge, received } = connect(
			makeState(ALLOWED_ORIGIN, { [ALLOWED_ORIGIN]: { grantedOn: 1 } }),
		)

		bridge.pushGate()
		await flush()

		expect(received).toContainEqual({ k: 'gate', open: true })
	})
})

describe('injected side honours the gate', () => {
	beforeEach(() => {
		resetBridgeForTests()
		installBridge()
	})

	const handshake = () => {
		const channel = new MessageChannel()
		const asked: unknown[] = []
		channel.port1.onmessage = (evt: MessageEvent) => asked.push(evt.data)
		channel.port1.start?.()
		window.dispatchEvent(
			new MessageEvent('message', { data: { type: BRIDGE_HANDSHAKE }, source: window, ports: [channel.port2] }),
		)
		return { channel, asked }
	}

	it('does not even ask when the gate is closed', async () => {
		const { channel, asked } = handshake()
		channel.port1.postMessage({ k: 'gate', open: false })
		await flush()

		expect(await resolveMock('GET', INTERNAL_URL)).toBeNull()
		// No roundtrip at all: the page goes to the network without waiting.
		expect(asked.filter((m) => (m as { k?: string }).k === 'match')).toEqual([])
	})

	it('asks once the gate is open', async () => {
		const { channel, asked } = handshake()
		channel.port1.onmessage = (evt: MessageEvent) => {
			const message = evt.data as { k?: string; id?: number }
			asked.push(message)
			if (message.k === 'match') channel.port1.postMessage({ k: 'match:res', id: message.id, mock: null })
		}
		channel.port1.postMessage({ k: 'gate', open: true })
		await flush()

		await resolveMock('GET', INTERNAL_URL)

		expect(asked.filter((m) => (m as { k?: string }).k === 'match')).toHaveLength(1)
	})
})
