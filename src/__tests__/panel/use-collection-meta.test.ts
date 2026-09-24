import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { MethodEnum } from '@/interface'
import type { ICollectionTree } from '@/interface/collection'
import type { IMockResponse } from '@/interface/mock'
import { useCollectionMeta } from '@/panel/app/mocks/hooks/use-collection-meta'

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
