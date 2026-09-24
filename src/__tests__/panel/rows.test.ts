import { describe, it, expect } from 'vitest'

import { buildFilteredRows } from '../../panel/app/mocks/model/rows'
import type { ICollectionTree, ICollectionNode, ICollectionEntry } from '../../interface/collection'
import type { IMockResponse } from '../../interface'
import type { Row } from '../../panel/app/mocks/model/types'

describe('buildFilteredRows', () => {
	const createMock = (id: string, name: string, url: string, method = 'GET'): IMockResponse => ({
		id,
		name,
		url,
		method: method as IMockResponse['method'],
		status: 200,
		active: true,
		createdOn: Date.now(),
		response: '',
		description: '',
	})

	const createNode = (id: string, name: string, entries: ICollectionEntry[] = [], parentId: string | null = null): ICollectionNode => ({
		id,
		name,
		parentId,
		active: true,
		createdOn: Date.now(),
		entries,
	})

	it('returns an empty array for an empty tree', () => {
		const tree: ICollectionTree = { nodes: {}, root: [] }
		const mocks: IMockResponse[] = []
		const result = buildFilteredRows(tree, mocks, new Set(), '')
		expect(result).toEqual([])
	})

	it('returns mocks from the root', () => {
		const mock = createMock('m1', 'Mock 1', '/api/test')
		const tree: ICollectionTree = {
			nodes: {},
			root: [{ id: 'm1', type: 'mock' }],
		}
		const result = buildFilteredRows(tree, [mock], new Set(), '')

		expect(result).toHaveLength(1)
		expect(result[0].rowType).toBe('mock')
		expect(((result[0] as Row & { mock: IMockResponse }).mock.id)).toBe('m1')
	})

	it('returns collections from the root', () => {
		const node = createNode('col1', 'Collection 1')
		const tree: ICollectionTree = { nodes: { col1: node }, root: [{ id: 'col1', type: 'collection' }] }
		const mocks: IMockResponse[] = []
		const result = buildFilteredRows(tree, mocks, new Set(), '')

		expect(result).toHaveLength(1)
		expect(result[0].rowType).toBe('collection')
		expect(((result[0] as Row & { node: ICollectionNode }).node.id)).toBe('col1')
	})

	it('shows nested items when expanded', () => {
		const mock = createMock('m1', 'Mock 1', '/api/test')
		const node = createNode('col1', 'Collection 1', [{ id: 'm1', type: 'mock' }])
		const tree: ICollectionTree = { nodes: { col1: node }, root: [{ id: 'col1', type: 'collection' }] }

		const expanded = new Set<string>(['col1'])
		const result = buildFilteredRows(tree, [mock], expanded, '')

		expect(result).toHaveLength(2)
		expect(result[0].rowType).toBe('collection')
		expect(result[1].rowType).toBe('mock')
		expect(result[1].level).toBe(1)
	})

	it('hides nested items when collapsed', () => {
		const mock = createMock('m1', 'Mock 1', '/api/test')
		const node = createNode('col1', 'Collection 1', [{ id: 'm1', type: 'mock' }])
		const tree: ICollectionTree = { nodes: { col1: node }, root: [{ id: 'col1', type: 'collection' }] }

		const expanded = new Set<string>()
		const result = buildFilteredRows(tree, [mock], expanded, '')

		expect(result).toHaveLength(1)
		expect(result[0].rowType).toBe('collection')
	})

	it('filters by name', () => {
		const mocks = [
			createMock('m1', 'Test Mock', '/api/test'),
			createMock('m2', 'Other Mock', '/api/other'),
		]
		const tree: ICollectionTree = {
			nodes: {},
			root: [
				{ id: 'm1', type: 'mock' },
				{ id: 'm2', type: 'mock' },
			],
		}

		const result = buildFilteredRows(tree, mocks, new Set(), 'test')
		expect(result).toHaveLength(1)
		expect(((result[0] as Row & { mock: IMockResponse }).mock.name)).toBe('Test Mock')
	})

	it('filters by url', () => {
		const mocks = [
			createMock('m1', 'Mock 1', '/api/users'),
			createMock('m2', 'Mock 2', '/api/posts'),
		]
		const tree: ICollectionTree = {
			nodes: {},
			root: [
				{ id: 'm1', type: 'mock' },
				{ id: 'm2', type: 'mock' },
			],
		}

		const result = buildFilteredRows(tree, mocks, new Set(), 'users')
		expect(result).toHaveLength(1)
		expect(((result[0] as Row & { mock: IMockResponse }).mock.url)).toBe('/api/users')
	})

	it('filters by method', () => {
		const mocks = [
			createMock('m1', 'Mock 1', '/api/test', 'GET'),
			createMock('m2', 'Mock 2', '/api/test', 'POST'),
		]
		const tree: ICollectionTree = {
			nodes: {},
			root: [
				{ id: 'm1', type: 'mock' },
				{ id: 'm2', type: 'mock' },
			],
		}

		const result = buildFilteredRows(tree, mocks, new Set(), 'post')
		expect(result).toHaveLength(1)
		expect(((result[0] as Row & { mock: IMockResponse }).mock.method)).toBe('POST')
	})

	it('filters by status', () => {
		const mocks = [createMock('m1', 'Mock 1', '/api/test'), createMock('m2', 'Mock 2', '/api/test')]
		mocks[0].status = 200
		mocks[1].status = 404

		const tree: ICollectionTree = {
			nodes: {},
			root: [
				{ id: 'm1', type: 'mock' },
				{ id: 'm2', type: 'mock' },
			],
		}

		const result = buildFilteredRows(tree, mocks, new Set(), '404')
		expect(result).toHaveLength(1)
		expect(((result[0] as Row & { mock: IMockResponse }).mock.status)).toBe(404)
	})

	it('filters case-insensitively', () => {
		const mocks = [createMock('m1', 'Test Mock', '/API/Test')]
		const tree: ICollectionTree = { nodes: {}, root: [{ id: 'm1', type: 'mock' }] }

		const result = buildFilteredRows(tree, mocks, new Set(), 'test')
		expect(result).toHaveLength(1)
	})

	it('returns everything for an empty search', () => {
		const mocks = [createMock('m1', 'Mock 1', '/api/test'), createMock('m2', 'Mock 2', '/api/other')]
		const tree: ICollectionTree = {
			nodes: {},
			root: [
				{ id: 'm1', type: 'mock' },
				{ id: 'm2', type: 'mock' },
			],
		}

		const result = buildFilteredRows(tree, mocks, new Set(), '')
		expect(result).toHaveLength(2)
	})

	it('sets the right level', () => {
		const innerNode = createNode('col2', 'Inner', [{ id: 'm1', type: 'mock' }])
		const outerNode = createNode('col1', 'Outer', [{ id: 'col2', type: 'collection' }])
		const tree: ICollectionTree = {
			nodes: { col1: outerNode, col2: innerNode },
			root: [{ id: 'col1', type: 'collection' }],
		}
		const mock = createMock('m1', 'Mock', '/api')

		const expanded = new Set<string>(['col1'])
		const result = buildFilteredRows(tree, [mock], expanded, '')

		expect(result[0].level).toBe(0)
		expect(result[1].level).toBe(1)
	})

	it('sets parentCollectionId', () => {
		const node = createNode('col1', 'Collection', [{ id: 'm1', type: 'mock' }])
		const tree: ICollectionTree = { nodes: { col1: node }, root: [{ id: 'col1', type: 'collection' }] }
		const mock = createMock('m1', 'Mock', '/api')

		const expanded = new Set<string>(['col1'])
		const result = buildFilteredRows(tree, [mock], expanded, '')

		expect(result[1].parentCollectionId).toBe('col1')
	})
})
