import { match as getMatcher } from 'path-to-regexp'

import {
	appendMockToTree,
	moveMockWithinTree,
	normalizeCollectionTree,
	removeMockFromTree,
	moveCollectionWithinTree,
	isDescendantCollection,
	upsertCollectionNode,
} from './collection-tree'
import type { CollectionMovePayload } from './collection-tree'
import { StorageWriteError } from './storage-error'

import { createDefaultAISettings, normalizeAISettings } from '@/services/ai'
import { createEmptyCollectionTree } from '@/interface/collection'
import type { ICollectionEntry, ICollectionNode } from '@/interface/collection'
import type { IDynamicURLMap, IMockResponse, IStore, IURLMap } from '@/interface/mock'
import { MessageAPI } from '@/services/message/api'
import { getActiveEnvVars, normalizeEnv, resolveTemplate } from '@/services/env'
import { normalizeSitePermissions } from '@/services/origin'
import { normalizeUrl } from '@/services/url'
import type { MockmanExportBundle } from '@/services/mock-import'
import { genId } from '@/services/helper'

export type { CollectionMovePayload } from './collection-tree'

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

const getNetworkMethodMap = (): Record<Method, string[]> => ({
	GET: [],
	POST: [],
	PATCH: [],
	PUT: [],
	DELETE: [],
})

const detectDynamic = (url?: string): boolean => {
	if (typeof url !== 'string') return false
	return url.includes('(.*)') || url.includes('/:')
}

export const STORE_NAME = 'mockman.extension.main.db'

export const getDefaultStore = (): IStore => ({
	theme: 'light',
	active: false,
	mocks: [],
	totalMocksCreated: 0,
	collectionTree: createEmptyCollectionTree(),
	activityInfo: { promoted: false },
	env: {
		activeId: 'default',
		profiles: [{ id: 'default', name: 'default', vars: { BASE_URL: '' } }],
	},
	ai: createDefaultAISettings(),
})

export const getStore = (
	name: string = STORE_NAME,
): Promise<{
	store: IStore
	urlMap: IURLMap
	dynamicUrlMap: IDynamicURLMap
}> =>
	new Promise((resolve) => {
		chrome.storage.local.get([name], (res) => {
			const raw = res[name] ?? {}
			const merged = { ...getDefaultStore(), ...raw } as IStore & { collections?: unknown; collectionTree?: unknown }
			const baseMocks = Array.isArray(merged.mocks) ? merged.mocks : []
			const { tree, mocks } = normalizeCollectionTree({
				mocks: baseMocks,
				tree: merged.collectionTree,
				legacy: (raw as { collections?: unknown })?.collections,
			})
			const store: IStore = {
				...merged,
				mocks,
				collectionTree: tree,
			}
			delete (store as unknown as { collections?: unknown }).collections
			const normalizedStore = normalizeSitePermissions(normalizeAISettings(normalizeEnv(store)))
			const { urlMap, dynamicUrlMap } = getURLMapWithStore(normalizedStore)
			resolve({ store: normalizedStore, urlMap, dynamicUrlMap })
		})
	})

export const updateStoreInDB = (
	store: IStore,
): Promise<{
	store: IStore
	urlMap: IURLMap
	dynamicUrlMap: IDynamicURLMap
}> =>
	new Promise((resolve, reject) => {
		try {
			const baseMocks = Array.isArray(store.mocks) ? store.mocks : []
			const { tree, mocks } = normalizeCollectionTree({ mocks: baseMocks, tree: store.collectionTree })
			const nextStore: IStore = {
				...store,
				mocks,
				collectionTree: tree,
			}
			const normalizedStore = normalizeSitePermissions(normalizeAISettings(normalizeEnv(nextStore)))
			chrome.storage.local.set({ [STORE_NAME]: normalizedStore }, () => {
				const lastError = chrome.runtime?.lastError
				if (lastError) {
					reject(new StorageWriteError(lastError.message ?? 'unknown error'))
					return
				}
				const { urlMap, dynamicUrlMap } = getURLMapWithStore(normalizedStore)
				resolve({ store: normalizedStore, urlMap, dynamicUrlMap })
			})
		} catch (err) {
			reject(new StorageWriteError(err instanceof Error ? err.message : String(err)))
		}
	})

export const getURLMapWithStore = (
	store: IStore,
): { urlMap: IURLMap; dynamicUrlMap: IDynamicURLMap; store: IStore } => {
	const urlMap: IURLMap = {}
	const dynamicUrlMap: IDynamicURLMap = {}
	const vars = getActiveEnvVars(store)

	store.mocks.forEach((mock, idx) => {
		const path = `mocks[${idx}]`
		const effectiveUrl = normalizeUrl(resolveTemplate(mock.url, vars))
		if (mock.dynamic) {
			addDynamic(mock, path, effectiveUrl)
			return
		}

		urlMap[effectiveUrl] ??= getNetworkMethodMap()
		urlMap[effectiveUrl][mock.method as Method].push(path)
	})

	return { urlMap, dynamicUrlMap, store }

	function addDynamic(mock: IMockResponse, path: string, effectiveUrl: string): void {
		const replaced = effectiveUrl.replace('://', '-')
		const depth = replaced.split('/').length

		const matcher: IDynamicURLMap[number][0] = {
			getterKey: path,
			method: mock.method,
			url: replaced,
			match: getMatcher(replaced, { decode: decodeURIComponent }),
		}

		if (dynamicUrlMap[depth]) {
			dynamicUrlMap[depth].push(matcher)
		} else {
			dynamicUrlMap[depth] = [matcher]
		}
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
			name: node.name ?? 'Collection',
			parentId: mapCollectionId(node.parentId) ?? null,
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

export const updateCollectionOpenApiUrl = (draft: IStore, collectionId: string, openApiUrl: string): IStore => {
	const existing = draft.collectionTree.nodes[collectionId]
	if (!existing) return draft
	return {
		...draft,
		collectionTree: {
			...draft.collectionTree,
			nodes: {
				...draft.collectionTree.nodes,
				[collectionId]: { ...existing, openApiUrl: openApiUrl || undefined },
			},
		},
	}
}

export const applyCollectionOpenApiToMocks = (draft: IStore, collectionId: string, openApiUrl: string): IStore => {
	const collectionIds = collectDescendantCollections(draft.collectionTree, collectionId)
	const mocks = draft.mocks.map((mock) => {
		const ownerCollectionId = mock.collectionId ?? ''
		if (!collectionIds.has(ownerCollectionId)) return mock
		return { ...mock, openApiUrl: openApiUrl || undefined }
	})
	return {
		...draft,
		mocks,
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

export const setCollectionBranchActive = (draft: IStore, collectionId: string, active: boolean): IStore => {
	if (!draft.collectionTree.nodes[collectionId]) return draft
	const collectionIds = collectDescendantCollections(draft.collectionTree, collectionId)

	const nodes: Record<string, ICollectionNode> = {}
	for (const [id, node] of Object.entries(draft.collectionTree.nodes)) {
		if (collectionIds.has(id)) {
			nodes[id] = { ...node, active }
		} else {
			nodes[id] = node
		}
	}

	const mocks = draft.mocks.map((mock) => {
		const ownerCollectionId = mock.collectionId ?? ''
		if (!collectionIds.has(ownerCollectionId)) return mock
		return { ...mock, active }
	})

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
	updateCollectionOpenApiUrl,
	applyCollectionOpenApiToMocks,
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
