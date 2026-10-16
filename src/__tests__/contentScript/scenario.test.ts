import { describe, expect, it } from 'vitest'

import { ScenarioRuntime } from '@/contentScript/scenario'
import type { ICollectionScenario } from '@/interface/collection'
import type { IMockResponse, IStore } from '@/interface/mock'
import { MethodEnum } from '@/interface/network'

const API = 'https://wms.example/v3/tasks'
const mock = (id: string, name: string): IMockResponse => ({
	id, name, method: MethodEnum.POST, url: `${API}/query`, status: 200, response: `{"${id}":true}`,
	headers: [], active: true, description: '', collectionId: 'c1',
})

/** The first list has a task, every later one is empty; "complete" goes to the server. */
const flow: ICollectionScenario = {
	enabled: true,
	rules: [
		{ id: 'r1', method: 'POST', url: `${API}/query`, respond: { mockId: 'list' } },
		{ id: 'r2', method: 'POST', url: `${API}/query`, respond: { mockId: 'empty' } },
		{ id: 'r3', method: 'POST', url: `${API}/complete`, respond: { network: true } },
	],
}

const makeStore = (scenario: ICollectionScenario = flow, active = true): IStore => ({
	active: true,
	mocks: [mock('list', 'Список'), mock('empty', 'Пустой')],
	collectionTree: {
		root: [{ id: 'c1', type: 'collection' }],
		nodes: { c1: { id: 'c1', name: 'Задания', parentId: null, active, createdOn: 1, entries: [], scenario } },
	},
} as unknown as IStore)

describe('contentScript/scenario', () => {
	it('answers one endpoint differently call after call', () => {
		const runtime = new ScenarioRuntime()
		const store = makeStore()

		expect(runtime.match(store, 'POST', `${API}/query`).hit).toMatchObject({ callNumber: 1, mock: { id: 'list' } })
		expect(runtime.match(store, 'POST', `${API}/query?page=2`).hit).toMatchObject({ callNumber: 2, mock: { id: 'empty' } })
		// The endpoint's last rule answers every later call too.
		expect(runtime.match(store, 'POST', `${API}/query`).hit).toMatchObject({ callNumber: 3, mock: { id: 'empty' } })
	})

	it('lets the real request through, and counts every endpoint on its own', () => {
		const runtime = new ScenarioRuntime()
		const store = makeStore()

		expect(runtime.match(store, 'post', `${API}/complete?id=1`).hit).toMatchObject({ callNumber: 1, mock: null })
		expect(runtime.match(store, 'POST', `${API}/query`).hit?.mock?.id).toBe('list')
	})

	it('marks scenario endpoints so the page keeps asking, and leaves the rest alone', () => {
		const runtime = new ScenarioRuntime()
		expect(runtime.match(makeStore(), 'POST', `${API}/complete`).tracked).toBe(true)
		expect(runtime.match(makeStore(), 'GET', `${API}/query`)).toEqual({ hit: undefined, tracked: false })
	})

	it('starts the count over on reset', () => {
		const runtime = new ScenarioRuntime()
		const store = makeStore()
		runtime.match(store, 'POST', `${API}/query`)

		runtime.reset('c1')
		expect(runtime.match(store, 'POST', `${API}/query`).hit?.mock?.id).toBe('list')

		runtime.reset()
		expect(runtime.match(store, 'POST', `${API}/query`).hit?.mock?.id).toBe('list')
	})

	it('does nothing for a switched-off scenario or an inactive collection', () => {
		const runtime = new ScenarioRuntime()
		expect(runtime.match(makeStore({ ...flow, enabled: false }), 'POST', `${API}/query`).tracked).toBe(false)
		expect(runtime.match(makeStore(flow, false), 'POST', `${API}/query`).tracked).toBe(false)
	})

	it('matches env templates and path params like a mock does', () => {
		const runtime = new ScenarioRuntime()
		const store = makeStore({
			enabled: true,
			rules: [{ id: 'a', method: 'GET', url: '{BASE}/tasks/:id', respond: { mockId: 'list' } }],
		})
		;(store as unknown as { env: unknown }).env = { activeId: 'e', profiles: [{ id: 'e', name: 'e', vars: { BASE: 'https://wms.example' } }] }

		expect(runtime.match(store, 'GET', 'https://wms.example/tasks/42?x=1').hit?.mock?.id).toBe('list')
		expect(runtime.match(store, 'GET', 'https://wms.example/other/42').hit).toBeUndefined()
	})
})
