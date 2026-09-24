import { describe, it, expect } from 'vitest'

import {
	normalizeCollectionTree,
	appendMockToTree,
	removeMockFromTree,
	isCollectionActive,
	upsertCollectionNode,
	moveMockWithinTree,
	moveCollectionWithinTree,
	findEntryPlacement,
	getContainerEntries,
	isDescendantCollection,
	removeCollectionFromTree,
	ensureRootEntry,
} from '../../panel/app/service/collection-tree'
import type { ICollectionTree } from '../../interface/collection'
import type { IMockResponse } from '../../interface/mock'
import { MethodEnum } from '../../interface'

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

describe('collection-tree: normalizeCollectionTree', () => {
	it('creates a default tree from empty mocks', () => {
		const result = normalizeCollectionTree({ mocks: [] })
		expect(result.tree.root).toEqual([])
		expect(result.tree.nodes).toEqual({})
	})

	it('creates a tree from mocks without collections', () => {
		const mocks = [
			createMock({ id: 'mock-1', name: 'Mock 1', url: '/api/1' }),
			createMock({ id: 'mock-2', name: 'Mock 2', url: '/api/2', method: MethodEnum.POST }),
		]
		const result = normalizeCollectionTree({ mocks })
		expect(result.tree.root).toHaveLength(2)
		expect(result.tree.root[0].id).toBe('mock-1')
		expect(result.tree.root[1].id).toBe('mock-2')
	})

	it('keeps a tree with valid collections', () => {
		const mocks = [
			createMock({ id: 'mock-1', name: 'Mock 1', url: '/api/1', collectionId: 'col-1' }),
		]
		const tree: ICollectionTree = {
			root: [{ id: 'col-1', type: 'collection' }],
			nodes: {
				'col-1': { id: 'col-1', name: 'Collection 1', parentId: null, active: true, createdOn: Date.now(), entries: [{ id: 'mock-1', type: 'mock' }] },
			},
		}
		const result = normalizeCollectionTree({ mocks, tree })
		expect(result.tree.nodes['col-1']).toBeDefined()
		expect(result.tree.nodes['col-1']?.entries).toHaveLength(1)
	})

	it('removes mocks with invalid ids from the tree', () => {
		const mocks = [
			createMock({ id: 'mock-1', name: 'Mock 1', url: '/api/1' }),
		]
		const tree: ICollectionTree = {
			root: [{ id: 'mock-1', type: 'mock' }, { id: 'mock-999', type: 'mock' }],
			nodes: {},
		}
		const result = normalizeCollectionTree({ mocks, tree })
		expect(result.tree.root).toHaveLength(1)
		expect(result.tree.root[0].id).toBe('mock-1')
	})
})

describe('collection-tree: appendMockToTree', () => {
	it('adds a mock to the root', () => {
		const tree: ICollectionTree = { root: [], nodes: {} }
		const result = appendMockToTree(tree, 'mock-1', null)
		expect(result.root).toHaveLength(1)
		expect(result.root[0]).toEqual({ id: 'mock-1', type: 'mock' })
	})

	it('adds a mock to a collection', () => {
		const tree: ICollectionTree = {
			root: [{ id: 'col-1', type: 'collection' }],
			nodes: { 'col-1': { id: 'col-1', name: 'Col', parentId: null, active: true, createdOn: Date.now(), entries: [] } },
		}
		const result = appendMockToTree(tree, 'mock-1', 'col-1')
		expect(result.nodes['col-1']?.entries).toHaveLength(1)
		expect(result.nodes['col-1']?.entries[0].id).toBe('mock-1')
	})

	it('does not add a duplicate', () => {
		const tree: ICollectionTree = {
			root: [{ id: 'mock-1', type: 'mock' }],
			nodes: {},
		}
		const result = appendMockToTree(tree, 'mock-1', null)
		expect(result.root).toHaveLength(1)
	})
})

describe('collection-tree: removeMockFromTree', () => {
	it('removes a mock from the root', () => {
		const tree: ICollectionTree = {
			root: [{ id: 'mock-1', type: 'mock' }, { id: 'mock-2', type: 'mock' }],
			nodes: {},
		}
		const result = removeMockFromTree(tree, 'mock-1')
		expect(result.root).toHaveLength(1)
		expect(result.root[0].id).toBe('mock-2')
	})

	it('removes a mock from a collection', () => {
		const tree: ICollectionTree = {
			root: [{ id: 'col-1', type: 'collection' }],
			nodes: {
				'col-1': { id: 'col-1', name: 'Col', parentId: null, active: true, createdOn: Date.now(), entries: [{ id: 'mock-1', type: 'mock' }] },
			},
		}
		const result = removeMockFromTree(tree, 'mock-1')
		expect(result.nodes['col-1']?.entries).toHaveLength(0)
	})
})

describe('collection-tree: isCollectionActive', () => {
	it('returns true for null', () => {
		const tree: ICollectionTree = { root: [], nodes: {} }
		expect(isCollectionActive(tree, null)).toBe(true)
	})

	it('returns true for undefined', () => {
		const tree: ICollectionTree = { root: [], nodes: {} }
		expect(isCollectionActive(tree, undefined)).toBe(true)
	})

	it('returns true for an active collection', () => {
		const tree: ICollectionTree = {
			root: [],
			nodes: { 'col-1': { id: 'col-1', name: 'Col', parentId: null, active: true, createdOn: Date.now(), entries: [] } },
		}
		expect(isCollectionActive(tree, 'col-1')).toBe(true)
	})

	it('returns false for an inactive collection', () => {
		const tree: ICollectionTree = {
			root: [],
			nodes: { 'col-1': { id: 'col-1', name: 'Col', parentId: null, active: false, createdOn: Date.now(), entries: [] } },
		}
		expect(isCollectionActive(tree, 'col-1')).toBe(false)
	})

	it('returns false for an inactive parent collection', () => {
		const tree: ICollectionTree = {
			root: [],
			nodes: {
				'col-1': { id: 'col-1', name: 'Parent', parentId: null, active: false, createdOn: Date.now(), entries: [] },
				'col-2': { id: 'col-2', name: 'Child', parentId: 'col-1', active: true, createdOn: Date.now(), entries: [] },
			},
		}
		expect(isCollectionActive(tree, 'col-2')).toBe(false)
	})
})

describe('collection-tree: upsertCollectionNode', () => {
	it('creates a new collection at the root', () => {
		const tree: ICollectionTree = { root: [], nodes: {} }
		const result = upsertCollectionNode(tree, { id: 'col-1', name: 'New Collection', parentId: null, active: true, createdOn: Date.now() })
		expect(result.root).toHaveLength(1)
		expect(result.root[0].id).toBe('col-1')
		expect(result.nodes['col-1']).toBeDefined()
	})

	it('updates an existing collection', () => {
		const tree: ICollectionTree = {
			root: [],
			nodes: { 'col-1': { id: 'col-1', name: 'Old Name', parentId: null, active: true, createdOn: Date.now(), entries: [] } },
		}
		const result = upsertCollectionNode(tree, { id: 'col-1', name: 'New Name', parentId: null, active: false, createdOn: Date.now() })
		expect(result.nodes['col-1']?.name).toBe('New Name')
		expect(result.nodes['col-1']?.active).toBe(false)
	})

	it('adds a collection at a position', () => {
		const tree: ICollectionTree = {
			root: [{ id: 'col-1', type: 'collection' }],
			nodes: { 'col-1': { id: 'col-1', name: 'Col1', parentId: null, active: true, createdOn: Date.now(), entries: [] } },
		}
		const result = upsertCollectionNode(tree, { id: 'col-2', name: 'Col2', parentId: null, active: true, createdOn: Date.now() }, { position: 0 })
		expect(result.root[0].id).toBe('col-2')
	})
})

describe('collection-tree: findEntryPlacement', () => {
	it('finds a mock at the root', () => {
		const tree: ICollectionTree = {
			root: [{ id: 'mock-1', type: 'mock' }],
			nodes: {},
		}
		const result = findEntryPlacement(tree, 'mock-1', 'mock')
		expect(result).toEqual({ containerId: null, index: 0 })
	})

	it('finds a mock in a collection', () => {
		const tree: ICollectionTree = {
			root: [{ id: 'col-1', type: 'collection' }],
			nodes: { 'col-1': { id: 'col-1', name: 'Col', parentId: null, active: true, createdOn: Date.now(), entries: [{ id: 'mock-1', type: 'mock' }] } },
		}
		const result = findEntryPlacement(tree, 'mock-1', 'mock')
		expect(result).toEqual({ containerId: 'col-1', index: 0 })
	})

	it('returns null for a missing entry', () => {
		const tree: ICollectionTree = { root: [], nodes: {} }
		const result = findEntryPlacement(tree, 'mock-999', 'mock')
		expect(result).toBeNull()
	})
})

describe('collection-tree: getContainerEntries', () => {
	it('returns the root for null', () => {
		const tree: ICollectionTree = {
			root: [{ id: 'mock-1', type: 'mock' }],
			nodes: {},
		}
		const result = getContainerEntries(tree, null)
		expect(result).toHaveLength(1)
	})

	it('returns collection entries', () => {
		const tree: ICollectionTree = {
			root: [],
			nodes: { 'col-1': { id: 'col-1', name: 'Col', parentId: null, active: true, createdOn: Date.now(), entries: [{ id: 'mock-1', type: 'mock' }] } },
		}
		const result = getContainerEntries(tree, 'col-1')
		expect(result).toHaveLength(1)
	})
})

describe('collection-tree: moveMockWithinTree', () => {
	it('moves a mock to null (root)', () => {
		const tree: ICollectionTree = {
			root: [],
			nodes: { 'col-1': { id: 'col-1', name: 'Col', parentId: null, active: true, createdOn: Date.now(), entries: [{ id: 'mock-1', type: 'mock' }] } },
		}
		const result = moveMockWithinTree(tree, 'mock-1', null)
		expect(result.root).toHaveLength(1)
		expect(result.nodes['col-1']?.entries).toHaveLength(0)
	})

	it('moves a mock into a collection', () => {
		const tree: ICollectionTree = {
			root: [{ id: 'mock-1', type: 'mock' }],
			nodes: { 'col-1': { id: 'col-1', name: 'Col', parentId: null, active: true, createdOn: Date.now(), entries: [] } },
		}
		const result = moveMockWithinTree(tree, 'mock-1', 'col-1')
		expect(result.root).toHaveLength(0)
		expect(result.nodes['col-1']?.entries).toHaveLength(1)
	})
})

describe('collection-tree: moveCollectionWithinTree', () => {
	it('moves a collection to null (root)', () => {
		const tree: ICollectionTree = {
			root: [],
			nodes: {
				'col-1': { id: 'col-1', name: 'Parent', parentId: null, active: true, createdOn: Date.now(), entries: [] },
				'col-2': { id: 'col-2', name: 'Child', parentId: 'col-1', active: true, createdOn: Date.now(), entries: [] },
			},
		}
		const result = moveCollectionWithinTree(tree, 'col-2', null)
		expect(result.root).toHaveLength(1)
		expect(result.root[0].id).toBe('col-2')
	})
})

describe('collection-tree: isDescendantCollection', () => {
	it('returns true when ancestorId is an ancestor of candidateId', () => {
		const tree: ICollectionTree = {
			root: [],
			nodes: {
				'col-1': { id: 'col-1', name: 'Parent', parentId: null, active: true, createdOn: Date.now(), entries: [] },
				'col-2': { id: 'col-2', name: 'Child', parentId: 'col-1', active: true, createdOn: Date.now(), entries: [] },
			},
		}
		expect(isDescendantCollection(tree, 'col-1', 'col-2')).toBe(true)
	})

	it('returns false when ancestorId is not an ancestor', () => {
		const tree: ICollectionTree = {
			root: [],
			nodes: {
				'col-1': { id: 'col-1', name: 'Col1', parentId: null, active: true, createdOn: Date.now(), entries: [] },
				'col-2': { id: 'col-2', name: 'Col2', parentId: null, active: true, createdOn: Date.now(), entries: [] },
			},
		}
		expect(isDescendantCollection(tree, 'col-1', 'col-2')).toBe(false)
	})
})

describe('collection-tree: removeCollectionFromTree', () => {
	it('removes a collection from the tree', () => {
		const tree: ICollectionTree = {
			root: [{ id: 'col-1', type: 'collection' }],
			nodes: { 'col-1': { id: 'col-1', name: 'Col', parentId: null, active: true, createdOn: Date.now(), entries: [] } },
		}
		const result = removeCollectionFromTree(tree, 'col-1')
		expect(result.root).toHaveLength(0)
		expect(result.nodes['col-1']).toBeUndefined()
	})

	it('updates parentId of child collections', () => {
		const tree: ICollectionTree = {
			root: [],
			nodes: {
				'col-1': { id: 'col-1', name: 'Parent', parentId: null, active: true, createdOn: Date.now(), entries: [] },
				'col-2': { id: 'col-2', name: 'Child', parentId: 'col-1', active: true, createdOn: Date.now(), entries: [] },
			},
		}
		const result = removeCollectionFromTree(tree, 'col-1')
		expect(result.nodes['col-2']?.parentId).toBeNull()
	})

	it('leaves the other collections unchanged', () => {
		const tree: ICollectionTree = {
			root: [],
			nodes: {
				'col-1': { id: 'col-1', name: 'Col1', parentId: null, active: true, createdOn: Date.now(), entries: [] },
				'col-2': { id: 'col-2', name: 'Col2', parentId: null, active: true, createdOn: Date.now(), entries: [] },
			},
		}
		const result = removeCollectionFromTree(tree, 'col-1')
		expect(result.nodes['col-2']).toBeDefined()
		expect(result.nodes['col-2']?.name).toBe('Col2')
	})
})

describe('collection-tree: ensureRootEntry', () => {
	it('returns the same tree when root already exists', () => {
		const tree: ICollectionTree = {
			root: [{ id: 'mock-1', type: 'mock' }],
			nodes: {},
		}
		const result = ensureRootEntry(tree)
		expect(result).toBe(tree)
	})

	it('creates an empty root when there is none', () => {
		const tree: ICollectionTree = {
			root: undefined as unknown as [],
			nodes: {},
		}
		const result = ensureRootEntry(tree)
		expect(result.root).toEqual([])
	})
})

describe('collection-tree: upsertCollectionNode with insertInto', () => {
	it('inserts a collection into the given collection', () => {
		const tree: ICollectionTree = {
			root: [],
			nodes: {
				'col-1': { id: 'col-1', name: 'Parent', parentId: null, active: true, createdOn: Date.now(), entries: [] },
			},
		}
		const result = upsertCollectionNode(
			tree,
			{ id: 'col-2', name: 'Child', parentId: null, active: true, createdOn: Date.now() },
			{ insertInto: 'col-1' },
		)
		expect(result.nodes['col-1']?.entries).toHaveLength(1)
		expect(result.nodes['col-1']?.entries[0].id).toBe('col-2')
	})

	it('inserts a collection at the given position', () => {
		const tree: ICollectionTree = {
			root: [{ id: 'col-1', type: 'collection' }],
			nodes: {
				'col-1': { id: 'col-1', name: 'Parent', parentId: null, active: true, createdOn: Date.now(), entries: [] },
			},
		}
		const result = upsertCollectionNode(
			tree,
			{ id: 'col-2', name: 'Child', parentId: null, active: true, createdOn: Date.now() },
			{ insertInto: 'col-1', position: 0 },
		)
		expect(result.nodes['col-1']?.entries[0].id).toBe('col-2')
	})
})

describe('collection-tree: moveMockWithinTree with positions', () => {
	it('moves a mock to a position inside a collection', () => {
		const tree: ICollectionTree = {
			root: [],
			nodes: {
				'col-1': {
					id: 'col-1',
					name: 'Col',
					parentId: null,
					active: true,
					createdOn: Date.now(),
					entries: [
						{ id: 'mock-1', type: 'mock' },
						{ id: 'col-2', type: 'collection' },
					],
				},
			},
		}
		const result = moveMockWithinTree(tree, 'mock-1', 'col-1', 0)
		expect(result.nodes['col-1']?.entries[0].id).toBe('mock-1')
	})

	it('moves a mock to the root at a position', () => {
		const tree: ICollectionTree = {
			root: [{ id: 'col-1', type: 'collection' }],
			nodes: { 'col-1': { id: 'col-1', name: 'Col', parentId: null, active: true, createdOn: Date.now(), entries: [] } },
		}
		const result = moveMockWithinTree(tree, 'col-1', null, 0)
		expect(result.root[0].id).toBe('col-1')
	})
})