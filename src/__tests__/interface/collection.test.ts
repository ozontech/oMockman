import { describe, it, expect } from 'vitest'

import {
	createEmptyCollectionTree,
	ROOT_COLLECTION_ID,
} from '../../interface/collection'

describe('interface/collection', () => {
	describe('createEmptyCollectionTree', () => {
		it('creates an empty tree', () => {
			const tree = createEmptyCollectionTree()
			expect(tree.nodes).toEqual({})
			expect(tree.root).toEqual([])
		})

		it('returns an object with the right shape', () => {
			const tree = createEmptyCollectionTree()
			expect(tree).toHaveProperty('nodes')
			expect(tree).toHaveProperty('root')
			expect(Array.isArray(tree.root)).toBe(true)
			expect(typeof tree.nodes).toBe('object')
		})
	})

	describe('ROOT_COLLECTION_ID', () => {
		it('exports the expected value', () => {
			expect(ROOT_COLLECTION_ID).toBe('root')
		})
	})
})