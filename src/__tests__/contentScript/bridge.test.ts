import { beforeEach, describe, expect, it, vi } from 'vitest'

import { InjectBridge } from '@/contentScript/bridge'
import { ScenarioRuntime } from '@/contentScript/scenario'
import type { ScenarioHit } from '@/contentScript/scenario'
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
		/** Any message from the page's side. */
		post: (message: unknown) => channel.port2.postMessage(message),
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

	it('sends a request-only rule to the network without the mock body', async () => {
		const rule = {
			...mockEntry,
			apply: { responseBody: false, responseHeaders: false, requestBody: true },
			requestPatch: { mode: 'replace', body: '{"a":1}' },
		}
		const { injectSide } = build(makeState({ mocks: [rule] } as never))

		injectSide.ask('GET', 'https://example.com/api/users')
		await flush()

		const answer = injectSide.received[0] as { mock: { response: string; network?: unknown } }
		expect(answer.mock.network).toEqual({ requestPatch: { mode: 'replace', body: '{"a":1}' } })
		expect(answer.mock.response).toBe('')
	})

	it('treats a rule saved with only a patch as request-only', async () => {
		const legacy = { ...mockEntry, requestPatch: { mode: 'merge', body: '{"a":1}' } }
		const { injectSide } = build(makeState({ mocks: [legacy] } as never))

		injectSide.ask('GET', 'https://example.com/api/users')
		await flush()

		const answer = injectSide.received[0] as { mock: { network?: unknown } }
		expect(answer.mock.network).toEqual({ requestPatch: { mode: 'merge', body: '{"a":1}' } })
	})

	it('serves the response and ignores a request body draft', async () => {
		const rule = {
			...mockEntry,
			apply: { responseBody: true, responseHeaders: false, requestBody: false },
			requestPatch: { mode: 'replace', body: 'draft' },
		}
		const { injectSide } = build(makeState({ mocks: [rule] } as never))

		injectSide.ask('GET', 'https://example.com/api/users')
		await flush()

		const answer = injectSide.received[0] as { mock: { status: number; headers: unknown[]; network?: unknown } }
		expect(answer.mock.status).toBe(201)
		expect(answer.mock.headers).toEqual([])
		expect(answer.mock.network).toBeUndefined()
	})

	it('sends headers-only rules to the network with the headers to set', async () => {
		const rule = { ...mockEntry, apply: { responseBody: false, responseHeaders: true, requestBody: false } }
		const { injectSide } = build(makeState({ mocks: [rule] } as never))

		injectSide.ask('GET', 'https://example.com/api/users')
		await flush()

		const answer = injectSide.received[0] as { mock: { network?: unknown } }
		expect(answer.mock.network).toEqual({ responseHeaders: [{ name: 'content-type', value: 'application/json' }] })
	})

	it('answers null for a rule with everything switched off', async () => {
		const rule = { ...mockEntry, apply: { responseBody: false, responseHeaders: false, requestBody: false } }
		const { injectSide } = build(makeState({ mocks: [rule] } as never))

		injectSide.ask('GET', 'https://example.com/api/users')
		await flush()

		expect((injectSide.received[0] as { mock: unknown }).mock).toBeNull()
	})

	describe('sendRequest', () => {
		const request = { method: 'POST', url: 'https://example.com/api/orders', headers: [], body: '{}', withCredentials: true }

		it('asks the page to send and resolves with its answer', async () => {
			const { bridge, injectSide } = build()
			injectSide.post({ k: 'ack' })
			await flush()

			const pending = bridge.sendRequest(request)
			await flush()
			const sent = injectSide.received.find((message) => message.k === 'send') as unknown as { id: number; request: unknown }
			expect(sent.request).toEqual(request)

			injectSide.post({ k: 'send:res', id: sent.id, result: { ok: true, status: 204 } })
			await expect(pending).resolves.toMatchObject({ ok: true, status: 204 })
		})

		it('refuses a site the user did not allow', async () => {
			const { bridge } = build(makeState({}, 'https://evil.example'))

			await expect(bridge.sendRequest(request)).resolves.toMatchObject({ ok: false, reason: 'not_allowed' })
		})

		it('says so when the page is not connected yet', async () => {
			const { bridge } = build()

			await expect(bridge.sendRequest(request)).resolves.toMatchObject({ ok: false, reason: 'unavailable' })
		})
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

	describe('scenario', () => {
		const QUERY = 'https://example.com/api/users'
		const COMPLETE = 'https://example.com/api/complete'
		const second = { ...mockEntry, id: 'mock-2', response: '{"users":[1]}', active: false, collectionId: 'c1' }
		const scenarioState = () => makeState({
			mocks: [{ ...mockEntry, collectionId: 'c1' }, second],
			sitePermissions: { [PAGE_ORIGIN]: { grantedOn: 1 } },
			collectionTree: {
				root: [{ id: 'c1', type: 'collection' }],
				nodes: {
					c1: {
						id: 'c1', name: 'Flow', parentId: null, active: true, createdOn: 1, entries: [],
						scenario: {
							enabled: true,
							rules: [
								{ id: 'r1', method: 'POST', url: COMPLETE, respond: { network: true } },
								{ id: 'r2', method: 'GET', url: QUERY, respond: { mockId: 'mock-1' } },
								{ id: 'r3', method: 'GET', url: QUERY, respond: { mockId: 'mock-2' } },
							],
						},
					},
				},
			},
		} as never)

		const buildWithScenario = () => {
			const hits: Array<{ logId?: string; hit: ScenarioHit }> = []
			const state = scenarioState()
			const bridge = new InjectBridge({
				getState: () => state,
				onLog: () => undefined,
				scenarios: new ScenarioRuntime(),
				onScenarioHit: (logId, hit) => hits.push({ logId, hit }),
			})
			const injectSide = createInjectSide()
			bridge.attach(injectSide.port)
			return { injectSide, hits }
		}

		it('serves the plain mock, the network and the call-2 mock, and never lets the page cache "not mocked"', async () => {
			const { injectSide, hits } = buildWithScenario()

			injectSide.ask('GET', QUERY, 1)
			await flush()
			injectSide.post({ k: 'match', id: 2, method: 'POST', url: COMPLETE, logId: 'log-2' })
			await flush()
			injectSide.ask('GET', QUERY, 3)
			await flush()

			const [before, complete, after] = injectSide.received as Array<{ mock: { response: string } | null; noCache?: boolean }>
			expect(before).toMatchObject({ noCache: true, mock: { response: '{"users":[]}' } })
			expect(complete).toMatchObject({ mock: null, noCache: true })
			expect(after).toMatchObject({ noCache: true, mock: { response: '{"users":[1]}' } })

			expect(hits.map((h) => [h.logId, h.hit.callNumber])).toEqual([[undefined, 1], ['log-2', 1], [undefined, 2]])
		})

		it('leaves endpoints outside the scenario cacheable', async () => {
			const { injectSide } = buildWithScenario()

			injectSide.ask('GET', 'https://example.com/api/other')
			await flush()

			expect(injectSide.received[0]).toEqual({ k: 'match:res', id: 1, mock: null })
		})
	})
})
