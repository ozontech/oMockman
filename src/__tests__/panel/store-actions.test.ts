import { describe, it, expect, vi, afterEach } from 'vitest'

import { MethodEnum } from '../../interface'
import {
	addMocks,
	updateMocks,
	deleteMocks,
	getURLMapWithStore,
	getStore,
} from '../../panel/app/service'

import { createEmptyCollectionTree } from '@/interface/collection'
import type { IStore, IMockResponse } from '@/interface'

const createMockStore = (overrides: Partial<IStore> = {}): IStore => ({
	theme: 'light',
	active: false,
	mocks: [],
	totalMocksCreated: 0,
	collectionTree: createEmptyCollectionTree(),
	activityInfo: { promoted: false },
	env: { activeId: 'default', profiles: [{ id: 'default', name: 'default', vars: {} }] },
	...overrides,
})

const createMock = (overrides: Partial<IMockResponse> = {}): IMockResponse => ({
	createdOn: Date.now(),
	description: '',
	method: MethodEnum.GET,
	url: '',
	status: 200,
	active: true,
	response: '{}',
	headers: [],
	id: '',
	...overrides,
})

describe('store-actions: addMocks', () => {
	it('adds a single mock', () => {
		const store = createMockStore()
		const newMock = createMock({ id: 'mock-1', name: 'Test', url: '/api/test' })

		const result = addMocks(store, newMock)

		expect(result.mocks).toHaveLength(1)
		expect(result.mocks[0].id).toBe('mock-1')
		expect(result.collectionTree.root).toHaveLength(1)
	})

	it('adds an array of mocks', () => {
		const store = createMockStore()
		const mocks = [
			createMock({ id: 'mock-1', name: 'Test 1', url: '/api/test1', method: MethodEnum.GET }),
			createMock({ id: 'mock-2', name: 'Test 2', url: '/api/test2', method: MethodEnum.POST, status: 201 }),
		]

		const result = addMocks(store, mocks)

		expect(result.mocks).toHaveLength(2)
		expect(result.totalMocksCreated).toBe(2)
	})

	it('generates a new ID when an existing one is passed', () => {
		const store = createMockStore({
			mocks: [createMock({ id: 'existing', name: 'Existing', url: '/api/existing' })],
		})
		const newMock = createMock({ id: 'existing', name: 'Duplicate', url: '/api/duplicate' })

		const result = addMocks(store, newMock)

		expect(result.mocks).toHaveLength(2)
		expect(result.mocks[1].id).not.toBe('existing')
	})

	it('sets active=true when the store was empty', () => {
		const store = createMockStore({ active: false, mocks: [] })
		const newMock = createMock({ id: 'mock-1', name: 'Test', url: '/api/test' })

		const result = addMocks(store, newMock)

		expect(result.active).toBe(true)
	})

	it('adds a mock to a collection', () => {
		const store = createMockStore({
			collectionTree: {
				root: [{ id: 'col-1', type: 'collection' }],
				nodes: {
					'col-1': { id: 'col-1', name: 'Test Collection', parentId: null, active: true, createdOn: Date.now(), entries: [] },
				},
			},
		})
		const newMock = createMock({ id: 'mock-1', name: 'Test', url: '/api/test', collectionId: 'col-1' })

		const result = addMocks(store, newMock)

		expect(result.collectionTree.nodes['col-1']?.entries).toHaveLength(1)
		expect(result.collectionTree.nodes['col-1']?.entries[0].id).toBe('mock-1')
	})

	it('sets dynamic=true for a dynamic URL', () => {
		const store = createMockStore()
		const newMock = createMock({ id: 'mock-1', name: 'Test', url: '/api/users/:id' })

		const result = addMocks(store, newMock)

		expect(result.mocks[0].dynamic).toBe(true)
	})
})

describe('store-actions: updateMocks', () => {
	it('updates an existing mock', () => {
		const store = createMockStore({
			mocks: [createMock({ id: 'mock-1', name: 'Old', url: '/api/old' })],
		})
		const updates = { id: 'mock-1', name: 'New', url: '/api/new', method: MethodEnum.GET, status: 201, active: false, response: '{"new": true}', headers: [] }

		const result = updateMocks(store, updates as { id: string } & Partial<IMockResponse>)

		expect(result.mocks[0].name).toBe('New')
		expect(result.mocks[0].status).toBe(201)
		expect(result.mocks[0].active).toBe(false)
	})

	it('returns a new store when the mock is not found', () => {
		const store = createMockStore()
		const updates = { id: 'non-existent', name: 'New', url: '/api/new', method: MethodEnum.GET, status: 200, active: true, response: '{}', headers: [] }

		const result = updateMocks(store, updates as { id: string } & Partial<IMockResponse>)

		expect(result).not.toBe(store)
		expect(result.mocks).toEqual(store.mocks)
	})
})

describe('store-actions: deleteMocks', () => {
	it('deletes a mock by ID', () => {
		const store = createMockStore({
			mocks: [
				createMock({ id: 'mock-1', name: 'Mock 1', url: '/api/1' }),
				createMock({ id: 'mock-2', name: 'Mock 2', url: '/api/2' }),
			],
			collectionTree: {
				root: [
					{ id: 'mock-1', type: 'mock' },
					{ id: 'mock-2', type: 'mock' },
				],
				nodes: {},
			},
		})

		const result = deleteMocks(store, 'mock-1')

		expect(result.mocks).toHaveLength(1)
		expect(result.mocks[0].id).toBe('mock-2')
		expect(result.collectionTree.root).toHaveLength(1)
	})
})

describe('store-actions: getURLMapWithStore', () => {
	it('builds urlMap for static URLs', () => {
		const store = createMockStore({
			mocks: [
				createMock({ id: 'mock-1', name: 'Mock 1', url: '/api/users', dynamic: false }),
				createMock({ id: 'mock-2', name: 'Mock 2', url: '/api/users', method: MethodEnum.POST, dynamic: false }),
			],
		})

		const result = getURLMapWithStore(store)

		expect(result.urlMap['/api/users']).toBeDefined()
		expect(result.urlMap['/api/users']?.GET).toHaveLength(1)
		expect(result.urlMap['/api/users']?.POST).toHaveLength(1)
	})

	it('builds dynamicUrlMap for dynamic URLs', () => {
		const store = createMockStore({
			mocks: [
				createMock({ id: 'mock-1', name: 'Mock 1', url: '/api/users/:id', dynamic: true }),
			],
		})

		const result = getURLMapWithStore(store)

		expect(result.dynamicUrlMap).toBeDefined()
		expect(Object.keys(result.dynamicUrlMap).length).toBeGreaterThan(0)
	})

	it('includes inactive mocks in urlMap', () => {
		const store = createMockStore({
			mocks: [
				createMock({ id: 'mock-1', name: 'Active', url: '/api/active', active: true, dynamic: false }),
				createMock({ id: 'mock-2', name: 'Inactive', url: '/api/inactive', active: false, dynamic: false }),
			],
		})

		const result = getURLMapWithStore(store)

		expect(result.urlMap['/api/active']).toBeDefined()
		expect(result.urlMap['/api/inactive']).toBeDefined()
	})

	it('substitutes environment variables into the URL', () => {
		const store = createMockStore({
			mocks: [
				createMock({ id: 'mock-1', name: 'Mock', url: 'http://{BASE_URL}/api/users', dynamic: false }),
			],
			env: {
				activeId: 'prod',
				profiles: [
					{ id: 'dev', name: 'Dev', vars: { BASE_URL: 'localhost:3000' } },
					{ id: 'prod', name: 'Prod', vars: { BASE_URL: 'api.example.com' } },
				],
			},
		})

		const result = getURLMapWithStore(store)

		expect(result.urlMap['http://api.example.com/api/users']).toBeDefined()
	})

	it('keeps separate arrays for different methods on one URL', () => {
		const store = createMockStore({
			mocks: [
				createMock({ id: 'mock-1', name: 'Mock', url: '/api/test', method: MethodEnum.GET, dynamic: false }),
				createMock({ id: 'mock-2', name: 'Mock', url: '/api/test', method: MethodEnum.POST, dynamic: false }),
				createMock({ id: 'mock-3', name: 'Mock', url: '/api/test', method: MethodEnum.PUT, dynamic: false }),
			],
		})

		const result = getURLMapWithStore(store)

		expect(result.urlMap['/api/test']?.GET).toHaveLength(1)
		expect(result.urlMap['/api/test']?.POST).toHaveLength(1)
		expect(result.urlMap['/api/test']?.PUT).toHaveLength(1)
		expect(result.urlMap['/api/test']?.DELETE).toHaveLength(0)
	})
})

describe('store-actions: updateMocks with env', () => {
	it('updates a mock whose URL changed', () => {
		const store = createMockStore({
			mocks: [createMock({ id: 'mock-1', name: 'Old', url: '/api/old' })],
		})
		const updates = { id: 'mock-1', url: '/api/new' }

		const result = updateMocks(store, updates as { id: string } & Partial<IMockResponse>)

		expect(result.mocks[0].url).toBe('/api/new')
	})

	it('updates a mock whose dynamic flag changed', () => {
		const store = createMockStore({
			mocks: [createMock({ id: 'mock-1', name: 'Old', url: '/api/old', dynamic: false })],
		})
		const updates = { id: 'mock-1', url: '/api/users/:id' }

		const result = updateMocks(store, updates as { id: string } & Partial<IMockResponse>)

		expect(result.mocks[0].dynamic).toBe(true)
	})
})

describe('store-actions: deleteMocks edge cases', () => {
	it('deleteMocks does not throw when the mock is not found', () => {
		const store = createMockStore({
			mocks: [createMock({ id: 'mock-1', name: 'Mock', url: '/api/1' })],
		})

		const result = deleteMocks(store, 'non-existent')

		expect(result.mocks).toHaveLength(1)
	})

	it('deletes a mock from a collection', () => {
		const store = createMockStore({
			mocks: [createMock({ id: 'mock-1', name: 'Mock', url: '/api/1', collectionId: 'col-1' })],
			collectionTree: {
				root: [],
				nodes: {
					'col-1': { id: 'col-1', name: 'Col', parentId: null, active: true, createdOn: Date.now(), entries: [{ id: 'mock-1', type: 'mock' }] },
				},
			},
		})

		const result = deleteMocks(store, 'mock-1')

		expect(result.mocks).toHaveLength(0)
		expect(result.collectionTree.nodes['col-1']?.entries).toHaveLength(0)
	})
})

describe('store-actions: getStore', () => {
	afterEach(() => {
		vi.unstubAllGlobals()
		vi.clearAllMocks()
	})

	it('reads the store from chrome.storage', async () => {
		const mockStorageData = {
			'mockman.extension.main.db': {
				theme: 'dark',
				active: true,
				mocks: [],
				totalMocksCreated: 0,
				collectionTree: { root: [], nodes: {} },
				activityInfo: { promoted: false },
				env: { activeId: 'default', profiles: [{ id: 'default', name: 'default', vars: {} }] },
			},
		}

		const getSpy = vi.fn().mockImplementation((keys, callback) => {
			callback(mockStorageData)
		})

		vi.stubGlobal('chrome', {
			storage: {
				local: { get: getSpy },
			},
		})

		const result = await getStore()

		expect(getSpy).toHaveBeenCalled()
		expect(result.store.theme).toBe('dark')
		expect(result.store.active).toBe(true)
	})

	it('getStore returns defaults for empty storage', async () => {
		const getSpy = vi.fn().mockImplementation((keys, callback) => {
			callback({})
		})

		vi.stubGlobal('chrome', {
			storage: {
				local: { get: getSpy },
			},
		})

		const result = await getStore()

		expect(result.store.theme).toBe('light')
		expect(result.store.active).toBe(false)
		expect(result.store.env?.profiles).toHaveLength(1)
	})
})
