import { create } from 'zustand'

import { getDefaultStore, getStore } from '../service'

import type { IDynamicURLMap, IMockResponse, IStore, IURLMap } from '@/interface/mock'

export type StoreProperties = {
	store: IStore
	urlMap: IURLMap
	dynamicUrlMap: IDynamicURLMap
}

export interface useChromeStoreState extends StoreProperties {
	init: () => void
	setStoreProperties: (p: StoreProperties) => void
	selectedMock?: Partial<IMockResponse>
	setSelectedMock: (mock?: Partial<IMockResponse>) => void
	updateCounter: number
	forceUpdate: () => void
	expandedCollections: string[]
	setExpandedCollections: (ids: string[]) => void
}

const EXPANDED_COLLECTIONS_LS_KEY = 'mockman.expandedCollections'

const readExpandedCollections = (): string[] | null => {
	if (typeof window === 'undefined') return null
	try {
		const raw = window.localStorage.getItem(EXPANDED_COLLECTIONS_LS_KEY)
		if (!raw) return null
		const parsed = JSON.parse(raw) as unknown
		if (!Array.isArray(parsed)) return null
		return parsed.filter((item): item is string => typeof item === 'string')
	} catch {
		return null
	}
}

const writeExpandedCollections = (ids: string[]): void => {
	if (typeof window === 'undefined') return
	try {
		window.localStorage.setItem(EXPANDED_COLLECTIONS_LS_KEY, JSON.stringify(ids))
	} catch {
		void 0
	}
}

const getAllCollectionIds = (store: IStore): string[] => Object.keys(store.collectionTree.nodes)

const normalizeExpanded = (store: IStore, current: string[] | null | undefined): string[] => {
	const available = new Set(getAllCollectionIds(store))
	if (current == null) {
		return Array.from(available)
	}
	return current.filter((id) => available.has(id))
}

export const useChromeStore = create<useChromeStoreState>((set, get) => ({
	store: getDefaultStore(),
	urlMap: {},
	dynamicUrlMap: {},
	updateCounter: 0,
	expandedCollections: getAllCollectionIds(getDefaultStore()),

	init: async (): Promise<void> => {
		const { store, urlMap, dynamicUrlMap } = await getStore()
		const persistedExpanded = readExpandedCollections()
		const expandedCollections = normalizeExpanded(
			store,
			persistedExpanded ?? get().expandedCollections,
		)
		writeExpandedCollections(expandedCollections)
		set({
			store,
			urlMap,
			dynamicUrlMap,
			expandedCollections,
			updateCounter: get().updateCounter + 1,
		})
	},

	setStoreProperties: ({ store, urlMap, dynamicUrlMap }): void => {
		const expandedCollections = normalizeExpanded(store, get().expandedCollections)
		writeExpandedCollections(expandedCollections)
		set({
			store,
			urlMap,
			dynamicUrlMap,
			expandedCollections,
			updateCounter: get().updateCounter + 1,
		})
	},

	selectedMock: undefined,

	setSelectedMock: (mock?: Partial<IMockResponse>): void => {
		set({
			selectedMock: mock,
			updateCounter: get().updateCounter + 1,
		})
	},

	forceUpdate: (): void => {
		set({ updateCounter: get().updateCounter + 1 })
	},

	setExpandedCollections: (ids: string[]): void => {
		writeExpandedCollections(ids)
		set({
			expandedCollections: ids,
			updateCounter: get().updateCounter + 1,
		})
	},
}))
