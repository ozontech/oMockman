import { useCallback } from 'react'
import { toast } from 'react-toastify'

import { useChromeStore, useGlobalStore } from '../store'

import type { ProviderInput, ProviderPatch } from '@/interface/ai'
import { describeSaveError, persistStoreChange } from '@/panel/app/service'
import {
	addAIProvider,
	createProvider,
	getAISettings,
	removeAIProvider,
	setActiveAIProvider,
	setGlobalSystemPrompt,
	updateAIProvider,
} from '@/services/ai'

/**
 * Every AI settings action in one hook.
 */
export function useAIActions() {
	const store = useChromeStore((s) => s.store)
	const setStoreProperties = useChromeStore((s) => s.setStoreProperties)
	const tabId = useGlobalStore((s) => s.meta.tab?.id)

	const persist = useCallback(
		async (updatedStore: typeof store) => {
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
				// Rethrow so callers do not report success or move on.
				throw error
			}
		},
		[setStoreProperties, tabId],
	)

	const addProvider = useCallback(
		async (input: ProviderInput) => {
			const provider = createProvider(input)
			const next = addAIProvider(store, provider)
			await persist(next)
			return provider
		},
		[store, persist],
	)

	const updateProvider = useCallback(
		async (providerId: string, patch: ProviderPatch) => {
			const next = updateAIProvider(store, providerId, patch)
			await persist(next)
		},
		[store, persist],
	)

	const removeProvider = useCallback(
		async (providerId: string) => {
			const next = removeAIProvider(store, providerId)
			await persist(next)
		},
		[store, persist],
	)

	const setActiveProvider = useCallback(
		async (providerId: string | null) => {
			const next = setActiveAIProvider(store, providerId)
			if (next === store) return
			await persist(next)
		},
		[store, persist],
	)

	const setSystemPrompt = useCallback(
		async (prompt: string | undefined) => {
			const next = setGlobalSystemPrompt(store, prompt)
			await persist(next)
		},
		[store, persist],
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
