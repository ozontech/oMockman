import { persistStoreChange, storeActions } from '@/panel/app/service'
import type { StoreProperties } from '@/panel/app/store/use-mock-store'
import type { ICollectionScenario } from '@/interface/collection'
import type { IStore } from '@/interface/mock'

export async function saveCollectionScenario(input: {
	store: IStore
	collectionId: string
	scenario: ICollectionScenario | undefined
	setStoreProperties: (p: StoreProperties) => void
	tabId?: number
}): Promise<void> {
	const { store, collectionId, scenario, setStoreProperties, tabId } = input
	await persistStoreChange({
		updatedStore: storeActions.updateCollectionScenario(structuredClone(store), collectionId, scenario),
		setStoreProperties,
		tabId,
		applyMocksNow: false,
	})
}
