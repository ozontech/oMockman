import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { IStore } from '@/interface/mock'
import { useChromeStore } from '@/panel/app/store/use-mock-store'
import type * as ActualModule from '@/panel/app/service'

const EXPANDED_KEY = 'mockman.expandedCollections'

const getStore = vi.fn()

vi.mock('@/panel/app/service', async (importOriginal) => {
	const actual = await importOriginal<typeof ActualModule>()
	return { ...actual, getStore: () => getStore() }
})

const store = (nodeIds: string[] = []): IStore => ({
	theme: 'light',
	active: false,
	mocks: [],
	totalMocksCreated: 0,
	activityInfo: { promoted: false },
	env: { activeId: 'default', profiles: [{ id: 'default', name: 'default', vars: {} }] },
	collectionTree: {
		root: nodeIds.map((id) => ({ id, type: 'collection' as const })),
		nodes: Object.fromEntries(nodeIds.map((id) => [id, {
			id, name: id, parentId: null, active: true, createdOn: 1, entries: [],
		}])),
	},
} as IStore)

const properties = (nodeIds: string[] = []) => ({ store: store(nodeIds), urlMap: {}, dynamicUrlMap: {} })

describe('useChromeStore', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		window.localStorage.clear()
		useChromeStore.setState({ ...properties(), selectedMock: undefined, updateCounter: 0, expandedCollections: [] })
	})

	it('expands every collection when nothing was ever persisted', async () => {
		// No persisted value and no prior selection: everything starts expanded.
		useChromeStore.setState({ expandedCollections: undefined as unknown as string[] })
		getStore.mockResolvedValue(properties(['c1', 'c2']))

		await useChromeStore.getState().init()

		expect(useChromeStore.getState().expandedCollections.sort()).toEqual(['c1', 'c2'])
		expect(window.localStorage.getItem(EXPANDED_KEY)).toBe(JSON.stringify(['c1', 'c2']))
	})

	it('restores the expanded collections persisted earlier', async () => {
		window.localStorage.setItem(EXPANDED_KEY, JSON.stringify(['c2']))
		getStore.mockResolvedValue(properties(['c1', 'c2']))

		await useChromeStore.getState().init()

		expect(useChromeStore.getState().expandedCollections).toEqual(['c2'])
	})

	it('ignores persisted ids for collections that are gone', async () => {
		window.localStorage.setItem(EXPANDED_KEY, JSON.stringify(['stale', 'c1']))
		getStore.mockResolvedValue(properties(['c1']))

		await useChromeStore.getState().init()

		expect(useChromeStore.getState().expandedCollections).toEqual(['c1'])
	})

	it('ignores malformed persisted state and keeps the current selection', async () => {
		window.localStorage.setItem(EXPANDED_KEY, 'not json')
		useChromeStore.setState({ expandedCollections: ['c1'] })
		getStore.mockResolvedValue(properties(['c1']))

		await useChromeStore.getState().init()

		expect(useChromeStore.getState().expandedCollections).toEqual(['c1'])
	})

	it('drops stale expanded ids when the store is replaced', () => {
		useChromeStore.setState({ expandedCollections: ['c1', 'c2'] })

		useChromeStore.getState().setStoreProperties(properties(['c1']))

		expect(useChromeStore.getState().expandedCollections).toEqual(['c1'])
		expect(useChromeStore.getState().updateCounter).toBe(1)
	})

	it('tracks the selected mock', () => {
		useChromeStore.getState().setSelectedMock({ id: 'm-1' })
		expect(useChromeStore.getState().selectedMock).toEqual({ id: 'm-1' })

		useChromeStore.getState().setSelectedMock(undefined)
		expect(useChromeStore.getState().selectedMock).toBeUndefined()
	})

	it('bumps the update counter on demand', () => {
		const before = useChromeStore.getState().updateCounter
		useChromeStore.getState().forceUpdate()
		expect(useChromeStore.getState().updateCounter).toBe(before + 1)
	})

	it('persists a new expanded selection', () => {
		useChromeStore.getState().setExpandedCollections(['c9'])

		expect(useChromeStore.getState().expandedCollections).toEqual(['c9'])
		expect(window.localStorage.getItem(EXPANDED_KEY)).toBe(JSON.stringify(['c9']))
	})
})
