import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MethodEnum } from '@/interface'
import type { IMockResponse, IStore } from '@/interface/mock'
import { useCollectionActions, useGlobalMocksToggle, useMockActions } from '@/panel/app/mocks/hooks/mocks-action'
import { useChromeStore, useGlobalStore } from '@/panel/app/store'
import type * as ActualModule from '@/panel/app/service/store-actions'

const updateStoreInDB = vi.fn()
const applyMocksNow = vi.fn()
const notifyUpdateStore = vi.fn()
const toastSuccess = vi.fn()
const toastError = vi.fn()
const toastInfo = vi.fn()

vi.mock('react-toastify', () => ({
	toast: {
		success: (...args: unknown[]) => toastSuccess(...args),
		error: (...args: unknown[]) => toastError(...args),
		info: (...args: unknown[]) => toastInfo(...args),
	},
}))

vi.mock('@/services/message/api', () => ({
	MessageAPI: {
		applyMocksNow: (...args: unknown[]) => applyMocksNow(...args),
		notifyUpdateStore: (...args: unknown[]) => notifyUpdateStore(...args),
		initFromContent: vi.fn(),
		forwardLogToPanel: vi.fn(),
	},
}))

vi.mock('@/panel/app/service/store-actions', async (importOriginal) => {
	const actual = await importOriginal<typeof ActualModule>()
	return {
		...actual,
		updateStoreInDB: (...args: unknown[]) => updateStoreInDB(...args),
		storeActions: { ...actual.storeActions, updateStoreInDB: (...args: unknown[]) => updateStoreInDB(...args) },
	}
})

const mock = (overrides: Partial<IMockResponse> = {}): IMockResponse => ({
	id: 'm-1',
	name: 'users',
	description: '',
	method: MethodEnum.GET,
	url: 'https://example.com/api/users',
	status: 200,
	response: '{}',
	active: true,
	createdOn: 1,
	collectionId: null,
	...overrides,
} as IMockResponse)

const store = (overrides: Partial<IStore> = {}): IStore => ({
	theme: 'light',
	active: false,
	mocks: [mock()],
	totalMocksCreated: 1,
	collectionTree: { root: [{ id: 'm-1', type: 'mock' }], nodes: {} },
	activityInfo: { promoted: false },
	env: { activeId: 'default', profiles: [{ id: 'default', name: 'default', vars: {} }] },
	...overrides,
} as IStore)

describe('mock actions', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		updateStoreInDB.mockImplementation(async (next: IStore) => ({ store: next, urlMap: {}, dynamicUrlMap: {} }))
		useChromeStore.setState({ store: store(), urlMap: {}, dynamicUrlMap: {} })
		useGlobalStore.setState({ meta: { host: 'example.com', active: true, storeKey: 'k', tab: { id: 7 } } } as never)
	})

	it('toggles a mock and persists the store', async () => {
		const { result } = renderHook(() => useMockActions())

		act(() => result.current.toggleMock(mock({ active: false })))

		await waitFor(() => expect(updateStoreInDB).toHaveBeenCalledTimes(1))
		expect(toastSuccess).toHaveBeenCalled()
		expect(applyMocksNow).toHaveBeenCalledWith(7, undefined)
	})

	it('deletes a mock', async () => {
		const { result } = renderHook(() => useMockActions())

		act(() => result.current.deleteMock(mock()))

		await waitFor(() => expect(updateStoreInDB).toHaveBeenCalledTimes(1))
		const saved = updateStoreInDB.mock.calls[0][0] as IStore
		expect(saved.mocks).toHaveLength(0)
	})

	it('reports a failed delete', async () => {
		updateStoreInDB.mockRejectedValue(new Error('quota'))
		const { result } = renderHook(() => useMockActions())

		act(() => result.current.deleteMock(mock()))

		await waitFor(() => expect(toastError).toHaveBeenCalled())
	})

	it('duplicates a mock under a new id', async () => {
		const { result } = renderHook(() => useMockActions())

		act(() => result.current.duplicateMock(mock()))

		await waitFor(() => expect(updateStoreInDB).toHaveBeenCalledTimes(1))
		const saved = updateStoreInDB.mock.calls[0][0] as IStore
		expect(saved.mocks).toHaveLength(2)
		const copy = saved.mocks.find((m) => m.id !== 'm-1')
		expect(copy?.name).toBe('users (Copy)')
	})

	it('selects a mock for editing', () => {
		const { result } = renderHook(() => useMockActions())

		act(() => result.current.editMock(mock()))

		expect(useChromeStore.getState().selectedMock?.id).toBe('m-1')
	})

	it('asks the content script to re-read the store', () => {
		const { result } = renderHook(() => useMockActions())

		act(() => result.current.refreshStore())

		expect(notifyUpdateStore).toHaveBeenCalledWith(7)
	})
})

describe('useGlobalMocksToggle', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		updateStoreInDB.mockImplementation(async (next: IStore) => ({ store: next, urlMap: {}, dynamicUrlMap: {} }))
		useChromeStore.setState({ store: store(), urlMap: {}, dynamicUrlMap: {} })
		useGlobalStore.setState({ meta: { host: 'example.com', active: true, storeKey: 'k', tab: { id: 7 } } } as never)
	})

	it('reports the current mocking state', () => {
		const { result } = renderHook(() => useGlobalMocksToggle())
		expect(result.current.allMocksEnabled).toBe(false)
	})

	it('enables mocking and tells the content script', async () => {
		const { result } = renderHook(() => useGlobalMocksToggle())

		act(() => result.current.handleToggleAllMocks())

		await waitFor(() => expect(updateStoreInDB).toHaveBeenCalledTimes(1))
		expect((updateStoreInDB.mock.calls[0][0] as IStore).active).toBe(true)
		expect(applyMocksNow).toHaveBeenCalledWith(7, true)
		expect(toastSuccess).toHaveBeenCalled()
	})

	it('disables mocking', async () => {
		useChromeStore.setState({ store: store({ active: true }), urlMap: {}, dynamicUrlMap: {} })
		const { result } = renderHook(() => useGlobalMocksToggle())

		act(() => result.current.handleToggleAllMocks())

		await waitFor(() => expect(updateStoreInDB).toHaveBeenCalledTimes(1))
		expect((updateStoreInDB.mock.calls[0][0] as IStore).active).toBe(false)
		expect(applyMocksNow).toHaveBeenCalledWith(7, false)
		expect(toastInfo).toHaveBeenCalled()
	})
})

describe('useCollectionActions', () => {
	const treeStore = (): IStore => store({
		mocks: [mock({ collectionId: 'c1' })],
		collectionTree: {
			root: [{ id: 'c1', type: 'collection' }],
			nodes: {
				c1: { id: 'c1', name: 'Parent', parentId: null, active: true, createdOn: 1, entries: [{ id: 'm-1', type: 'mock' }] },
			},
		},
	})

	beforeEach(() => {
		vi.clearAllMocks()
		updateStoreInDB.mockImplementation(async (next: IStore) => ({ store: next, urlMap: {}, dynamicUrlMap: {} }))
		useChromeStore.setState({ store: treeStore(), urlMap: {}, dynamicUrlMap: {} })
		useGlobalStore.setState({ meta: { host: 'example.com', active: true, storeKey: 'k', tab: { id: 7 } } } as never)
	})

	it('creates a root collection', async () => {
		const { result } = renderHook(() => useCollectionActions())

		act(() => result.current.createCollection(null))

		await waitFor(() => expect(updateStoreInDB).toHaveBeenCalledTimes(1))
		const saved = updateStoreInDB.mock.calls[0][0] as IStore
		expect(Object.keys(saved.collectionTree.nodes)).toHaveLength(2)
		// Collection changes do not need to re-push mocks immediately.
		expect(applyMocksNow).not.toHaveBeenCalled()
	})

	it('refuses to nest deeper than the depth limit', async () => {
		const deep = treeStore()
		deep.collectionTree.nodes.c2 = { id: 'c2', name: 'a', parentId: 'c1', active: true, createdOn: 1, entries: [] }
		deep.collectionTree.nodes.c3 = { id: 'c3', name: 'b', parentId: 'c2', active: true, createdOn: 1, entries: [] }
		deep.collectionTree.nodes.c4 = { id: 'c4', name: 'c', parentId: 'c3', active: true, createdOn: 1, entries: [] }
		useChromeStore.setState({ store: deep, urlMap: {}, dynamicUrlMap: {} })
		const { result } = renderHook(() => useCollectionActions())

		act(() => result.current.createCollection('c4'))

		expect(toastInfo).toHaveBeenCalled()
		expect(updateStoreInDB).not.toHaveBeenCalled()
	})

	it('renames a collection', async () => {
		const { result } = renderHook(() => useCollectionActions())

		act(() => result.current.renameCollection('c1', 'Renamed'))

		await waitFor(() => expect(updateStoreInDB).toHaveBeenCalledTimes(1))
		expect((updateStoreInDB.mock.calls[0][0] as IStore).collectionTree.nodes.c1.name).toBe('Renamed')
	})

	it('deletes a collection with its mocks', async () => {
		const { result } = renderHook(() => useCollectionActions())

		act(() => result.current.deleteCollection('c1'))

		await waitFor(() => expect(updateStoreInDB).toHaveBeenCalledTimes(1))
		const saved = updateStoreInDB.mock.calls[0][0] as IStore
		expect(saved.mocks).toHaveLength(0)
		expect(Object.keys(saved.collectionTree.nodes)).toHaveLength(0)
	})

	it('toggles mocking for a collection branch', async () => {
		const { result } = renderHook(() => useCollectionActions())

		act(() => result.current.toggleCollectionMocking('c1', false))

		await waitFor(() => expect(updateStoreInDB).toHaveBeenCalledTimes(1))
		const saved = updateStoreInDB.mock.calls[0][0] as IStore
		expect(saved.collectionTree.nodes.c1.active).toBe(false)
		expect(saved.mocks[0].active).toBe(false)
	})

	it('moves an entry', async () => {
		const { result } = renderHook(() => useCollectionActions())

		act(() => result.current.moveEntry({
			entryId: 'm-1',
			entryType: 'mock',
			from: { containerId: 'c1', index: 0 },
			to: { containerId: null, index: 0 },
		}))

		await waitFor(() => expect(updateStoreInDB).toHaveBeenCalledTimes(1))
		expect((updateStoreInDB.mock.calls[0][0] as IStore).mocks[0].collectionId).toBeNull()
	})

	it('skips a move that changes nothing', () => {
		const { result } = renderHook(() => useCollectionActions())

		act(() => result.current.moveEntry({
			entryId: 'c1',
			entryType: 'collection',
			from: { containerId: null, index: 0 },
			to: { containerId: 'c1', index: 0 },
		}))

		expect(updateStoreInDB).not.toHaveBeenCalled()
	})
})
