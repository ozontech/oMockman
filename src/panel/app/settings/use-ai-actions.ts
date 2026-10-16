import { useCallback } from 'react'
import { toast } from 'react-toastify'

import { useChromeStore, useGlobalStore } from '../store'

import type { IStore } from '@/interface/mock'
import type { ProviderInput, ProviderPatch } from '@/interface/ai'
import { describeSaveError, persistStoreChange } from '@/panel/app/service'
import {
	addAIProvider,
	aiDeleteKey,
	aiSetKey,
	createProvider,
	getAISettings,
	removeAIProvider,
	setActiveAIProvider,
	setGlobalSystemPrompt,
	updateAIProvider,
} from '@/services/ai'
import { canonicalOrigin } from '@/services/origin'

const currentStore = (): IStore => useChromeStore.getState().store

/** The key goes to the service worker, which keeps it; the panel gets back only its mask. */
async function saveKey(providerId: string, apiKey: string, baseURL: string): Promise<string | undefined> {
	const result = await aiSetKey(providerId, apiKey, baseURL)
	if (!result.ok) {
		toast.error(useGlobalStore.getState().t.toast_keySaveFailed(result.error))
		throw new Error(result.error)
	}
	return result.mask
}

/**
 * Every AI settings action in one hook.
 */
export function useAIActions() {
	const store = useChromeStore((s) => s.store)
	const setStoreProperties = useChromeStore((s) => s.setStoreProperties)
	const tabId = useGlobalStore((s) => s.meta.tab?.id)

	const persist = useCallback(
		async (updatedStore: IStore | (() => IStore)) => {
			try {
				await persistStoreChange({
					updatedStore,
					setStoreProperties,
					tabId,
					applyMocksNow: false,
				})
			} catch (error) {
				const t = useGlobalStore.getState().t
				toast.error(describeSaveError(error, t, t.toast_storageWriteFailed(error instanceof Error ? error.message : 'unknown error')))
				throw error
			}
		},
		[setStoreProperties, tabId],
	)

	const addProvider = useCallback(
		async (input: ProviderInput, apiKey = '') => {
			const provider = createProvider(input)
			const apiKeyMask = apiKey.trim() ? await saveKey(provider.id, apiKey, provider.baseURL) : undefined
			const saved = { ...provider, apiKeyMask }
			await persist(() => addAIProvider(currentStore(), saved))
			return saved
		},
		[persist],
	)

	/** An empty `apiKey` keeps the saved key, unless the server moved to another origin. */
	const updateProvider = useCallback(
		async (providerId: string, patch: ProviderPatch, apiKey = '') => {
			const current = getAISettings(currentStore()).providers.find((p) => p.id === providerId)
			const baseURL = patch.baseURL ?? current?.baseURL ?? ''
			let apiKeyMask = current?.apiKeyMask
			if (apiKey.trim()) {
				apiKeyMask = await saveKey(providerId, apiKey, baseURL)
			} else if (current && canonicalOrigin(current.baseURL) !== canonicalOrigin(baseURL)) {
				await aiDeleteKey(providerId)
				apiKeyMask = undefined
			}
			await persist(() => updateAIProvider(currentStore(), providerId, { ...patch, apiKeyMask }))
		},
		[persist],
	)

	const removeProvider = useCallback(
		async (providerId: string) => {
			await persist(() => removeAIProvider(currentStore(), providerId))
			await aiDeleteKey(providerId)
		},
		[persist],
	)

	const setActiveProvider = useCallback(
		async (providerId: string | null) => {
			const next = setActiveAIProvider(store, providerId)
			if (next === store) return
			await persist(() => setActiveAIProvider(currentStore(), providerId))
		},
		[store, persist],
	)

	const setSystemPrompt = useCallback(
		async (prompt: string | undefined) => {
			await persist(() => setGlobalSystemPrompt(currentStore(), prompt))
		},
		[persist],
	)

	const settings = getAISettings(store)

	return {
		settings,
		addProvider,
		updateProvider,
		removeProvider,
		setActiveProvider,
		setSystemPrompt,
	}
}
