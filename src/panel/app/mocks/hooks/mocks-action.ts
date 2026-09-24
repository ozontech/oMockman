import { useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { toast } from 'react-toastify'

import { describeSaveError, persistStoreChange, storeActions } from '../../service'
import type { CollectionMovePayload } from '../../service'
import { useGlobalStore, useChromeStore } from '../../store'

import type { IMockResponse, IStore } from '@/interface/mock'
import { genId } from '@/services/helper'

export const useMockActions = () => {
	const { store, setStoreProperties, setSelectedMock } = useChromeStore(
		useShallow((s) => ({
			store: s.store,
			setStoreProperties: s.setStoreProperties,
			setSelectedMock: s.setSelectedMock,
		})),
	)

	const tab = useGlobalStore((s) => s.meta.tab)

	const toggleMock = useCallback(
		(mockToUpdate: IMockResponse): void => {
			const updatedStore = storeActions.updateMocks(store, mockToUpdate)

			void persistStoreChange({
				updatedStore,
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
		[store, setStoreProperties, tab?.id],
	)

	const deleteMock = useCallback(
		(mock: IMockResponse): void => {
			const updatedStore = storeActions.deleteMocks(store, mock.id)

			void persistStoreChange({
				updatedStore,
				setStoreProperties,
				tabId: tab?.id,
			})
				.catch((error: unknown) => {
					const t = useGlobalStore.getState().t
					toast.error(describeSaveError(error, t, t.toast_mockCannotDelete))
				})
		},
		[store, setStoreProperties, tab?.id],
	)

	const duplicateMock = useCallback((mock: IMockResponse): void => {
		const copy: IMockResponse = {
			...mock,
			id: genId(),
			name: `${mock.name} (Copy)`,
		}
		const updatedStore = storeActions.addMocks(store, copy)
		void persistStoreChange({
			updatedStore,
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
	}, [store, setStoreProperties, tab?.id])

	const refreshStore = useCallback((): void => {
		storeActions.refreshContentStore(tab?.id)
	}, [tab?.id])

	const editMock = useCallback(
		(mock: IMockResponse): void => {
			setSelectedMock(mock)
		},
		[setSelectedMock],
	)

	return { toggleMock, deleteMock, duplicateMock, editMock, refreshStore }
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
		const updatedStore = { ...store, active: nextActive }
		void persistStoreChange({
			updatedStore,
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

	const persist = useCallback(
		(updatedStore: IStore): Promise<void> =>
			persistStoreChange({
				updatedStore,
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
			const updatedStore = storeActions.createCollection(store, { name, parentId })
			persist(updatedStore).then(() => {
				toast.success(useGlobalStore.getState().t.toast_collectionCreated)
			})
		},
		[getCollectionDepth, persist, store],
	)

	const moveEntry = useCallback(
		(payload: CollectionMovePayload): void => {
			const updatedStore = storeActions.applyCollectionMove(store, payload)
			if (updatedStore === store) return
			persist(updatedStore)
		},
		[persist, store],
	)

	const renameCollection = useCallback(
		(collectionId: string, name: string): void => {
			const updatedStore = storeActions.renameCollection(store, collectionId, name)
			persist(updatedStore)
		},
		[persist, store],
	)

	const deleteCollection = useCallback(
		(collectionId: string): void => {
			const updatedStore = storeActions.deleteCollectionDeep(store, collectionId)
			persist(updatedStore)
		},
		[persist, store],
	)

	const toggleCollectionMocking = useCallback(
		(collectionId: string, active: boolean): void => {
			const updatedStore = storeActions.setCollectionBranchActive(store, collectionId, active)
			persist(updatedStore)
		},
		[persist, store],
	)

	return { createCollection, moveEntry, renameCollection, deleteCollection, toggleCollectionMocking }
}
