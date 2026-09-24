
import type { OmitStrict } from '@/interface/utility'
import type { IAIProviderConfig, IAISettings } from '@/interface/ai'
import type { IStore } from '@/interface/mock'
import { genId } from '@/services/helper'

export function createDefaultAISettings(): IAISettings {
	return {
		enabled: false,
		activeProviderId: null,
		providers: [],
	}
}

export function normalizeAISettings(store: IStore): IStore {
	const ai = store.ai
	if (!ai || typeof ai !== 'object') {
		return { ...store, ai: createDefaultAISettings() }
	}

	const providers = Array.isArray(ai.providers) ? ai.providers.filter(isValidProvider) : []
	const activeProviderId = providers.some((p) => p.id === ai.activeProviderId)
		? ai.activeProviderId
		: providers[0]?.id ?? null

	return {
		...store,
		ai: {
			enabled: Boolean(ai.enabled) && providers.length > 0,
			activeProviderId,
			providers,
			globalSystemPrompt: typeof ai.globalSystemPrompt === 'string' ? ai.globalSystemPrompt : undefined,
		},
	}
}

function isValidProvider(value: unknown): value is IAIProviderConfig {
	if (!value || typeof value !== 'object') return false
	const candidate = value as Partial<IAIProviderConfig>
	return typeof candidate.id === 'string'
		&& typeof candidate.name === 'string'
		&& typeof candidate.baseURL === 'string'
		&& typeof candidate.apiKey === 'string'
		&& typeof candidate.model === 'string'
}

export function getAISettings(store: IStore): IAISettings {
	return normalizeAISettings(store).ai as IAISettings
}

export function getActiveAIProvider(store: IStore): IAIProviderConfig | null {
	const settings = getAISettings(store)
	if (!settings.activeProviderId) return null
	return settings.providers.find((p) => p.id === settings.activeProviderId) ?? null
}

export function createProvider(
	input: OmitStrict<IAIProviderConfig, 'id' | 'createdOn'>,
): IAIProviderConfig {
	return {
		...input,
		id: genId(),
		createdOn: Date.now(),
	}
}

export function addAIProvider(store: IStore, provider: IAIProviderConfig): IStore {
	const settings = getAISettings(store)
	return {
		...store,
		ai: {
			...settings,
			providers: [...settings.providers, provider],
			activeProviderId: settings.activeProviderId ?? provider.id,
			enabled: true,
		},
	}
}

export function updateAIProvider(
	store: IStore,
	providerId: string,
	patch: Partial<OmitStrict<IAIProviderConfig, 'id' | 'createdOn'>>,
): IStore {
	const settings = getAISettings(store)
	const providers = settings.providers.map((p) => (p.id === providerId ? { ...p, ...patch } : p))
	return { ...store, ai: { ...settings, providers } }
}

export function removeAIProvider(store: IStore, providerId: string): IStore {
	const settings = getAISettings(store)
	const providers = settings.providers.filter((p) => p.id !== providerId)
	const activeProviderId = settings.activeProviderId === providerId
		? providers[0]?.id ?? null
		: settings.activeProviderId
	return {
		...store,
		ai: {
			...settings,
			providers,
			activeProviderId,
			enabled: settings.enabled && providers.length > 0,
		},
	}
}

export function setActiveAIProvider(store: IStore, providerId: string | null): IStore {
	const settings = getAISettings(store)
	if (providerId && !settings.providers.some((p) => p.id === providerId)) return store
	return { ...store, ai: { ...settings, activeProviderId: providerId } }
}

export function setAIEnabled(store: IStore, enabled: boolean): IStore {
	const settings = getAISettings(store)
	if (enabled && settings.providers.length === 0) return store
	return { ...store, ai: { ...settings, enabled } }
}

export function setGlobalSystemPrompt(store: IStore, prompt: string | undefined): IStore {
	const settings = getAISettings(store)
	const trimmed = typeof prompt === 'string' ? prompt : undefined
	return { ...store, ai: { ...settings, globalSystemPrompt: trimmed || undefined } }
}
