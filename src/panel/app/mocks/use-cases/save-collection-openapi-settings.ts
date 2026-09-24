import { persistStoreChange, storeActions } from '@/panel/app/service'
import type { StoreProperties } from '@/panel/app/store/use-mock-store'
import type { IStore } from '@/interface/mock'

export async function saveCollectionOpenApiSettings(input: {
	store: IStore
	collectionId: string
	openApiUrl: string
	setStoreProperties: (p: StoreProperties) => void
	tabId?: number
}): Promise<void> {
	const { store, collectionId, openApiUrl, setStoreProperties, tabId } = input
	let nextStore = storeActions.updateCollectionOpenApiUrl(structuredClone(store), collectionId, openApiUrl)
	nextStore = storeActions.applyCollectionOpenApiToMocks(nextStore, collectionId, openApiUrl)

	await persistStoreChange({
		updatedStore: nextStore,
		setStoreProperties,
		tabId,
		applyMocksNow: false,
	})
}
