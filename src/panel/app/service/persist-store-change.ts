import type { StoreProperties } from '../store/use-mock-store'

import { storeActions } from './store-actions'

import { MessageAPI } from '@/services/message/api'
import type { IStore } from '@/interface/mock'

/** Writes go one at a time, so each sees the store the previous one left. */
let writeQueue: Promise<unknown> = Promise.resolve()

/**
 * `updatedStore` may be a function, called when this write's turn comes: two quick clicks then
 * both land, instead of the second overwriting the first from the same stale snapshot.
 */
export function persistStoreChange(input: {
	updatedStore: IStore | (() => IStore)
	setStoreProperties: (p: StoreProperties) => void
	tabId?: number
	applyMocksNow?: false | { enabled?: boolean }
}): Promise<StoreProperties> {
	const run = () => writeStore(input)
	const result = writeQueue.then(run, run)
	writeQueue = result.catch(() => undefined)
	return result
}

async function writeStore(input: Parameters<typeof persistStoreChange>[0]): Promise<StoreProperties> {
	const { setStoreProperties, tabId, applyMocksNow } = input
	const updatedStore = typeof input.updatedStore === 'function' ? input.updatedStore() : input.updatedStore
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