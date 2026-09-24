import { toast } from 'react-toastify'

import { buildMockPayload } from './utils'

import { describeSaveError, persistStoreChange, storeActions } from '@/panel/app/service'
import type { StoreProperties } from '@/panel/app/store/use-mock-store'
import { useGlobalStore } from '@/panel/app/store/use-global-store'
import { queuedItemToRaw } from '@/services/mock-import'
import { genId } from '@/services/helper'
import type { IMockResponse, IMockResponseRaw, IStore } from '@/interface/mock'

export async function submitMock(opts: {
	store: IStore
	isNew: boolean
	values: IMockResponseRaw
	tabId?: number
	setStoreProperties: (p: StoreProperties) => void
	handleClose: () => void
	setSelectedMock: (m?: Partial<IMockResponse>) => void
}): Promise<void> {
	const { store, isNew, values, tabId, setStoreProperties, handleClose, setSelectedMock } = opts

	const payload: IMockResponse = buildMockPayload({ ...values, id: values.id ?? genId() })
	const updatedStore = isNew ? storeActions.addMocks(store, payload) : storeActions.updateMocks(store, payload)

	try {
		await persistStoreChange({
			updatedStore,
			setStoreProperties,
			tabId,
		})

		handleClose()

		try {
			const next = useGlobalStore.getState().shiftImportQueue?.()
			const d = queuedItemToRaw(next)
			if (d) setSelectedMock(d)
		} catch {
			void 0
		}

		const t = useGlobalStore.getState().t
		toast.success(isNew ? t.toast_mockAdded(payload.name) : t.toast_mockUpdated(payload.name))
	} catch (error) {
		const t = useGlobalStore.getState().t
		toast.error(describeSaveError(error, t, isNew ? t.toast_mockCannotAdd : t.toast_mockCannotUpdate))
	}
}
