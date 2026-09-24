import { beforeEach, describe, expect, it, vi } from 'vitest'

import { InjectBridge } from '@/contentScript/bridge'
import type { BridgeContentMessage } from '@/interface/bridge'
import type { IStore } from '@/interface/mock'
import { MethodEnum } from '@/interface/network'

const mockEntry = {
	id: 'mock-1',
	name: 'users',
	method: MethodEnum.GET,
	url: 'https://example.com/api/users',
	status: 201,
	response: '{"users":[]}',
	headers: [
		{ name: 'content-type', value: 'application/json' },
		{ name: 'content-length', value: '999' },
		{ name: 'content-encoding', value: 'gzip' },
	],
	delay: 50,
	active: true,
	createdOn: 1,
}

const PAGE_ORIGIN = 'https://app.example.com'

/** The mock sits outside any collection, so the origin has to allow the root. */
const makeState = (overrides: Partial<IStore> = {}, origin: string | null = PAGE_ORIGIN) => ({
	store: {
		active: true,
		mocks: [mockEntry],
		sitePermissions: { [PAGE_ORIGIN]: { grantedOn: 1 } },
		...overrides,
	} as unknown as IStore,
	urlMap: { 'https://example.com/api/users': { GET: ['mocks[0]'] } },
	dynamicUrlMap: {},
	origin,
}) as never

const flush = async (turns = 5): Promise<void> => {
	for (let i = 0; i < turns; i += 1) {
		await new Promise((resolve) => setTimeout(resolve, 0))
	}
}

const createInjectSide = () => {
	const channel = new MessageChannel()
	const received: BridgeContentMessage[] = []
	channel.port2.onmessage = (evt: MessageEvent) => received.push(evt.data as BridgeContentMessage)
	channel.port2.start?.()
	return {
		port: channel.port1,
		received,
		ask: (method: string, url: string, id = 1) => channel.port2.postMessage({ k: 'match', id, method, url }),
		log: (message: unknown) => channel.port2.postMessage({ k: 'log', id: 'log-1', message }),
	}
}

describe('contentScript/bridge', () => {
	let logs: unknown[]

	beforeEach(() => {
		logs = []
	})

	const build = (state: never = makeState()) => {
		const bridge = new InjectBridge({ getState: () => state, onLog: (_id, message) => logs.push(message) })
		const injectSide = createInjectSide()
		bridge.attach(injectSide.port)
		return { bridge, injectSide }
	}

	it('answers a matched request without leaking the mock url', async () => {
		const { injectSide } = build()

		injectSide.ask('GET', 'https://example.com/api/users?page=2')
		await flush()

		expect(injectSide.received).toEqual([
			{
				k: 'match:res',
				id: 1,
				mock: {
					status: 201,
					response: '{"users":[]}',
					headers: [{ name: 'content-type', value: 'application/json' }],
					delay: 50,
				},
			},
		])
	})

	it('answers null for an unknown request', async () => {
		const { injectSide } = build()

		injectSide.ask('GET', 'https://example.com/api/other')
		await flush()

		expect(injectSide.received[0]).toEqual({ k: 'match:res', id: 1, mock: null })
	})

	it('answers null while mocking is off', async () => {
		const { injectSide } = build(makeState({ active: false }))

		injectSide.ask('GET', 'https://example.com/api/users')
		await flush()

		expect(injectSide.received[0]).toEqual({ k: 'match:res', id: 1, mock: null })
	})

	it('answers null for an inactive mock', async () => {
		const { injectSide } = build(makeState({ mocks: [{ ...mockEntry, active: false }] as never }))

		injectSide.ask('GET', 'https://example.com/api/users')
		await flush()

		expect(injectSide.received[0]).toEqual({ k: 'match:res', id: 1, mock: null })
	})

	it('forwards logs to the host', async () => {
		const { injectSide } = build()

		injectSide.log({ request: { url: 'https://example.com/api/users' } })
		await flush()

		expect(logs).toEqual([{ request: { url: 'https://example.com/api/users' } }])
	})

	it('bumps the epoch and pushes the logging flag', async () => {
		const { bridge, injectSide } = build()

		bridge.bumpEpoch()
		bridge.bumpEpoch()
		bridge.setLogging(true)
		await flush()

		// Every epoch bump re-sends the verdict: a permission granted just now takes effect
		// without a reload.
		expect(injectSide.received).toEqual([
			{ k: 'epoch', epoch: 1 },
			{ k: 'gate', open: true },
			{ k: 'epoch', epoch: 2 },
			{ k: 'gate', open: true },
			{ k: 'logging', enabled: true },
		])
	})

	it('offers the port to the main world with no payload', () => {
		const postMessage = vi.spyOn(window, 'postMessage').mockImplementation(() => void 0)
		const bridge = new InjectBridge({ getState: () => makeState(), onLog: () => void 0 })

		bridge.connect()

		expect(postMessage).toHaveBeenCalledWith(
			{ type: 'MOCKMAN_PORT' },
			'*',
			[expect.any(MessagePort)],
		)
		postMessage.mockRestore()
	})
})
