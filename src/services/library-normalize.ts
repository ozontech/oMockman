import { createDefaultAISettings, normalizeAISettings } from './ai/ai-settings'
import { normalizeCollectionTree } from './collection-tree'
import { normalizeEnv } from './env'
import { normalizeSitePermissions } from './origin'

import { createEmptyCollectionTree } from '@/interface/collection'
import type { IStore } from '@/interface/mock'

export const defaultLibrary = (): IStore => ({
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

/** Shared normalization for legacy reads and authoritative background writes. */
export function normalizeLibrary(raw: Partial<IStore> & { collections?: unknown }): IStore {
	const merged = { ...defaultLibrary(), ...raw }
	const { tree, mocks } = normalizeCollectionTree({
		mocks: Array.isArray(merged.mocks) ? merged.mocks : [],
		tree: merged.collectionTree,
		legacy: raw.collections,
	})
	const store = { ...merged, collectionTree: tree, mocks }
	delete store.collections
	return normalizeSitePermissions(normalizeAISettings(normalizeEnv(store)))
}
