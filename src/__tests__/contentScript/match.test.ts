import { describe, it, expect, vi } from 'vitest'

import { MethodEnum } from '@/interface'
import type { IDynamicURLMap, IMockResponse, IStore, IURLMap } from '@/interface'
import type { ICollectionTree } from '@/interface/collection'
import { getMockPaths, getActiveMockWithPath } from '@/contentScript'
import type { IDynamicRoute } from '@/contentScript'

describe('getMockPaths', () => {
	it('returns a static match by URL and method', () => {
		const url = 'https://api.example.com/users'
		const method = 'GET'
		const maps = {
			urlMap: {
				'https://api.example.com/users': {
					GET: ['mocks.0'],
				},
			} as IURLMap,
			dynamicUrlMap: {} as IDynamicURLMap,
		}

		const result = getMockPaths(url, method, maps)
		expect(result).toEqual(['mocks.0'])
	})

	it('prefers a static match over a dynamic one', () => {
		const url = 'https://api.example.com/users'
		const method = 'GET'
		const dynamicRoute: IDynamicRoute = {
			method: 'GET',
			url: 'https://api.example.com/:resource',
			getterKey: 'dynamic.0',
			match: vi.fn().mockReturnValue(true),
		}
		const maps = {
			urlMap: {
				'https://api.example.com/users': {
					GET: ['mocks.0'],
				},
			} as IURLMap,
			dynamicUrlMap: {
				4: [dynamicRoute],
			} as IDynamicURLMap,
		}

		const result = getMockPaths(url, method, maps)
		expect(result).toEqual(['mocks.0'])
		expect(dynamicRoute.match).not.toHaveBeenCalled()
	})

	it('matches dynamically by URL segment count', () => {
		const url = 'https://api.example.com/users/123'
		const method = 'GET'
		const dynamicRoute: IDynamicRoute = {
			method: 'GET',
			url: 'https://api.example.com/users/:id',
			getterKey: 'dynamic.0',
			match: vi.fn().mockReturnValue(true),
		}
		const maps = {
			urlMap: {} as IURLMap,
			dynamicUrlMap: {
				3: [dynamicRoute],
			} as IDynamicURLMap,
		}

		const result = getMockPaths(url, method, maps)
		expect(result).toEqual(['dynamic.0'])
		expect(dynamicRoute.match).toHaveBeenCalledWith('https-api.example.com/users/123')
	})

	it('looks for dynamic matches only with the exact segment count', () => {
		const url = 'https://api.example.com/users/123'
		const method = 'GET'
		const dynamicRoute: IDynamicRoute = {
			method: 'GET',
			url: 'https://api.example.com/users/:id',
			getterKey: 'dynamic.0',
			match: vi.fn().mockReturnValue(true),
		}
		const maps = {
			urlMap: {} as IURLMap,
			dynamicUrlMap: {
				2: [dynamicRoute],
			} as IDynamicURLMap,
		}

		const result = getMockPaths(url, method, maps)
		expect(result).toEqual([])
		expect(dynamicRoute.match).not.toHaveBeenCalled()
	})

	it('returns nothing when the dynamic matcher returns false', () => {
		const url = 'https://api.example.com/posts/123'
		const method = 'GET'
		const dynamicRoute: IDynamicRoute = {
			method: 'GET',
			url: 'https://api.example.com/users/:id',
			getterKey: 'dynamic.0',
			match: vi.fn().mockReturnValue(false),
		}
		const maps = {
			urlMap: {} as IURLMap,
			dynamicUrlMap: {
				3: [dynamicRoute],
			} as IDynamicURLMap,
		}

		const result = getMockPaths(url, method, maps)
		expect(result).toEqual([])
		expect(dynamicRoute.match).toHaveBeenCalled()
	})

	it('handles empty maps', () => {
		const url = 'https://api.example.com/users'
		const method = 'GET'
		const maps = {
			urlMap: {} as IURLMap,
			dynamicUrlMap: {} as IDynamicURLMap,
		}

		const result = getMockPaths(url, method, maps)
		expect(result).toEqual([])
	})

	it('normalises the URL before lookup (trailing slash)', () => {
		const url = 'https://api.example.com/users/'
		const method = 'GET'
		const maps = {
			urlMap: {
				'https://api.example.com/users': {
					GET: ['mocks.0'],
				},
			} as IURLMap,
			dynamicUrlMap: {} as IDynamicURLMap,
		}

		const result = getMockPaths(url, method, maps)
		expect(result).toEqual(['mocks.0'])
	})

	it('normalises the URL before lookup (query string)', () => {
		const url = 'https://api.example.com/users?id=123'
		const method = 'GET'
		const maps = {
			urlMap: {
				'https://api.example.com/users': {
					GET: ['mocks.0'],
				},
			} as IURLMap,
			dynamicUrlMap: {} as IDynamicURLMap,
		}

		const result = getMockPaths(url, method, maps)
		expect(result).toEqual(['mocks.0'])
	})

	it('filters by method in a static match', () => {
		const url = 'https://api.example.com/users'
		const method = 'POST'
		const maps = {
			urlMap: {
				'https://api.example.com/users': {
					GET: ['mocks.0'],
				},
			} as IURLMap,
			dynamicUrlMap: {} as IDynamicURLMap,
		}

		const result = getMockPaths(url, method, maps)
		expect(result).toEqual([])
	})

	it('filters by method in a dynamic match', () => {
		const url = 'https://api.example.com/users/123'
		const method = 'POST'
		const dynamicRoute: IDynamicRoute = {
			method: 'GET',
			url: 'https://api.example.com/users/:id',
			getterKey: 'dynamic.0',
			match: vi.fn().mockReturnValue(true),
		}
		const maps = {
			urlMap: {} as IURLMap,
			dynamicUrlMap: {
				5: [dynamicRoute],
			} as IDynamicURLMap,
		}

		const result = getMockPaths(url, method, maps)
		expect(result).toEqual([])
		expect(dynamicRoute.match).not.toHaveBeenCalled()
	})

	it('returns several paths for a static match', () => {
		const url = 'https://api.example.com/users'
		const method = 'GET'
		const maps = {
			urlMap: {
				'https://api.example.com/users': {
					GET: ['mocks.0', 'mocks.1', 'mocks.2'],
				},
			} as IURLMap,
			dynamicUrlMap: {} as IDynamicURLMap,
		}

		const result = getMockPaths(url, method, maps)
		expect(result).toEqual(['mocks.0', 'mocks.1', 'mocks.2'])
	})
})

describe('getActiveMockWithPath', () => {
	const createMock = (overrides: Partial<IMockResponse> = {}): IMockResponse => ({
		method: MethodEnum.GET,
		createdOn: Date.now(),
		url: 'https://api.example.com/test',
		status: 200,
		active: true,
		description: 'Test mock',
		id: 'mock-1',
		...overrides,
	})

	const createStore = (mocks: IMockResponse[], collectionTree?: ICollectionTree): IStore => ({
		active: true,
		theme: 'light',
		mocks,
		totalMocksCreated: mocks.length,
		activityInfo: { promoted: false },
		collectionTree: collectionTree ?? { nodes: {}, root: [] },
	})

	it('returns the first active mock', () => {
		const mocks = [createMock({ id: 'mock-1' }), createMock({ id: 'mock-2', active: true })]
		const store = createStore(mocks)
		const paths = ['mocks.0', 'mocks.1']

		const result = getActiveMockWithPath(paths, store)
		expect(result.mock).toEqual(mocks[0])
		expect(result.path).toBe('mocks.0')
	})

	it('skips an inactive mock', () => {
		const mocks = [createMock({ id: 'mock-1', active: false }), createMock({ id: 'mock-2', active: true })]
		const store = createStore(mocks)
		const paths = ['mocks.0', 'mocks.1']

		const result = getActiveMockWithPath(paths, store)
		expect(result.mock).toEqual(mocks[1])
		expect(result.path).toBe('mocks.1')
	})

	it('returns null when every mock is inactive', () => {
		const mocks = [
			createMock({ id: 'mock-1', active: false }),
			createMock({ id: 'mock-2', active: false }),
		]
		const store = createStore(mocks)
		const paths = ['mocks.0', 'mocks.1']

		const result = getActiveMockWithPath(paths, store)
		expect(result.mock).toBeNull()
		expect(result.path).toBeNull()
	})

	it('returns null for an empty paths array', () => {
		const mocks = [createMock()]
		const store = createStore(mocks)
		const paths: string[] = []

		const result = getActiveMockWithPath(paths, store)
		expect(result.mock).toBeNull()
		expect(result.path).toBeNull()
	})

	it('skips a mock with a missing path', () => {
		const mocks = [createMock({ id: 'mock-1' })]
		const store = createStore(mocks)
		const paths = ['mocks.999', 'mocks.0']

		const result = getActiveMockWithPath(paths, store)
		expect(result.mock).toEqual(mocks[0])
		expect(result.path).toBe('mocks.0')
	})

	it('skips every mock with a missing path', () => {
		const mocks = [createMock({ id: 'mock-1' })]
		const store = createStore(mocks)
		const paths = ['mocks.999', 'mocks.888']

		const result = getActiveMockWithPath(paths, store)
		expect(result.mock).toBeNull()
		expect(result.path).toBeNull()
	})

	it('does not check collectionTree when there is none', () => {
		const mocks = [createMock({ id: 'mock-1', collectionId: 'col-1' })]
		const store: IStore = {
			...createStore(mocks),
			collectionTree: undefined as unknown as ICollectionTree,
		}
		const paths = ['mocks.0']

		const result = getActiveMockWithPath(paths, store)
		expect(result.mock).toEqual(mocks[0])
	})

	it('filters by active collection', () => {
		const mocks = [createMock({ id: 'mock-1', collectionId: 'col-1' })]
		const collectionTree: ICollectionTree = {
			nodes: {
				'col-1': {
					id: 'col-1',
					name: 'Test Collection',
					parentId: null,
					active: false,
					createdOn: Date.now(),
					entries: [{ id: 'mock-1', type: 'mock' }],
				},
			},
			root: [{ id: 'col-1', type: 'collection' }],
		}
		const store = createStore(mocks, collectionTree)
		const paths = ['mocks.0']

		const result = getActiveMockWithPath(paths, store)
		expect(result.mock).toBeNull()
		expect(result.path).toBeNull()
	})

	it('an inactive parent collection disables the nested one', () => {
		const mocks = [createMock({ id: 'mock-1', collectionId: 'col-2' })]
		const collectionTree: ICollectionTree = {
			nodes: {
				'col-1': {
					id: 'col-1',
					name: 'Parent Collection',
					parentId: null,
					active: false,
					createdOn: Date.now(),
					entries: [{ id: 'col-2', type: 'collection' }],
				},
				'col-2': {
					id: 'col-2',
					name: 'Child Collection',
					parentId: 'col-1',
					active: true,
					createdOn: Date.now(),
					entries: [{ id: 'mock-1', type: 'mock' }],
				},
			},
			root: [{ id: 'col-1', type: 'collection' }],
		}
		const store = createStore(mocks, collectionTree)
		const paths = ['mocks.0']

		const result = getActiveMockWithPath(paths, store)
		expect(result.mock).toBeNull()
	})

	it('an active parent collection lets a nested active mock through', () => {
		const mocks = [createMock({ id: 'mock-1', collectionId: 'col-2' })]
		const collectionTree: ICollectionTree = {
			nodes: {
				'col-1': {
					id: 'col-1',
					name: 'Parent Collection',
					parentId: null,
					active: true,
					createdOn: Date.now(),
					entries: [{ id: 'col-2', type: 'collection' }],
				},
				'col-2': {
					id: 'col-2',
					name: 'Child Collection',
					parentId: 'col-1',
					active: true,
					createdOn: Date.now(),
					entries: [{ id: 'mock-1', type: 'mock' }],
				},
			},
			root: [{ id: 'col-1', type: 'collection' }],
		}
		const store = createStore(mocks, collectionTree)
		const paths = ['mocks.0']

		const result = getActiveMockWithPath(paths, store)
		expect(result.mock).toEqual(mocks[0])
	})

	it('a mock without collectionId (null) passes the collection check', () => {
		const mocks = [createMock({ id: 'mock-1', collectionId: null })]
		const collectionTree: ICollectionTree = {
			nodes: {
				'col-1': {
					id: 'col-1',
					name: 'Test Collection',
					parentId: null,
					active: false,
					createdOn: Date.now(),
					entries: [],
				},
			},
			root: [],
		}
		const store = createStore(mocks, collectionTree)
		const paths = ['mocks.0']

		const result = getActiveMockWithPath(paths, store)
		expect(result.mock).toEqual(mocks[0])
	})

	it('a mock with an unknown collectionId passes the collection check', () => {
		const mocks = [createMock({ id: 'mock-1', collectionId: 'non-existent' })]
		const collectionTree: ICollectionTree = {
			nodes: {},
			root: [],
		}
		const store = createStore(mocks, collectionTree)
		const paths = ['mocks.0']

		const result = getActiveMockWithPath(paths, store)
		expect(result.mock).toEqual(mocks[0])
	})
})
