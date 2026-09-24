import { describe, expect, it } from 'vitest'

import {
	addAIProvider,
	createDefaultAISettings,
	createProvider,
	getActiveAIProvider,
	getAISettings,
	normalizeAISettings,
	removeAIProvider,
	setActiveAIProvider,
	setAIEnabled,
	setGlobalSystemPrompt,
	updateAIProvider,
} from '../ai-settings'
import { createEmptyCollectionTree } from '../../../interface/collection'
import type { IAIProviderConfig, IAISettings } from '../../../interface/ai'
import type { IStore } from '../../../interface/mock'

function makeStore(ai?: IAISettings): IStore {
	return {
		active: false,
		theme: 'light',
		mocks: [],
		totalMocksCreated: 0,
		activityInfo: { promoted: false },
		collectionTree: createEmptyCollectionTree(),
		ai,
	}
}

function makeProvider(overrides: Partial<IAIProviderConfig> = {}): IAIProviderConfig {
	return {
		id: 'p-1',
		name: 'OpenAI',
		baseURL: 'https://api.openai.com/v1',
		apiKey: 'sk-test',
		model: 'gpt-4o-mini',
		createdOn: 1,
		...overrides,
	}
}

describe('createDefaultAISettings', () => {
	it('returns disabled, empty defaults', () => {
		const settings = createDefaultAISettings()
		expect(settings.enabled).toBe(false)
		expect(settings.activeProviderId).toBeNull()
		expect(settings.providers).toEqual([])
	})
})

describe('normalizeAISettings', () => {
	it('fills defaults when the ai field is missing', () => {
		const store = normalizeAISettings(makeStore())
		expect(store.ai).toEqual(createDefaultAISettings())
	})

	it('drops invalid providers and restores activeProviderId', () => {
		const store = normalizeAISettings(makeStore({
			enabled: true,
			activeProviderId: 'missing',
			providers: [
				makeProvider({ id: 'p-1' }),
				{ id: 'broken' } as unknown as IAIProviderConfig,
			],
		}))
		expect(store.ai?.providers).toHaveLength(1)
		expect(store.ai?.providers[0].id).toBe('p-1')
		expect(store.ai?.activeProviderId).toBe('p-1')
	})

	it('clears the enabled flag when no providers remain', () => {
		const store = normalizeAISettings(makeStore({
			enabled: true,
			activeProviderId: null,
			providers: [],
		}))
		expect(store.ai?.enabled).toBe(false)
	})
})

describe('createProvider', () => {
	it('generates id and createdOn', () => {
		const provider = createProvider({
			name: 'x',
			baseURL: 'https://x',
			apiKey: 'k',
			model: 'm',
		})
		expect(provider.id).toMatch(/^[0-9a-f-]{36}$/i)
		expect(provider.createdOn).toBeGreaterThan(0)
	})

	it('does not let the caller forge id or createdOn', () => {
		const provider = createProvider({
			name: 'x',
			baseURL: 'https://x',
			apiKey: 'k',
			model: 'm',
			// @ts-expect-error — intentionally testing runtime invariant
			id: 'forged',
		})
		expect(provider.id).not.toBe('forged')
	})
})

describe('addAIProvider', () => {
	it('adds a provider and auto-activates the first one', () => {
		const store = addAIProvider(makeStore(), makeProvider())
		expect(store.ai?.providers).toHaveLength(1)
		expect(store.ai?.activeProviderId).toBe('p-1')
		expect(store.ai?.enabled).toBe(true)
	})

	it('keeps activeProviderId when it is already set', () => {
		const initial = addAIProvider(makeStore(), makeProvider({ id: 'p-1' }))
		const next = addAIProvider(initial, makeProvider({ id: 'p-2' }))
		expect(next.ai?.activeProviderId).toBe('p-1')
		expect(next.ai?.providers).toHaveLength(2)
	})
})

describe('updateAIProvider', () => {
	it('patches the matching provider', () => {
		const initial = addAIProvider(makeStore(), makeProvider({ id: 'p-1' }))
		const next = updateAIProvider(initial, 'p-1', { model: 'gpt-4o' })
		expect(next.ai?.providers[0].model).toBe('gpt-4o')
	})

	it('ignores unknown ids without throwing', () => {
		const initial = addAIProvider(makeStore(), makeProvider({ id: 'p-1' }))
		const next = updateAIProvider(initial, 'p-missing', { model: 'nope' })
		expect(next.ai?.providers[0].model).toBe('gpt-4o-mini')
	})
})

describe('removeAIProvider', () => {
	it('removes the matching provider and moves active to the first remaining one', () => {
		const initial = addAIProvider(
			addAIProvider(makeStore(), makeProvider({ id: 'p-1' })),
			makeProvider({ id: 'p-2' }),
		)
		const next = removeAIProvider(initial, 'p-1')
		expect(next.ai?.providers).toHaveLength(1)
		expect(next.ai?.activeProviderId).toBe('p-2')
	})

	it('clears active and disables AI when the last provider is removed', () => {
		const initial = addAIProvider(makeStore(), makeProvider({ id: 'p-1' }))
		const next = removeAIProvider(initial, 'p-1')
		expect(next.ai?.activeProviderId).toBeNull()
		expect(next.ai?.enabled).toBe(false)
	})
})

describe('setActiveAIProvider', () => {
	it('switches active when the target exists', () => {
		const store = addAIProvider(
			addAIProvider(makeStore(), makeProvider({ id: 'p-1' })),
			makeProvider({ id: 'p-2' }),
		)
		const next = setActiveAIProvider(store, 'p-2')
		expect(next.ai?.activeProviderId).toBe('p-2')
	})

	it('refuses an unknown id (does nothing)', () => {
		const store = addAIProvider(makeStore(), makeProvider({ id: 'p-1' }))
		const next = setActiveAIProvider(store, 'p-missing')
		expect(next).toBe(store)
	})

	it('accepts null to clear active', () => {
		const store = addAIProvider(makeStore(), makeProvider({ id: 'p-1' }))
		const next = setActiveAIProvider(store, null)
		expect(next.ai?.activeProviderId).toBeNull()
	})
})

describe('setAIEnabled', () => {
	it('refuses to enable when no providers are configured', () => {
		const store = makeStore(createDefaultAISettings())
		const next = setAIEnabled(store, true)
		expect(next.ai?.enabled).toBe(false)
	})

	it('toggles when providers exist', () => {
		const store = addAIProvider(makeStore(), makeProvider())
		const off = setAIEnabled(store, false)
		expect(off.ai?.enabled).toBe(false)
		const on = setAIEnabled(off, true)
		expect(on.ai?.enabled).toBe(true)
	})
})

describe('setGlobalSystemPrompt', () => {
	it('stores the value without surrounding spaces', () => {
		const store = makeStore(createDefaultAISettings())
		const next = setGlobalSystemPrompt(store, 'be terse')
		expect(next.ai?.globalSystemPrompt).toBe('be terse')
	})

	it('treats an empty string as undefined', () => {
		const store = setGlobalSystemPrompt(makeStore(createDefaultAISettings()), 'x')
		const next = setGlobalSystemPrompt(store, '')
		expect(next.ai?.globalSystemPrompt).toBeUndefined()
	})
})

describe('getActiveAIProvider', () => {
	it('returns the active provider object', () => {
		const store = addAIProvider(makeStore(), makeProvider({ id: 'p-1' }))
		expect(getActiveAIProvider(store)?.id).toBe('p-1')
	})

	it('returns null when there are no providers', () => {
		expect(getActiveAIProvider(makeStore())).toBeNull()
	})
})

describe('getAISettings', () => {
	it('always returns a normalised settings object', () => {
		const settings = getAISettings(makeStore())
		expect(settings.providers).toEqual([])
		expect(settings.activeProviderId).toBeNull()
	})
})
