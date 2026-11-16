import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { MethodEnum } from '@/interface'
import type { ICollectionTree } from '@/interface/collection'
import type { IMockResponse } from '@/interface/mock'
import { useCollectionMeta } from '@/panel/app/mocks/hooks/use-collection-meta'
import { buildFilteredRows } from '@/panel/app/mocks/model/rows'

const mock = (id: string, overrides: Partial<IMockResponse> = {}): IMockResponse => ({
	id,
	name: id,
	description: '',
	method: MethodEnum.GET,
	url: `https://example.com/${id}`,
	status: 200,
	response: '{}',
	active: true,
	createdOn: 1,
	collectionId: null,
	...overrides,
} as IMockResponse)

const tree: ICollectionTree = {
	root: [{ id: 'parent', type: 'collection' }, { id: 'loose', type: 'mock' }],
	nodes: {
		parent: {
			id: 'parent',
			name: 'Parent',
			parentId: null,
			active: true,
			createdOn: 1,
			entries: [{ id: 'm-1', type: 'mock' }, { id: 'child', type: 'collection' }],
		},
		child: {
			id: 'child',
			name: 'Child',
			parentId: 'parent',
			active: true,
			createdOn: 1,
			entries: [{ id: 'm-2', type: 'mock' }, { id: 'ghost', type: 'mock' }],
		},
	},
}

const mocks = [mock('m-1'), mock('m-2'), mock('loose')]

const meta = (
	nextTree: ICollectionTree,
	nextMocks: IMockResponse[],
): ReturnType<typeof useCollectionMeta> =>
	renderHook(() => useCollectionMeta(nextTree, nextMocks)).result.current

describe('useCollectionMeta', () => {
	it('indexes mocks by id', () => {
		const collectionMeta = meta(tree, mocks)
		expect(Object.keys(collectionMeta.mocksById).sort()).toEqual(['loose', 'm-1', 'm-2'])
	})

	it('counts mocks in a branch, ignoring entries with no mock behind them', () => {
		const collectionMeta = meta(tree, mocks)

		expect(collectionMeta.collectionMockCounts.child).toBe(1)
		expect(collectionMeta.collectionMockCounts.parent).toBe(2)
	})

	it('builds a readable path for every collection', () => {
		const collectionMeta = meta(tree, mocks)

		expect(collectionMeta.collectionPathMap.parent).toBe('Parent')
		expect(collectionMeta.collectionPathMap.child).toBe('Parent / Child')
	})

	it.each([
		['m-1', 1, 0],
		['m-2', 1, 1],
		['missing', 0, 0],
		['', 2, 1],
		['   ', 2, 1],
	])('counts matches for query "%s" throughout collapsed branches', (query, parent, child) => {
		const { result } = renderHook(() => useCollectionMeta(tree, mocks, query))
		expect(result.current.collectionMockCounts).toEqual({ parent, child })

		const rows = buildFilteredRows(tree, mocks, new Set(), query)
		expect(rows.some((row) => row.rowType === 'collection' && row.node.id === 'parent')).toBe(true)
		expect(rows.some((row) => row.rowType === 'mock' && row.mock.id === 'm-2')).toBe(false)
	})

	it.each(['  UNIQUE NAME  ', '/UNIQUE-PATH', 'post', '404'])('uses the same search rules as mock rows: %s', (query) => {
		const nextMocks = [mock('m-1'), mock('m-2', {
			name: 'Unique Name',
			url: 'https://example.com/unique-path',
			method: MethodEnum.POST,
			status: 404,
			active: false,
		})]
		const { result } = renderHook(() => useCollectionMeta(tree, nextMocks, query))
		const rows = buildFilteredRows(tree, nextMocks, new Set(['parent', 'child']), query)

		expect(rows.filter((row) => row.rowType === 'mock').map((row) => row.id)).toEqual(['m-2'])
		expect(result.current.collectionMockCounts).toEqual({ parent: 1, child: 1 })
	})

	it('updates counts when the query changes and restores totals when cleared', () => {
		const { result, rerender } = renderHook(({ query }) => useCollectionMeta(tree, mocks, query), {
			initialProps: { query: 'm-1' },
		})
		expect(result.current.collectionMockCounts).toEqual({ parent: 1, child: 0 })
		rerender({ query: 'm-2' })
		expect(result.current.collectionMockCounts).toEqual({ parent: 1, child: 1 })
		rerender({ query: '' })
		expect(result.current.collectionMockCounts).toEqual({ parent: 2, child: 1 })
	})

	it('keeps activity, permissions, paths and the mock index independent of search', () => {
		const all = meta(tree, mocks)
		const { result } = renderHook(() => useCollectionMeta(tree, mocks, 'missing'))
		expect(result.current.collectionMockCounts).toEqual({ parent: 0, child: 0 })
		expect(result.current).toEqual({ ...all, collectionMockCounts: { parent: 0, child: 0 } })
	})

	it('marks a branch active when it holds an active mock', () => {
		const collectionMeta = meta(tree, mocks)

		expect(collectionMeta.collectionHasActive.parent).toBe(true)
		expect(collectionMeta.collectionHasActive.child).toBe(true)
	})

	it('treats a branch with only inactive mocks as inactive', () => {
		const collectionMeta = meta(tree, [mock('m-1', { active: false }), mock('m-2', { active: false })])

		expect(collectionMeta.collectionHasActive.parent).toBe(false)
		expect(collectionMeta.collectionHasActive.child).toBe(false)
	})

	it('propagates a disabled parent down the branch', () => {
		const disabled: ICollectionTree = {
			...tree,
			nodes: { ...tree.nodes, parent: { ...tree.nodes.parent, active: false } },
		}
		const collectionMeta = meta(disabled, mocks)

		expect(collectionMeta.collectionBranchEnabled.parent).toBe(false)
		expect(collectionMeta.collectionBranchEnabled.child).toBe(false)
		expect(collectionMeta.collectionHasActive.parent).toBe(false)
	})

	it('allows toggling a child only while its ancestors are enabled', () => {
		const collectionMeta = meta(tree, mocks)
		expect(collectionMeta.collectionToggleAllowed.child).toBe(true)

		const disabled: ICollectionTree = {
			...tree,
			nodes: { ...tree.nodes, parent: { ...tree.nodes.parent, active: false } },
		}
		expect(meta(disabled, mocks).collectionToggleAllowed.child).toBe(false)
	})

	it('handles an entry pointing at a collection that does not exist', () => {
		const broken: ICollectionTree = {
			root: [{ id: 'missing', type: 'collection' }],
			nodes: {},
		}
		const collectionMeta = meta(broken, mocks)

		expect(collectionMeta.collectionMockCounts).toEqual({})
		expect(collectionMeta.collectionPathMap).toEqual({})
	})

	it('handles an empty tree', () => {
		const collectionMeta = meta({ root: [], nodes: {} }, [])
		expect(collectionMeta.collectionMockCounts).toEqual({})
		expect(collectionMeta.mocksById).toEqual({})
	})
})
