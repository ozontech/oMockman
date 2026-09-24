import { describe, it, expect } from 'vitest'

import {
	getCollectionDepth,
	getMaxDescendantDepth,
	canMoveCollectionTo,
} from '../../panel/app/mocks/model/collection-depth'
import type { ICollectionNode, ICollectionEntry } from '../../interface/collection'

describe('getCollectionDepth', () => {
	const createNode = (id: string, parentId: string | null): ICollectionNode => ({
		id,
		name: id,
		parentId,
		active: true,
		createdOn: Date.now(),
		entries: [],
	})

	it('returns 0 for a root collection', () => {
		const nodes: Record<string, ICollectionNode> = {
			'col-1': createNode('col-1', null),
		}
		expect(getCollectionDepth(nodes, 'col-1')).toBe(0)
	})

	it('returns the depth of nested collections', () => {
		const nodes: Record<string, ICollectionNode> = {
			'col-1': createNode('col-1', null),
			'col-2': createNode('col-2', 'col-1'),
			'col-3': createNode('col-3', 'col-2'),
		}
		expect(getCollectionDepth(nodes, 'col-3')).toBe(2)
	})

	it('returns 0 for a missing collection', () => {
		const nodes: Record<string, ICollectionNode> = {
			'col-1': createNode('col-1', null),
		}
		expect(getCollectionDepth(nodes, 'non-existent')).toBe(0)
	})

	it('stops after 50 levels', () => {
		const nodes: Record<string, ICollectionNode> = {}
		let parentId: string | null = null
		for (let i = 0; i < 60; i++) {
			const id = `col-${i}`
			nodes[id] = createNode(id, parentId)
			parentId = id
		}
		expect(getCollectionDepth(nodes, 'col-59')).toBe(51)
	})
})

describe('getMaxDescendantDepth', () => {
	const createNode = (id: string, parentId: string | null, entries: ICollectionEntry[] = []): ICollectionNode => ({
		id,
		name: id,
		parentId,
		active: true,
		createdOn: Date.now(),
		entries,
	})

	it('returns 0 for a leaf collection', () => {
		const nodes: Record<string, ICollectionNode> = {
			'col-1': createNode('col-1', null),
		}
		expect(getMaxDescendantDepth(nodes, 'col-1')).toBe(0)
	})

	it('returns the depth of nested collections', () => {
		const nodes: Record<string, ICollectionNode> = {
			'col-1': createNode('col-1', null, [{ id: 'col-2', type: 'collection' }]),
			'col-2': createNode('col-2', 'col-1', [{ id: 'col-3', type: 'collection' }]),
			'col-3': createNode('col-3', 'col-2', []),
		}
		expect(getMaxDescendantDepth(nodes, 'col-1')).toBe(2)
	})

	it('returns 0 for a missing collection', () => {
		const nodes: Record<string, ICollectionNode> = {}
		expect(getMaxDescendantDepth(nodes, 'non-existent')).toBe(0)
	})

	it('does not count mocks in entries', () => {
		const nodes: Record<string, ICollectionNode> = {
			'col-1': createNode('col-1', null, [
				{ id: 'mock-1', type: 'mock' },
				{ id: 'col-2', type: 'collection' },
			]),
			'col-2': createNode('col-2', 'col-1', []),
		}
		expect(getMaxDescendantDepth(nodes, 'col-1')).toBe(1)
	})

	it('counts only collections in entries', () => {
		const nodes: Record<string, ICollectionNode> = {
			'col-1': createNode('col-1', null, [{ id: 'col-2', type: 'collection' }]),
			'col-2': createNode('col-2', 'col-1', [
				{ id: 'mock-1', type: 'mock' },
				{ id: 'col-3', type: 'collection' },
			]),
			'col-3': createNode('col-3', 'col-2', []),
		}
		expect(getMaxDescendantDepth(nodes, 'col-1')).toBe(2)
	})
})

describe('canMoveCollectionTo', () => {
	const createNode = (id: string, parentId: string | null, entries: ICollectionEntry[] = []): ICollectionNode => ({
		id,
		name: id,
		parentId,
		active: true,
		createdOn: Date.now(),
		entries,
	})

	it('allows moving to null (root)', () => {
		const nodes: Record<string, ICollectionNode> = {
			'col-1': createNode('col-1', null),
		}
		const result = canMoveCollectionTo({ nodes, collectionId: 'col-1', targetContainerId: null, maxDepth: 5 })
		expect(result).toBe(true)
	})

	it('allows the move when depth permits', () => {
		const nodes: Record<string, ICollectionNode> = {
			'col-1': createNode('col-1', null),
			'col-2': createNode('col-2', null),
		}
		const result = canMoveCollectionTo({ nodes, collectionId: 'col-2', targetContainerId: 'col-1', maxDepth: 3 })
		expect(result).toBe(true)
	})

	it('refuses the move when it exceeds maxDepth', () => {
		const nodes: Record<string, ICollectionNode> = {
			'col-1': createNode('col-1', null, [{ id: 'col-2', type: 'collection' }]),
			'col-2': createNode('col-2', 'col-1', [{ id: 'col-3', type: 'collection' }]),
			'col-3': createNode('col-3', 'col-2', []),
			'col-4': createNode('col-4', null),
		}
		const result = canMoveCollectionTo({ nodes, collectionId: 'col-4', targetContainerId: 'col-3', maxDepth: 1 })
		expect(result).toBe(false)
	})

	it('accounts for the depth of the moved subtree', () => {
		const nodes: Record<string, ICollectionNode> = {
			'col-1': createNode('col-1', null),
			'col-2': createNode('col-2', 'col-1', [{ id: 'col-3', type: 'collection' }]),
			'col-3': createNode('col-3', 'col-2', []),
		}
		const result = canMoveCollectionTo({ nodes, collectionId: 'col-2', targetContainerId: 'col-1', maxDepth: 2 })
		expect(result).toBe(true)

		const result2 = canMoveCollectionTo({ nodes, collectionId: 'col-2', targetContainerId: 'col-1', maxDepth: 1 })
		expect(result2).toBe(false)
	})
})