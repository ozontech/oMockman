
import type { OmitStrict } from '@/interface/utility'
import { createEmptyCollectionTree, ROOT_COLLECTION_ID } from '@/interface/collection'
import type { ICollectionEntry, ICollectionNode, ICollectionTree } from '@/interface/collection'
import type { IMockResponse } from '@/interface/mock'
import { genId } from '@/services/helper'

export type CollectionEntryType = ICollectionEntry['type']

export interface CollectionMovePayload {
	entryType: CollectionEntryType
	entryId: string
	from: { containerId: string | null; index: number }
	to: { containerId: string | null; index: number }
}

type LegacyCollectionShape = Record<string, {
	mocks?: IMockResponse[]
	id?: number
	active?: boolean
	description?: string
}>

const MOCK_ENTRY_PREFIX = 'mock:'
const COLLECTION_ENTRY_PREFIX = 'collection:'

function entryKey(entry: ICollectionEntry): string {
	return `${entry.type === 'collection' ? COLLECTION_ENTRY_PREFIX : MOCK_ENTRY_PREFIX}${entry.id}`
}

function isCollectionEntry(value: unknown): value is ICollectionEntry {
	if (!value || typeof value !== 'object') return false
	const candidate = value as ICollectionEntry
	return (candidate.type === 'collection' || candidate.type === 'mock')
}

function cloneEntries(entries: ICollectionEntry[] | undefined): ICollectionEntry[] {
	return Array.isArray(entries) ? entries.filter(isCollectionEntry).map((entry) => ({ ...entry })) : []
}

function sanitizeNode(node: ICollectionNode, validCollections: Set<string>): ICollectionNode {
	const parentId = node.parentId && validCollections.has(node.parentId) ? node.parentId : null
	return {
		...node,
		parentId,
		entries: cloneEntries(node.entries),
	}
}

function pruneInvalidEntries(tree: ICollectionTree, validCollectionIds: Set<string>, validMockIds: Set<string>): ICollectionTree {
	const filterEntries = (entries: ICollectionEntry[] | undefined): ICollectionEntry[] =>
		cloneEntries(entries).filter((entry) => {
			if (entry.type === 'collection') return validCollectionIds.has(entry.id)
			return validMockIds.has(entry.id)
		})

	const nodes: Record<string, ICollectionNode> = {}
	for (const [id, node] of Object.entries(tree.nodes || {})) {
		if (!validCollectionIds.has(id)) continue
		nodes[id] = {
			...sanitizeNode(node, validCollectionIds),
			entries: filterEntries(node.entries),
		}
	}

	return {
		root: filterEntries(tree.root),
		nodes,
	}
}

function buildDefaultTree(mocks: IMockResponse[]): ICollectionTree {
	return {
		nodes: {},
		root: mocks.map((mock) => ({ id: mock.id, type: 'mock' })),
	}
}

function isLegacyCollections(candidate: unknown): candidate is LegacyCollectionShape {
	if (!candidate || typeof candidate !== 'object') return false
	return Object.values(candidate as Record<string, unknown>).every((value) => {
		if (!value || typeof value !== 'object') return false
		const item = value as { mocks?: unknown }
		return !item.mocks || Array.isArray(item.mocks)
	})
}

function migrateLegacyCollections(
	mocks: IMockResponse[],
	legacy: LegacyCollectionShape,
): { tree: ICollectionTree; mocks: IMockResponse[] } {
	const updatedMocks = [...mocks]
	const tree: ICollectionTree = createEmptyCollectionTree()
	const usedIds = new Set<string>(updatedMocks.map((mock) => mock.id))

	for (const [name, legacyCollection] of Object.entries(legacy)) {
		const rawMocks = Array.isArray(legacyCollection.mocks) ? legacyCollection.mocks : []
		const collectionId = legacyCollection.id != null ? String(legacyCollection.id) : genId()
		const node: ICollectionNode = {
			id: collectionId,
			name,
			parentId: null,
			active: legacyCollection.active !== false,
			createdOn: Date.now(),
			description: legacyCollection.description,
			entries: [],
		}

		for (const mock of rawMocks) {
			const mockId = usedIds.has(mock.id) ? genId() : mock.id
			usedIds.add(mockId)
			const enriched: IMockResponse = {
				...mock,
				id: mockId,
				collectionId,
			}
			updatedMocks.push(enriched)
			node.entries.push({ id: mockId, type: 'mock' })
		}

		tree.nodes[collectionId] = node
		tree.root.push({ id: collectionId, type: 'collection' })
	}

	return { tree, mocks: updatedMocks }
}

function isCollectionTree(candidate: unknown): candidate is ICollectionTree {
	if (!candidate || typeof candidate !== 'object') return false
	const tree = candidate as ICollectionTree
	if (!tree.nodes || typeof tree.nodes !== 'object' || !Array.isArray(tree.root)) return false
	return true
}

function indexEntries(tree: ICollectionTree): Map<string, string | null> {
	const map = new Map<string, string | null>()
	for (const entry of tree.root) {
		map.set(entryKey(entry), null)
	}
	for (const node of Object.values(tree.nodes)) {
		for (const entry of node.entries) {
			map.set(entryKey(entry), node.id)
		}
	}
	return map
}

export function findEntryPlacement(
	tree: ICollectionTree,
	entryId: string,
	type: ICollectionEntry['type'],
): { containerId: string | null; index: number } | null {
	const key = type === 'collection' ? `${COLLECTION_ENTRY_PREFIX}${entryId}` : `${MOCK_ENTRY_PREFIX}${entryId}`
	const locate = (entries: ICollectionEntry[]): number => entries.findIndex((entry) => entryKey(entry) === key)

	const rootIndex = locate(tree.root)
	if (rootIndex >= 0) {
		return { containerId: null, index: rootIndex }
	}

	for (const node of Object.values(tree.nodes)) {
		const idx = locate(node.entries)
		if (idx >= 0) {
			return { containerId: node.id, index: idx }
		}
	}

	return null
}

export function getContainerEntries(tree: ICollectionTree, containerId: string | null): ICollectionEntry[] {
	if (containerId && tree.nodes[containerId]) {
		return [...tree.nodes[containerId].entries]
	}
	return [...tree.root]
}

function appendEntry(
	tree: ICollectionTree,
	containerId: string | null,
	entry: ICollectionEntry,
): ICollectionTree {
	const nextEntryKey = entryKey(entry)
	const indexed = indexEntries(tree)
	if (indexed.has(nextEntryKey)) return tree

	if (containerId && tree.nodes[containerId]) {
		const node = tree.nodes[containerId]
		return {
			root: tree.root,
			nodes: {
				...tree.nodes,
				[containerId]: {
					...node,
					entries: [...node.entries, entry],
				},
			},
		}
	}

	return {
		root: [...tree.root, entry],
		nodes: tree.nodes,
	}
}

function removeEntry(
	tree: ICollectionTree,
	entryId: string,
	type: ICollectionEntry['type'],
): { tree: ICollectionTree; containerId: string | null | undefined } {
	const key = type === 'collection' ? `${COLLECTION_ENTRY_PREFIX}${entryId}` : `${MOCK_ENTRY_PREFIX}${entryId}`
	let containerId: string | null | undefined

	const rootFiltered = tree.root.filter((entry) => {
		const matches = entryKey(entry) === key
		if (matches) containerId = null
		return !matches
	})

	if (containerId === null) {
		return {
			tree: { ...tree, root: rootFiltered },
			containerId,
		}
	}

	const nodes: Record<string, ICollectionNode> = {}
	for (const [id, node] of Object.entries(tree.nodes)) {
		let changed = false
		const entries = node.entries.filter((entry) => {
			const matches = entryKey(entry) === key
			if (matches) {
				containerId = node.id
				changed = true
			}
			return !matches
		})
		nodes[id] = changed ? { ...node, entries } : node
	}

	return {
		containerId,
		tree: containerId === undefined ? tree : { root: rootFiltered, nodes },
	}
}

export function normalizeCollectionTree(params: {
	mocks: IMockResponse[]
	tree?: unknown
	legacy?: unknown
}): { tree: ICollectionTree; mocks: IMockResponse[] } {
	const { mocks, tree: rawTree, legacy } = params
	const baseMocks = mocks.map((mock) => {
		const normalized: IMockResponse = { ...mock, collectionId: mock.collectionId ?? null }
		return normalized
	})
	const validCollectionIds = new Set<string>()

	let tree: ICollectionTree | undefined
	if (isCollectionTree(rawTree)) {
		const candidate = rawTree as ICollectionTree
		for (const id of Object.keys(candidate.nodes || {})) {
			validCollectionIds.add(id)
		}
		tree = {
			root: cloneEntries(candidate.root),
			nodes: Object.fromEntries(
				Object.entries(candidate.nodes || {}).map(([id, node]) => [id, sanitizeNode(node, validCollectionIds)]),
			),
		}
	}

	let mocksWithCollections = baseMocks

	if (!tree) {
		if (isLegacyCollections(legacy)) {
			const migrated = migrateLegacyCollections(baseMocks, legacy as LegacyCollectionShape)
			mocksWithCollections = migrated.mocks
			tree = migrated.tree
		} else {
			tree = buildDefaultTree(baseMocks)
		}
	}

	const mockIds = new Set<string>(mocksWithCollections.map((mock) => mock.id))
	const collectionsIds = new Set<string>(Object.keys(tree.nodes || {}))
	const sanitized = pruneInvalidEntries(tree, collectionsIds, mockIds)
	const indexed = indexEntries(sanitized)

	let nextTree = sanitized
	const nextMocks: IMockResponse[] = mocksWithCollections.map((mock) => {
		const desiredContainer = mock.collectionId && collectionsIds.has(mock.collectionId) ? mock.collectionId : null
		const key = `${MOCK_ENTRY_PREFIX}${mock.id}`
		const locatedContainer = indexed.get(key)
		if (locatedContainer === undefined) {
			nextTree = appendEntry(nextTree, desiredContainer, { id: mock.id, type: 'mock' })
			indexed.set(key, desiredContainer)
			return desiredContainer ? mock : { ...mock, collectionId: null }
		}
		if (desiredContainer !== locatedContainer) {
			const removal = removeEntry(nextTree, mock.id, 'mock')
			nextTree = appendEntry(removal.tree, desiredContainer, { id: mock.id, type: 'mock' })
			indexed.set(key, desiredContainer)
			return desiredContainer ? mock : { ...mock, collectionId: null }
		}
		if (desiredContainer === null && mock.collectionId) {
			return { ...mock, collectionId: null }
		}
		return mock
	})

	return {
		tree: nextTree,
		mocks: nextMocks,
	}
}

export function appendMockToTree(
	tree: ICollectionTree,
	mockId: string,
	collectionId?: string | null,
): ICollectionTree {
	return appendEntry(tree, collectionId ?? null, { id: mockId, type: 'mock' })
}

export function removeMockFromTree(tree: ICollectionTree, mockId: string): ICollectionTree {
	return removeEntry(tree, mockId, 'mock').tree
}

export function isCollectionActive(tree: ICollectionTree, collectionId: string | null | undefined): boolean {
	if (!collectionId) return true
	const node = tree.nodes[collectionId]
	if (!node) return true
	if (!node.active) return false
	return isCollectionActive(tree, node.parentId)
}

export function upsertCollectionNode(
	tree: ICollectionTree,
	node: OmitStrict<ICollectionNode, 'entries'> & { entries?: ICollectionEntry[] },
	options?: { insertInto?: string | null; position?: number },
): ICollectionTree {
	const entries = cloneEntries(node.entries)
	const normalizedNode: ICollectionNode = {
		...node,
		entries,
	}
	const targetId = normalizedNode.id || genId()
	const nodes = {
		...tree.nodes,
		[targetId]: {
			...normalizedNode,
			id: targetId,
		},
	}

	const entry: ICollectionEntry = { id: targetId, type: 'collection' }
	const containerId = options?.insertInto ?? normalizedNode.parentId ?? null
	const position = options?.position

	let root = tree.root
	if (containerId && nodes[containerId]) {
		const parent = nodes[containerId]
		const items = [...parent.entries]
		const exists = items.findIndex((item) => item.type === 'collection' && item.id === targetId) >= 0
		if (!exists) {
			if (typeof position === 'number' && position >= 0 && position <= items.length) {
				items.splice(position, 0, entry)
			} else {
				items.push(entry)
			}
		}
		nodes[containerId] = { ...parent, entries: items }
	} else {
		const items = [...root]
		const exists = items.findIndex((item) => item.type === 'collection' && item.id === targetId) >= 0
		if (!exists) {
			if (typeof position === 'number' && position >= 0 && position <= items.length) {
				items.splice(position, 0, entry)
			} else {
				items.push(entry)
			}
		}
		root = items
	}

	return {
		root,
		nodes,
	}
}

export function moveMockWithinTree(
	tree: ICollectionTree,
	mockId: string,
	targetCollectionId: string | null,
	position?: number,
): ICollectionTree {
	const removal = removeEntry(tree, mockId, 'mock')
	const entry: ICollectionEntry = { id: mockId, type: 'mock' }
	const target = targetCollectionId && removal.tree.nodes[targetCollectionId] ? targetCollectionId : null

	if (target) {
		const node = removal.tree.nodes[target]
		const items = [...node.entries]
		const mocksCount = items.filter((e) => e.type === 'mock').length
		const maxPos = Math.min(Math.max(position ?? 0, 0), items.length)
		const targetIndex = Math.min(maxPos, mocksCount) // inside a collection mocks come before folders
		items.splice(targetIndex, 0, entry)
		return {
			root: removal.tree.root,
			nodes: {
				...removal.tree.nodes,
				[target]: {
					...node,
					entries: items,
				},
			},
		}
	}

	const rootItems = [...removal.tree.root]
	const collectionsCount = rootItems.filter((e) => e.type === 'collection').length
	const maxPos = Math.min(Math.max(position ?? rootItems.length, 0), rootItems.length)
	// at the root: collections first, then mocks
	const targetIndex = Math.max(maxPos, collectionsCount)
	rootItems.splice(targetIndex, 0, entry)

	return {
		root: rootItems,
		nodes: removal.tree.nodes,
	}
}

export function removeCollectionFromTree(tree: ICollectionTree, collectionId: string): ICollectionTree {
	const withoutEntry = removeEntry(tree, collectionId, 'collection').tree
	const cascade = Object.fromEntries(
		Object.entries(withoutEntry.nodes)
			.filter(([id]) => id !== collectionId)
			.map(([id, node]) => (node.parentId === collectionId ? [id, { ...node, parentId: null }] : [id, node])),
	)
	return {
		root: withoutEntry.root,
		nodes: cascade,
	}
}

export function ensureRootEntry(tree: ICollectionTree): ICollectionTree {
	return tree.root ? tree : { ...tree, root: [] }
}

export { ROOT_COLLECTION_ID }

export function moveCollectionWithinTree(
	tree: ICollectionTree,
	collectionId: string,
	targetCollectionId: string | null,
	position?: number,
): ICollectionTree {
	const removal = removeEntry(tree, collectionId, 'collection')
	const entry: ICollectionEntry = { id: collectionId, type: 'collection' }
	const nodes = { ...removal.tree.nodes }
	const movingNode = nodes[collectionId]

	const target = targetCollectionId && nodes[targetCollectionId] ? targetCollectionId : null
	const updateMovingNode = (parentId: string | null): void => {
		nodes[collectionId] = {
			...movingNode,
			parentId,
		}
	}

	if (target) {
		const node = nodes[target]
		const items = [...node.entries]
		const mocksCount = items.filter((e) => e.type === 'mock').length
		const maxPos = Math.min(Math.max(position ?? items.length, 0), items.length)
		const targetIndex = Math.max(maxPos, mocksCount) // collections sit below mocks inside a container
		items.splice(targetIndex, 0, entry)
		updateMovingNode(target)
		return {
			root: removal.tree.root,
			nodes: {
				...nodes,
				[target]: { ...node, entries: items },
			},
		}
	}

	const rootItems = [...removal.tree.root]
	const mocksCount = rootItems.filter((e) => e.type === 'mock').length
	const maxPos = Math.min(Math.max(position ?? rootItems.length, 0), rootItems.length)
	const targetIndex = Math.max(maxPos, mocksCount) // collections sit below mocks at the root
	rootItems.splice(targetIndex, 0, entry)
	updateMovingNode(null)
	return {
		root: rootItems,
		nodes,
	}
}

export function isDescendantCollection(tree: ICollectionTree, ancestorId: string, candidateId: string): boolean {
	let current = tree.nodes[candidateId]
	while (current) {
		if (current.parentId === ancestorId) return true
		if (!current.parentId) return false
		current = tree.nodes[current.parentId]
	}
	return false
}

