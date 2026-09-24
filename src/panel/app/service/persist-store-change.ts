import type { StoreProperties } from '../store/use-mock-store'

import { storeActions } from './store-actions'

import { MessageAPI } from '@/services/message/api'
import type { IStore } from '@/interface/mock'

export async function persistStoreChange(input: {
	updatedStore: IStore
	setStoreProperties: (p: StoreProperties) => void
	tabId?: number
	applyMocksNow?: false | { enabled?: boolean }
}): Promise<StoreProperties> {
	const { updatedStore, setStoreProperties, tabId, applyMocksNow } = input
	const result = await storeActions.updateStoreInDB(updatedStore)
	setStoreProperties(result)
	storeActions.refreshContentStore(tabId)

	if (applyMocksNow !== false) {
		try {
			MessageAPI.applyMocksNow(tabId, applyMocksNow?.enabled)
		} catch {
			void 0
		}
	}

	return result
}