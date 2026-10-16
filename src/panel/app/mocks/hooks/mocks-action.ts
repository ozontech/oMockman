import { useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { toast } from 'react-toastify'

import { describeSaveError, persistStoreChange, storeActions } from '../../service'
import type { CollectionMovePayload } from '../../service'
import { useGlobalStore, useChromeStore } from '../../store'

import type { IMockResponse, IStore } from '@/interface/mock'
import { genId } from '@/services/helper'

export const useMockActions = () => {
	const { setStoreProperties, setSelectedMock } = useChromeStore(
		useShallow((s) => ({
			setStoreProperties: s.setStoreProperties,
			setSelectedMock: s.setSelectedMock,
		})),
	)

	const tab = useGlobalStore((s) => s.meta.tab)

	const toggleMock = useCallback(
		(mockToUpdate: IMockResponse): void => {
			void persistStoreChange({
				updatedStore: () => storeActions.updateMocks(useChromeStore.getState().store, mockToUpdate),
				setStoreProperties,
				tabId: tab?.id,
			})
				.then(() => {
					const t = useGlobalStore.getState().t
					toast.success(mockToUpdate.active ? t.toast_mockEnabled(mockToUpdate.name) : t.toast_mockDisabled(mockToUpdate.name))
				})
				.catch((error: unknown) => {
					const t = useGlobalStore.getState().t
					toast.error(describeSaveError(error, t, t.toast_mockCannotToggle))
				})
		},
		[setStoreProperties, tab?.id],
	)

	const deleteMock = useCallback(
		(mock: IMockResponse): void => {
			void persistStoreChange({
				updatedStore: () => storeActions.deleteMocks(useChromeStore.getState().store, mock.id),
				setStoreProperties,
				tabId: tab?.id,
			})
				.catch((error: unknown) => {
					const t = useGlobalStore.getState().t
					toast.error(describeSaveError(error, t, t.toast_mockCannotDelete))
				})
		},
		[setStoreProperties, tab?.id],
	)

	const duplicateMock = useCallback((mock: IMockResponse): void => {
		const copy: IMockResponse = {
			...mock,
			id: genId(),
			name: `${mock.name} (Copy)`,
			createdOn: Date.now(),
		}
		void persistStoreChange({
			updatedStore: () => storeActions.addMocks(useChromeStore.getState().store, copy),
			setStoreProperties,
			tabId: tab?.id,
		})
			.then(() => {
				toast.success(useGlobalStore.getState().t.toast_mockDuplicated(copy.name))
			})
			.catch((error: unknown) => {
				const t = useGlobalStore.getState().t
				toast.error(describeSaveError(error, t, t.toast_mockCannotDuplicate))
			})
	}, [setStoreProperties, tab?.id])

	const editMock = useCallback(
		(mock: IMockResponse): void => {
			setSelectedMock(mock)
		},
		[setSelectedMock],
	)

	return { toggleMock, deleteMock, duplicateMock, editMock }
}

export const useGlobalMocksToggle = () => {
	const { store, setStoreProperties } = useChromeStore(useShallow((s) => ({
		store: s.store,
		setStoreProperties: s.setStoreProperties,
	})))
	const tab = useGlobalStore((s) => s.meta.tab)

	const mockingEnabled = store.active

	const handleToggleAllMocks = useCallback(() => {
		const nextActive = !store.active
		void persistStoreChange({
			updatedStore: () => ({ ...useChromeStore.getState().store, active: nextActive }),
			setStoreProperties,
			tabId: tab?.id,
			applyMocksNow: { enabled: nextActive },
		})
			.then(() => {
				const t = useGlobalStore.getState().t
				toast[nextActive ? 'success' : 'info'](nextActive ? t.toast_mockingEnabled : t.toast_mockingDisabled, { position: 'bottom-right' })
			})
			.catch((error: unknown) => {
				const t = useGlobalStore.getState().t
				toast.error(describeSaveError(error, t, t.toast_mockCannotToggle))
			})
	}, [store, setStoreProperties, tab?.id])

	return { allMocksEnabled: mockingEnabled, handleToggleAllMocks }
}

export const useCollectionActions = () => {
	const { store, setStoreProperties } = useChromeStore(useShallow((s) => ({
		store: s.store,
		setStoreProperties: s.setStoreProperties,
	})))
	const tab = useGlobalStore((s) => s.meta.tab)

	const MAX_COLLECTION_DEPTH = 3
	const getCollectionDepth = useCallback((collectionId: string): number => {
		let depth = 0
		let cur = store.collectionTree.nodes[collectionId]
		while (cur?.parentId) {
			depth += 1
			cur = store.collectionTree.nodes[cur.parentId]
			if (depth > 50) break
		}
		return depth
	}, [store.collectionTree.nodes])

	// The change is applied to the store as it is when the write runs, not as this render saw it.
	const persist = useCallback(
		(change: (current: IStore) => IStore): Promise<void> =>
			persistStoreChange({
				updatedStore: () => change(useChromeStore.getState().store),
				setStoreProperties,
				tabId: tab?.id,
				applyMocksNow: false,
			})
				.then(() => undefined)
				.catch((error: unknown) => {
					const t = useGlobalStore.getState().t
					toast.error(describeSaveError(error, t, t.toast_collectionCannotUpdate))
				}),
		[setStoreProperties, tab?.id],
	)

	const createCollection = useCallback(
		(parentId: string | null) => {
			if (parentId) {
				const parentDepth = getCollectionDepth(parentId)
				if (parentDepth >= MAX_COLLECTION_DEPTH) {
					toast.info(useGlobalStore.getState().t.mocks_maxDepth)
					return
				}
			}
			const name = 'New Collection'
			persist((current) => storeActions.createCollection(current, { name, parentId })).then(() => {
				toast.success(useGlobalStore.getState().t.toast_collectionCreated)
			})
		},
		[getCollectionDepth, persist],
	)

	const moveEntry = useCallback(
		(payload: CollectionMovePayload): void => {
			if (storeActions.applyCollectionMove(store, payload) === store) return
			persist((current) => storeActions.applyCollectionMove(current, payload))
		},
		[persist, store],
	)

	const renameCollection = useCallback(
		(collectionId: string, name: string): void => {
			persist((current) => storeActions.renameCollection(current, collectionId, name))
		},
		[persist],
	)

	const deleteCollection = useCallback(
		(collectionId: string): void => {
			persist((current) => storeActions.deleteCollectionDeep(current, collectionId))
		},
		[persist],
	)

	const toggleCollectionMocking = useCallback(
		(collectionId: string, active: boolean): void => {
			persist((current) => storeActions.setCollectionBranchActive(current, collectionId, active))
		},
		[persist],
	)

	return { createCollection, moveEntry, renameCollection, deleteCollection, toggleCollectionMocking }
}
