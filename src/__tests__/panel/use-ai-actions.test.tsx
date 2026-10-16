import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { IStore } from '@/interface/mock'
import type * as AIModule from '@/services/ai'
import type * as ServiceModule from '@/panel/app/service'
import { useAIActions } from '@/panel/app/settings/use-ai-actions'
import { useChromeStore } from '@/panel/app/store'

const aiSetKey = vi.fn()
const aiDeleteKey = vi.fn()
const updateStoreInDB = vi.fn()

vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

vi.mock('@/services/ai', async (importOriginal) => ({
	...(await importOriginal<typeof AIModule>()),
	aiSetKey: (...args: unknown[]) => aiSetKey(...args),
	aiDeleteKey: (...args: unknown[]) => aiDeleteKey(...args),
}))

/** Writes land in `updatedStore` order, as the real write queue does. */
vi.mock('@/panel/app/service', async (importOriginal) => ({
	...(await importOriginal<typeof ServiceModule>()),
	persistStoreChange: async ({ updatedStore }: { updatedStore: IStore | (() => IStore) }) => {
		const store = typeof updatedStore === 'function' ? updatedStore() : updatedStore
		return updateStoreInDB(store)
	},
}))

const baseStore = (providers: unknown[] = []): IStore => ({
	theme: 'light',
	active: true,
	mocks: [],
	totalMocksCreated: 0,
	collectionTree: { root: [], nodes: {} },
	activityInfo: { promoted: false },
	env: { activeId: 'default', profiles: [{ id: 'default', name: 'default', vars: {} }] },
	ai: { enabled: providers.length > 0, activeProviderId: null, providers },
} as unknown as IStore)

const written = (): IStore => updateStoreInDB.mock.calls.at(-1)?.[0] as IStore

describe('useAIActions', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		aiSetKey.mockResolvedValue({ ok: true, mask: 'sk-…alue' })
		aiDeleteKey.mockResolvedValue({ ok: true })
		updateStoreInDB.mockImplementation(async (store: IStore) => {
			useChromeStore.setState({ store })
			return { store, urlMap: {}, dynamicUrlMap: {} }
		})
		useChromeStore.setState({ store: baseStore(), urlMap: {}, dynamicUrlMap: {} })
	})

	it('hands the key to the worker and stores only its mask', async () => {
		const { result } = renderHook(() => useAIActions())

		await act(async () => {
			await result.current.addProvider({ name: 'gw', baseURL: 'https://llm.example.com', model: 'm' }, 'sk-secret-value')
		})

		const provider = written().ai?.providers[0]
		expect(aiSetKey).toHaveBeenCalledWith(provider?.id, 'sk-secret-value', 'https://llm.example.com')
		expect(provider?.apiKeyMask).toBe('sk-…alue')
		expect(JSON.stringify(written())).not.toContain('sk-secret-value')
	})

	it('saves nothing when the worker refuses the key', async () => {
		aiSetKey.mockResolvedValue({ ok: false, error: 'bad url' })
		const { result } = renderHook(() => useAIActions())

		await act(async () => {
			await expect(result.current.addProvider({ name: 'gw', baseURL: 'nope', model: 'm' }, 'sk-secret-value')).rejects.toThrow()
		})

		expect(updateStoreInDB).not.toHaveBeenCalled()
	})

	it('drops the saved key when the server moves to another origin', async () => {
		useChromeStore.setState({
			store: baseStore([{ id: 'p-1', name: 'gw', baseURL: 'https://llm.example.com', model: 'm', apiKeyMask: 'sk-…alue', createdOn: 1 }]),
		})
		const { result } = renderHook(() => useAIActions())

		await act(async () => {
			await result.current.updateProvider('p-1', { baseURL: 'https://other.example.com' })
		})

		expect(aiDeleteKey).toHaveBeenCalledWith('p-1')
		expect(written().ai?.providers[0].apiKeyMask).toBeUndefined()
	})

	it('keeps the saved key for an edit on the same origin', async () => {
		useChromeStore.setState({
			store: baseStore([{ id: 'p-1', name: 'gw', baseURL: 'https://llm.example.com/v1', model: 'm', apiKeyMask: 'sk-…alue', createdOn: 1 }]),
		})
		const { result } = renderHook(() => useAIActions())

		await act(async () => {
			await result.current.updateProvider('p-1', { baseURL: 'https://llm.example.com/v2', model: 'm2' })
		})

		expect(aiDeleteKey).not.toHaveBeenCalled()
		expect(aiSetKey).not.toHaveBeenCalled()
		expect(written().ai?.providers[0]).toMatchObject({ model: 'm2', apiKeyMask: 'sk-…alue' })
	})

	it('deletes the key with the connection', async () => {
		useChromeStore.setState({
			store: baseStore([{ id: 'p-1', name: 'gw', baseURL: 'https://llm.example.com', model: 'm', apiKeyMask: 'sk-…alue', createdOn: 1 }]),
		})
		const { result } = renderHook(() => useAIActions())

		await act(async () => {
			await result.current.removeProvider('p-1')
		})

		expect(written().ai?.providers).toEqual([])
		expect(aiDeleteKey).toHaveBeenCalledWith('p-1')
	})
})
