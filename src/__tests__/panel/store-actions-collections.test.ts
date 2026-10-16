import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MethodEnum } from '../../interface'
import {
	applyCollectionMove,
	createCollection,
	deleteCollectionDeep,
	importCollectionBundle,
	renameCollection,
	setCollectionBranchActive,
} from '../../panel/app/service'

import { createEmptyCollectionTree } from '@/interface/collection'
import type { ICollectionTree } from '@/interface/collection'
import type { IMockResponse, IStore } from '@/interface'
import type { MockmanExportBundle } from '@/services/mock-import'

const makeMock = (overrides: Partial<IMockResponse> = {}): IMockResponse => ({
	id: 'm-1',
	name: 'mock',
	description: '',
	method: MethodEnum.GET,
	url: 'https://example.com/api',
	status: 200,
	response: '{}',
	active: true,
	createdOn: 1,
	collectionId: null,
	...overrides,
} as IMockResponse)

const makeStore = (overrides: Partial<IStore> = {}): IStore => ({
	theme: 'light',
	active: false,
	mocks: [],
	totalMocksCreated: 0,
	collectionTree: createEmptyCollectionTree(),
	activityInfo: { promoted: false },
	env: { activeId: 'default', profiles: [{ id: 'default', name: 'default', vars: {} }] },
	...overrides,
})

/** Store with one collection holding one mock, plus a nested child collection. */
const makeTreeStore = (): IStore => {
	const tree: ICollectionTree = {
		root: [{ id: 'col-1', type: 'collection' }],
		nodes: {
			'col-1': {
				id: 'col-1',
				name: 'Parent',
				parentId: null,
				active: true,
				createdOn: 1,
				entries: [{ id: 'm-1', type: 'mock' }, { id: 'col-2', type: 'collection' }],
			},
			'col-2': {
				id: 'col-2',
				name: 'Child',
				parentId: 'col-1',
				active: true,
				createdOn: 1,
				entries: [{ id: 'm-2', type: 'mock' }],
			},
		},
	}
	return makeStore({
		collectionTree: tree,
		mocks: [
			makeMock({ id: 'm-1', collectionId: 'col-1' }),
			makeMock({ id: 'm-2', collectionId: 'col-2' }),
			makeMock({ id: 'm-3', collectionId: null }),
		],
		totalMocksCreated: 3,
	})
}

describe('createCollection', () => {
	it('adds a root collection at the top', () => {
		const next = createCollection(makeStore(), { name: 'New' })
		const ids = Object.keys(next.collectionTree.nodes)

		expect(ids).toHaveLength(1)
		expect(next.collectionTree.nodes[ids[0]]).toMatchObject({ name: 'New', parentId: null, active: true })
		expect(next.collectionTree.root[0]).toEqual({ id: ids[0], type: 'collection' })
	})

	it('nests a collection under a parent', () => {
		const store = makeTreeStore()
		const next = createCollection(store, { name: 'Nested', parentId: 'col-1' })
		const created = Object.values(next.collectionTree.nodes).find((node) => node.name === 'Nested')

		expect(created?.parentId).toBe('col-1')
		expect(next.collectionTree.nodes['col-1'].entries).toContainEqual({ id: created?.id, type: 'collection' })
	})
})

describe('renameCollection', () => {
	it('renames an existing collection', () => {
		const next = renameCollection(makeTreeStore(), 'col-1', 'Renamed')
		expect(next.collectionTree.nodes['col-1'].name).toBe('Renamed')
	})

	it('is a no-op for an unknown collection', () => {
		const store = makeTreeStore()
		expect(renameCollection(store, 'nope', 'x')).toBe(store)
	})
})

describe('setCollectionBranchActive', () => {
	it('disables the branch and turns off every mock in it', () => {
		const next = setCollectionBranchActive(makeTreeStore(), 'col-1', false)

		expect(next.collectionTree.nodes['col-1'].active).toBe(false)
		expect(next.collectionTree.nodes['col-2'].active).toBe(false)
		expect(next.mocks.map((m) => [m.id, m.active])).toEqual([['m-1', false], ['m-2', false], ['m-3', true]])
	})

	it('re-enables the branch and leaves its mocks off, to be turned on one by one', () => {
		const enabled = setCollectionBranchActive(setCollectionBranchActive(makeTreeStore(), 'col-1', false), 'col-1', true)

		expect(enabled.collectionTree.nodes['col-1'].active).toBe(true)
		expect(enabled.collectionTree.nodes['col-2'].active).toBe(true)
		expect(enabled.mocks.map((m) => [m.id, m.active])).toEqual([['m-1', false], ['m-2', false], ['m-3', true]])
	})

	it('is a no-op for an unknown collection', () => {
		const store = makeTreeStore()
		expect(setCollectionBranchActive(store, 'nope', false)).toBe(store)
	})
})

describe('deleteCollectionDeep', () => {
	it('deletes the branch with its mocks', () => {
		const next = deleteCollectionDeep(makeTreeStore(), 'col-1')

		expect(Object.keys(next.collectionTree.nodes)).toEqual([])
		expect(next.mocks.map((m) => m.id)).toEqual(['m-3'])
		expect(next.collectionTree.root).toEqual([])
	})

	it('deletes only the nested branch when asked', () => {
		const next = deleteCollectionDeep(makeTreeStore(), 'col-2')

		expect(Object.keys(next.collectionTree.nodes)).toEqual(['col-1'])
		expect(next.collectionTree.nodes['col-1'].entries).toEqual([{ id: 'm-1', type: 'mock' }])
		expect(next.mocks.map((m) => m.id)).toEqual(['m-1', 'm-3'])
	})
})

describe('applyCollectionMove', () => {
	it('moves a mock into a collection and updates its owner', () => {
		const next = applyCollectionMove(makeTreeStore(), {
			entryId: 'm-3',
			entryType: 'mock',
			from: { containerId: null, index: 0 },
			to: { containerId: 'col-2', index: 0 },
		})

		expect(next.mocks.find((m) => m.id === 'm-3')?.collectionId).toBe('col-2')
		expect(next.collectionTree.nodes['col-2'].entries[0]).toEqual({ id: 'm-3', type: 'mock' })
	})

	it('moves a mock back to the root', () => {
		const next = applyCollectionMove(makeTreeStore(), {
			entryId: 'm-1',
			entryType: 'mock',
			from: { containerId: null, index: 0 },
			to: { containerId: null, index: 0 },
		})

		expect(next.mocks.find((m) => m.id === 'm-1')?.collectionId).toBeNull()
		expect(next.collectionTree.root).toContainEqual({ id: 'm-1', type: 'mock' })
	})

	it('moves a collection under another collection', () => {
		const store = createCollection(makeTreeStore(), { name: 'Third' })
		const thirdId = Object.values(store.collectionTree.nodes).find((n) => n.name === 'Third')?.id as string

		const next = applyCollectionMove(store, {
			entryId: thirdId,
			entryType: 'collection',
			from: { containerId: null, index: 0 },
			to: { containerId: 'col-1', index: 0 },
		})

		expect(next.collectionTree.nodes[thirdId].parentId).toBe('col-1')
	})

	it('refuses to move a collection into itself', () => {
		const store = makeTreeStore()
		const next = applyCollectionMove(store, {
			entryId: 'col-1',
			entryType: 'collection',
			from: { containerId: null, index: 0 },
			to: { containerId: 'col-1', index: 0 },
		})
		expect(next.collectionTree).toEqual(store.collectionTree)
	})

	it('refuses to move a collection into its own descendant', () => {
		const store = makeTreeStore()
		const next = applyCollectionMove(store, {
			entryId: 'col-1',
			entryType: 'collection',
			from: { containerId: null, index: 0 },
			to: { containerId: 'col-2', index: 0 },
		})
		expect(next.collectionTree).toEqual(store.collectionTree)
	})

	it('ignores an unknown entry type', () => {
		const store = makeTreeStore()
		const next = applyCollectionMove(store, {
			entryId: 'x',
			entryType: 'unknown' as never,
			from: { containerId: null, index: 0 },
			to: { containerId: null, index: 0 },
		})
		expect(next).toEqual(store)
	})
})

describe('importCollectionBundle', () => {
	const bundle = (overrides: Partial<MockmanExportBundle> = {}): MockmanExportBundle => ({
		type: 'mockman.export',
		version: 1,
		mocks: [makeMock({ id: 'imported-1', collectionId: 'imported-col' })],
		collectionTree: {
			root: [{ id: 'imported-col', type: 'collection' }],
			nodes: {
				'imported-col': {
					id: 'imported-col',
					name: 'Imported',
					parentId: null,
					active: true,
					createdOn: 1,
					entries: [{ id: 'imported-1', type: 'mock' }],
				},
			},
		},
		...overrides,
	})

	it('imports mocks and the collection tree', () => {
		const next = importCollectionBundle(makeStore(), bundle())

		expect(next.mocks).toHaveLength(1)
		expect(next.totalMocksCreated).toBe(1)
		expect(next.collectionTree.nodes['imported-col'].name).toBe('Imported')
		expect(next.collectionTree.root).toContainEqual({ id: 'imported-col', type: 'collection' })
	})

	it('brings the scenario along and points its rules at the renamed mocks', () => {
		const store = makeTreeStore()
		const withScenario = bundle({
			mocks: [makeMock({ id: 'm-1', collectionId: 'imported-col' })],
			collectionTree: {
				root: [{ id: 'imported-col', type: 'collection' }],
				nodes: {
					'imported-col': {
						id: 'imported-col',
						name: 'Imported',
						parentId: null,
						active: true,
						createdOn: 1,
						entries: [{ id: 'm-1', type: 'mock' }],
						scenario: {
							enabled: true,
							rules: [
								{ id: 'r1', method: 'GET', url: '/a', respond: { mockId: 'm-1' } },
								{ id: 'r2', method: 'GET', url: '/b', respond: { mockId: 'not-in-bundle' } },
								{ id: 'r3', method: 'POST', url: '/c', respond: { network: true } },
							],
						},
					},
				},
			},
		})

		const next = importCollectionBundle(store, withScenario)

		const imported = Object.values(next.collectionTree.nodes).find((node) => node.name === 'Imported')
		const renamed = next.mocks.find((m) => m.collectionId === imported?.id)
		expect(renamed?.id).not.toBe('m-1')
		expect(imported?.scenario?.rules).toEqual([
			{ id: 'r1', method: 'GET', url: '/a', respond: { mockId: renamed?.id } },
			{ id: 'r3', method: 'POST', url: '/c', respond: { network: true } },
		])
	})

	it('keeps existing entries', () => {
		const store = makeTreeStore()
		const next = importCollectionBundle(store, bundle())

		expect(next.mocks).toHaveLength(4)
		expect(next.collectionTree.nodes['col-1']).toBeDefined()
		expect(next.totalMocksCreated).toBe(4)
	})

	it('renames ids that collide with existing ones', () => {
		const store = makeTreeStore()
		const colliding = bundle({
			mocks: [makeMock({ id: 'm-1', collectionId: 'col-1' })],
			collectionTree: {
				root: [{ id: 'col-1', type: 'collection' }],
				nodes: {
					'col-1': {
						id: 'col-1',
						name: 'Imported clash',
						parentId: null,
						active: true,
						createdOn: 1,
						entries: [{ id: 'm-1', type: 'mock' }],
					},
				},
			},
		})

		const next = importCollectionBundle(store, colliding)

		// The original collection keeps its name and the import gets a new id.
		expect(next.collectionTree.nodes['col-1'].name).toBe('Parent')
		const clash = Object.values(next.collectionTree.nodes).find((node) => node.name === 'Imported clash')
		expect(clash).toBeDefined()
		expect(clash?.id).not.toBe('col-1')
		// Both mocks survive under different ids.
		expect(next.mocks.filter((m) => m.id === 'm-1')).toHaveLength(1)
		expect(next.mocks).toHaveLength(4)
	})

	it('puts mocks that no collection references at the root', () => {
		const next = importCollectionBundle(makeStore(), bundle({
			mocks: [makeMock({ id: 'loose', collectionId: null })],
			collectionTree: { root: [], nodes: {} },
		}))

		expect(next.collectionTree.root).toContainEqual({ id: 'loose', type: 'mock' })
	})

	it('marks dynamic urls as dynamic', () => {
		const next = importCollectionBundle(makeStore(), bundle({
			mocks: [makeMock({ id: 'dyn', url: 'https://example.com/users/:id', collectionId: null })],
			collectionTree: { root: [], nodes: {} },
		}))

		expect(next.mocks[0].dynamic).toBe(true)
	})

	it('creates a placeholder node for a referenced but missing collection', () => {
		const next = importCollectionBundle(makeStore(), bundle({
			mocks: [],
			collectionTree: { root: [{ id: 'ghost', type: 'collection' }], nodes: {} },
		}))

		expect(next.collectionTree.nodes['ghost']).toMatchObject({ name: 'Collection', parentId: null })
	})

	it('drops entries pointing at mocks that are not in the bundle', () => {
		const next = importCollectionBundle(makeStore(), bundle({
			mocks: [],
			collectionTree: {
				root: [{ id: 'imported-col', type: 'collection' }],
				nodes: {
					'imported-col': {
						id: 'imported-col',
						name: 'Imported',
						parentId: null,
						active: true,
						createdOn: 1,
						entries: [{ id: 'missing-mock', type: 'mock' }],
					},
				},
			},
		}))

		expect(next.collectionTree.nodes['imported-col'].entries).toEqual([])
	})
})

describe('refreshContentStore', () => {
	beforeEach(() => {
		vi.stubGlobal('chrome', {
			runtime: {
				sendMessage: vi.fn(),
				connect: vi.fn(() => ({ postMessage: vi.fn(), onMessage: { addListener: vi.fn() }, onDisconnect: { addListener: vi.fn() } })),
				onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
				lastError: undefined,
			},
			tabs: { sendMessage: vi.fn() },
		})
	})

	afterEach(() => vi.unstubAllGlobals())

	it('notifies the content script for a given tab', async () => {
		const { refreshContentStore } = await import('../../panel/app/service')
		refreshContentStore(7)
		expect(chrome.runtime.sendMessage).toHaveBeenCalled()
	})

	it('notifies without a tab id too', async () => {
		const { refreshContentStore } = await import('../../panel/app/service')
		refreshContentStore()
		expect(chrome.runtime.sendMessage).toHaveBeenCalled()
	})
})
