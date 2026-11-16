export { getStore, getDefaultStore, getURLMapWithStore, STORE_NAME } from '@/services/library-read'

import { StorageWriteError } from './storage-error'

import {
	appendMockToTree,
	moveMockWithinTree,
	removeMockFromTree,
	moveCollectionWithinTree,
	isDescendantCollection,
	upsertCollectionNode,
} from '@/services/collection-tree'
import type { CollectionMovePayload } from '@/services/collection-tree'
import { getStore, getDefaultStore, getURLMapWithStore } from '@/services/library-read'
import { sendLibraryCommand } from '@/services/library-client'
import type { ICollectionEntry, ICollectionNode, ICollectionScenario } from '@/interface/collection'
import type { IDynamicURLMap, IMockResponse, IStore, IURLMap } from '@/interface/mock'
import { MessageAPI } from '@/services/message/api'
import type { MockmanExportBundle } from '@/services/mock-import'
import { genId } from '@/services/helper'

export type { CollectionMovePayload } from '@/services/collection-tree'

const detectDynamic = (url?: string): boolean => {
	if (typeof url !== 'string') return false
	return url.includes('(.*)') || url.includes('/:')
}

export const updateStoreInDB = async (store: IStore): Promise<{ store: IStore; urlMap: IURLMap; dynamicUrlMap: IDynamicURLMap }> => {
 try {
  const answer = await sendLibraryCommand({ action: 'replace', expectedRevision: store.revision ?? 0, store })
  if (!answer.ok || !answer.store) throw new StorageWriteError(answer.error ?? 'BACKGROUND_UNAVAILABLE')
  const { urlMap, dynamicUrlMap } = getURLMapWithStore(answer.store)
  return { store: answer.store, urlMap, dynamicUrlMap }
 } catch (error) {
  if (error instanceof StorageWriteError) throw error
  throw new StorageWriteError(error instanceof Error ? error.message : String(error))
 }
}

export const addMocks = (
	draft: IStore,
	data: IMockResponse | IMockResponse[],
): IStore => {
	const store = { ...draft }
	const payload = Array.isArray(data) ? data : [data]
	const existingIds = new Set(store.mocks.map((m) => m.id))
	let tree = store.collectionTree
	const enriched: IMockResponse[] = []
	const rootNewMockIds: string[] = []

	for (const item of payload) {
		let identifier = item.id
		if (!identifier || existingIds.has(identifier)) {
			identifier = genId()
		}
		existingIds.add(identifier)
		const url = item.url ?? ''
		const collectionId = item.collectionId ?? null
		const mock: IMockResponse = {
			...item,
			id: identifier,
			dynamic: detectDynamic(url),
			collectionId,
		}
		enriched.push(mock)
		tree = appendMockToTree(tree, identifier, collectionId)
		if (!collectionId) rootNewMockIds.push(identifier)
	}

	if (rootNewMockIds.length) {
		const collections = tree.root.filter((e) => e.type === 'collection')
		const mocksEntries = tree.root.filter((e) => e.type === 'mock')
		const newRootMocks = mocksEntries.filter((e) => rootNewMockIds.includes(e.id))
		const oldRootMocks = mocksEntries.filter((e) => !rootNewMockIds.includes(e.id))
		tree = {
			...tree,
			root: [...collections, ...newRootMocks, ...oldRootMocks],
		}
	}

	const wasEmpty = store.mocks.length === 0
	return {
		...store,
		mocks: [...store.mocks, ...enriched],
		collectionTree: tree,
		totalMocksCreated: store.totalMocksCreated + enriched.length,
		active: wasEmpty ? true : store.active,
	}
}

/** Points the rules of an imported scenario at the new ids of its mocks; a rule whose mock did not come along goes. */
function remapScenario(scenario: ICollectionScenario, mockIdMap: Map<string, string>): ICollectionScenario {
	const rules = scenario.rules.flatMap((rule) => {
		if (!('mockId' in rule.respond)) return [rule]
		const mockId = mockIdMap.get(rule.respond.mockId)
		return mockId ? [{ ...rule, respond: { mockId } }] : []
	})
	return { ...scenario, rules }
}

export const importCollectionBundle = (
	draft: IStore,
	bundle: MockmanExportBundle,
): IStore => {
	const store = { ...draft }
	const existingMockIds = new Set(store.mocks.map((m) => m.id))
	const existingCollectionIds = new Set(Object.keys(store.collectionTree.nodes))
	const collectionIdMap = new Map<string, string>()
	const mockIdMap = new Map<string, string>()

	const mapCollectionId = (oldId: string | null | undefined): string | null => {
		if (!oldId) return null
		if (collectionIdMap.has(oldId)) return collectionIdMap.get(oldId) as string
		let candidate = existingCollectionIds.has(oldId) ? genId() : oldId
		while (existingCollectionIds.has(candidate)) {
			candidate = genId()
		}
		collectionIdMap.set(oldId, candidate)
		existingCollectionIds.add(candidate)
		return candidate
	}

	const mapMockId = (oldId?: string): string => {
		const base = typeof oldId === 'string' && oldId.trim() ? oldId : genId()
		if (mockIdMap.has(base)) return mockIdMap.get(base) as string
		let candidate = existingMockIds.has(base) ? genId() : base
		while (existingMockIds.has(candidate)) {
			candidate = genId()
		}
		mockIdMap.set(base, candidate)
		existingMockIds.add(candidate)
		return candidate
	}

	const mappedMocks = bundle.mocks.map((mock) => {
		const mappedId = mapMockId(mock.id)
		const mappedCollection = mock.collectionId ? mapCollectionId(mock.collectionId) : null
		return {
			...mock,
			id: mappedId,
			collectionId: mappedCollection,
			dynamic: detectDynamic(mock.url ?? ''),
			active: mock.active,
		}
	})

	const referencedMocks = new Set<string>()
	const referencedCollections = new Set<string>()

	const remapEntry = (entry: ICollectionEntry | null | undefined): ICollectionEntry | null => {
		if (!entry) return null
		if (entry.type === 'collection') {
			const id = mapCollectionId(entry.id)
			if (!id) return null
			referencedCollections.add(id)
			return { id, type: 'collection' }
		}
		const mappedId = mockIdMap.get(entry.id)
		if (mappedId) {
			referencedMocks.add(mappedId)
			return { id: mappedId, type: 'mock' }
		}
		return null
	}

	const mappedNodes: Record<string, ICollectionNode> = {}

	for (const [id, node] of Object.entries(bundle.collectionTree.nodes || {})) {
		const newId = mapCollectionId(id)
		if (!newId) continue
		const entries = (node.entries || []).map(remapEntry).filter(Boolean) as ICollectionEntry[]
		mappedNodes[newId] = {
			...node,
			id: newId,
			automation: node.automation ? { ...node.automation, scenarioKey: `imported/${genId()}`, mockIds: Object.fromEntries(Object.entries(node.automation.mockIds).filter(([, oldId]) => mockIdMap.has(oldId)).map(([key, oldId]) => [key, mockIdMap.get(oldId) as string])) } : undefined,
			name: node.name ?? 'Collection',
			parentId: mapCollectionId(node.parentId) ?? null,
			scenario: node.scenario && remapScenario(node.scenario, mockIdMap),
			entries,
		}
	}

	const mappedRoot = (bundle.collectionTree.root || []).map(remapEntry).filter(Boolean) as ICollectionEntry[]

	referencedCollections.forEach((id) => {
		if (!mappedNodes[id]) {
			mappedNodes[id] = {
				id,
				name: 'Collection',
				parentId: null,
				active: true,
				createdOn: Date.now(),
				entries: [],
			}
		}
	})

	const missingMockEntries: ICollectionEntry[] = mappedMocks
		.filter((mock) => !referencedMocks.has(mock.id))
		.map((mock) => ({ id: mock.id, type: 'mock' }))

	const rootCollectionsNew = mappedRoot.filter((e) => e.type === 'collection')
	const rootMocksNew = [...mappedRoot.filter((e) => e.type === 'mock'), ...missingMockEntries]

	const existingRootCollections = store.collectionTree.root.filter((e) => e.type === 'collection')
	const existingRootMocks = store.collectionTree.root.filter((e) => e.type === 'mock')

	const dedupeEntries = (entries: ICollectionEntry[]): ICollectionEntry[] => {
		const seen = new Set<string>()
		const result: ICollectionEntry[] = []
		for (const entry of entries) {
			const key = `${entry.type}:${entry.id}`
			if (seen.has(key)) continue
			seen.add(key)
			result.push(entry)
		}
		return result
	}

	const root = dedupeEntries([
		...rootCollectionsNew,
		...existingRootCollections,
		...rootMocksNew,
		...existingRootMocks,
	])

	return {
		...store,
		mocks: [...store.mocks, ...mappedMocks],
		collectionTree: {
			root,
			nodes: {
				...store.collectionTree.nodes,
				...mappedNodes,
			},
		},
		totalMocksCreated: store.totalMocksCreated + mappedMocks.length,
	}
}

type PartialMockWithId = { id: IMockResponse['id'] } & Partial<IMockResponse>

export const updateMocks = (
	draft: IStore,
	data: PartialMockWithId | PartialMockWithId[],
): IStore => {
	const store = { ...draft }
	const payload = Array.isArray(data) ? data : [data]
	const patchMap = new Map(payload.map((m) => [m.id, m]))
	let tree = store.collectionTree

	const nextMocks = store.mocks.map((original) => {
		const patch = patchMap.get(original.id)
		if (!patch) return original
		const nextUrl = patch.url ?? original.url
		const hasCollectionUpdate = Object.prototype.hasOwnProperty.call(patch, 'collectionId')
		const previousCollection = original.collectionId ?? null
		const nextCollection = hasCollectionUpdate ? (patch.collectionId ?? null) : previousCollection
		if (nextCollection !== previousCollection) {
			tree = moveMockWithinTree(tree, original.id, nextCollection)
		}
		return {
			...original,
			...patch,
			dynamic: detectDynamic(nextUrl),
			collectionId: nextCollection,
		}
	})

	return {
		...store,
		mocks: nextMocks,
		collectionTree: tree,
	}
}

export const deleteMocks = (draft: IStore, ids: string | string[]): IStore => {
	const idSet = new Set(Array.isArray(ids) ? ids : [ids])
	let tree = draft.collectionTree
	const mocks = draft.mocks.filter((mock) => {
		if (idSet.has(mock.id)) {
			tree = removeMockFromTree(tree, mock.id)
			return false
		}
		return true
	})
	return {
		...draft,
		mocks,
		collectionTree: tree,
	}
}

export const createCollection = (
	draft: IStore,
	payload: { name: string; parentId?: string | null },
): IStore => {
	const parentId = payload.parentId ?? null
	const id = genId()
	const node = {
		id,
		name: payload.name,
		parentId,
		active: true,
		createdOn: Date.now(),
		entries: [],
	}
	const tree = upsertCollectionNode(draft.collectionTree, node, {
		insertInto: parentId,
		position: parentId ? undefined : 0,
	})
	return {
		...draft,
		collectionTree: tree,
	}
}

export const renameCollection = (draft: IStore, collectionId: string, name: string): IStore => {
	const existing = draft.collectionTree.nodes[collectionId]
	if (!existing) return draft
	return {
		...draft,
		collectionTree: {
			...draft.collectionTree,
			nodes: {
				...draft.collectionTree.nodes,
				[collectionId]: { ...existing, name },
			},
		},
	}
}

/** Saves a collection's scenario; none removes it. */
export const updateCollectionScenario = (
	draft: IStore,
	collectionId: string,
	scenario: ICollectionScenario | undefined,
): IStore => {
	const existing = draft.collectionTree.nodes[collectionId]
	if (!existing) return draft
	return {
		...draft,
		collectionTree: {
			...draft.collectionTree,
			nodes: { ...draft.collectionTree.nodes, [collectionId]: { ...existing, scenario } },
		},
	}
}

export const applyCollectionMove = (draft: IStore, payload: CollectionMovePayload): IStore => {
	const store = { ...draft }
	if (payload.entryType === 'mock') {
		const tree = moveMockWithinTree(store.collectionTree, payload.entryId, payload.to.containerId ?? null, payload.to.index)
		const mocks = store.mocks.map((mock) => (
			mock.id === payload.entryId
				? { ...mock, collectionId: payload.to.containerId ?? null }
				: mock
		))
		return {
			...store,
			mocks,
			collectionTree: tree,
		}
	}

	if (payload.entryType === 'collection') {
		const targetContainer = payload.to.containerId ?? null
		if (
			targetContainer &&
			(targetContainer === payload.entryId || isDescendantCollection(store.collectionTree, payload.entryId, targetContainer))
		) {
			// Same reference, so callers skip the write.
			return draft
		}
		const tree = moveCollectionWithinTree(store.collectionTree, payload.entryId, targetContainer, payload.to.index)
		return {
			...store,
			collectionTree: tree,
		}
	}

	return draft
}

function collectDescendantCollections(tree: { nodes: Record<string, ICollectionNode> }, rootId: string): Set<string> {
	const acc = new Set<string>()
	const stack: string[] = [rootId]
	while (stack.length) {
		const id = stack.pop() as string
		if (acc.has(id)) continue
		acc.add(id)
		const node = tree.nodes[id]
		if (!node) continue
		node.entries.forEach((e) => {
			if (e.type === 'collection') stack.push(e.id)
		})
	}
	return acc
}

/**
 * Switches a collection with its subcollections. Switching off turns every mock of the branch off;
 * switching on leaves them off, to be turned on one by one.
 */
export const setCollectionBranchActive = (draft: IStore, collectionId: string, active: boolean): IStore => {
	if (!draft.collectionTree.nodes[collectionId]) return draft
	const collectionIds = collectDescendantCollections(draft.collectionTree, collectionId)
	const inBranch = (mock: IMockResponse) => collectionIds.has(mock.collectionId ?? '')

	const nodes: Record<string, ICollectionNode> = {}
	for (const [id, node] of Object.entries(draft.collectionTree.nodes)) {
		if (collectionIds.has(id)) {
			nodes[id] = { ...node, active }
		} else {
			nodes[id] = node
		}
	}

	const mocks = active ? draft.mocks : draft.mocks.map((mock) => (inBranch(mock) && mock.active ? { ...mock, active: false } : mock))

	return {
		...draft,
		mocks,
		collectionTree: {
			...draft.collectionTree,
			nodes,
		},
	}
}

export const deleteCollectionDeep = (draft: IStore, collectionId: string): IStore => {
	const idsToDelete = collectDescendantCollections(draft.collectionTree, collectionId)
	new Set(draft.mocks.map((m) => m.id))
	const remainingMocks = draft.mocks.filter((m) => !idsToDelete.has(m.collectionId ?? ''))
	const remainingMockIds = new Set(remainingMocks.map((m) => m.id))

	const nodes: Record<string, ICollectionNode> = {}
	for (const [id, node] of Object.entries(draft.collectionTree.nodes)) {
		if (idsToDelete.has(id)) continue
		const filteredEntries = node.entries.filter((e) => {
			if (e.type === 'collection') return !idsToDelete.has(e.id)
			return remainingMockIds.has(e.id)
		})
		nodes[id] = { ...node, entries: filteredEntries }
	}
	const root = draft.collectionTree.root.filter((e) => {
		if (e.type === 'collection') return !idsToDelete.has(e.id)
		return remainingMockIds.has(e.id)
	})

	return {
		...draft,
		mocks: remainingMocks,
		collectionTree: { nodes, root },
	}
}

export const refreshContentStore = (tabId?: number): void => {
	MessageAPI.notifyUpdateStore(tabId)
}

export const storeActions = {
	addMocks,
	updateMocks,
	deleteMocks,
	createCollection,
	renameCollection,
	updateCollectionScenario,
	setCollectionBranchActive,
	applyCollectionMove,
	deleteCollectionDeep,
	importCollectionBundle,
	getURLMapWithStore,
	getStore,
	updateStoreInDB,
	getDefaultStore,
	refreshContentStore,
}
