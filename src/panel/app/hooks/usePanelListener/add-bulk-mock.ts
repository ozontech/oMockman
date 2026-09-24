import { toast } from 'react-toastify'

import { useChromeStore, useGlobalStore } from '../../store'

import { describeSaveError, storeActions } from '@/panel/app/service'
import { MethodEnum } from '@/interface/network'
import type { IMockResponse, IMockResponseRaw } from '@/interface/mock'
import { genId } from '@/services/helper'

export { genId }

export const useAddBulkMock = () => {
	const setStoreProperties = useChromeStore((s) => s.setStoreProperties)
	const tabId = useGlobalStore((s) => s.meta.tab?.id)

	return async (drafts: IMockResponseRaw[]): Promise<void> => {
		try {
			const normalized: IMockResponse[] = drafts.map((d) => ({
				id: d.id ?? genId(),
				name: d.name ?? 'Recorded mock',
				method: d.method ?? MethodEnum.GET,
				url: d.url ?? '/',
				status: d.status ?? 200,
				delay: d.delay ?? undefined,
				active: d.active ?? true,
				createdOn: d.createdOn ?? Date.now(),
				response: d.response ?? '',
				headers: d.headers ?? [],
				description: d.description ?? '',
				dynamic: d.dynamic ?? false,
				collectionId: d.collectionId ?? null,
				action: d.action,
			}))

			const { store } = await storeActions.getStore()
			const updated = storeActions.addMocks(store, normalized)

			await storeActions.updateStoreInDB(updated).then(setStoreProperties)
			storeActions.refreshContentStore(tabId)

		} catch (err) {
			toast.error(describeSaveError(err, useGlobalStore.getState().t, 'Cannot mock network calls.'), {
				autoClose: 5000,
				position: 'top-right',
			})
		}
	}
}
