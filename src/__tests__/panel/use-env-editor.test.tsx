import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useEnvEditor } from '@/panel/app/settings/use-env-editor'
import { useChromeStore } from '@/panel/app/store'
import type { IStore } from '@/interface/mock'
import type * as ActualModule from '@/panel/app/service'

const updateStoreInDB = vi.fn()
const refreshContentStore = vi.fn()

vi.mock('@/panel/app/service', async (importOriginal) => {
	const actual = await importOriginal<typeof ActualModule>()
	return {
		...actual,
		storeActions: {
			...actual.storeActions,
			updateStoreInDB: (...args: unknown[]) => updateStoreInDB(...args),
			refreshContentStore: (...args: unknown[]) => refreshContentStore(...args),
		},
	}
})

const baseStore = (): IStore => ({
	theme: 'light',
	active: false,
	mocks: [],
	totalMocksCreated: 0,
	collectionTree: { root: [], nodes: {} },
	activityInfo: { promoted: false },
	env: {
		activeId: 'default',
		profiles: [{ id: 'default', name: 'default', vars: { BASE_URL: 'https://stage.example.com' } }],
	},
} as unknown as IStore)

describe('useEnvEditor', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		updateStoreInDB.mockImplementation(async (store: IStore) => ({ store, urlMap: {}, dynamicUrlMap: {} }))
		useChromeStore.setState({ store: baseStore(), urlMap: {}, dynamicUrlMap: {} })
	})

	it('loads the active profile and its variables', () => {
		const { result } = renderHook(() => useEnvEditor())

		expect(result.current.currentProfile?.id).toBe('default')
		expect(result.current.varsRows.map((row) => [row.key, row.value])).toEqual([
			['BASE_URL', 'https://stage.example.com'],
		])
		expect(result.current.envOptions).toEqual([{ key: 'default', value: 'default', text: 'default' }])
	})

	it('adds a profile and switches to it', () => {
		const { result } = renderHook(() => useEnvEditor())

		act(() => result.current.addProfile())

		expect(result.current.draft?.profiles).toHaveLength(2)
		expect(result.current.currentProfile?.id).not.toBe('default')
		// A fresh profile starts with an empty BASE_URL row.
		expect(result.current.varsRows.map((row) => [row.key, row.value])).toEqual([['BASE_URL', '']])
	})

	it('renames the active profile', () => {
		const { result } = renderHook(() => useEnvEditor())

		act(() => result.current.renameProfile('staging'))

		expect(result.current.currentProfile?.name).toBe('staging')
	})

	it('refuses to remove the last profile', () => {
		const { result } = renderHook(() => useEnvEditor())

		act(() => result.current.removeProfile())

		expect(result.current.draft?.profiles).toHaveLength(1)
	})

	it('removes a profile when more than one exists', () => {
		const { result } = renderHook(() => useEnvEditor())

		act(() => result.current.addProfile())
		act(() => result.current.removeProfile())

		expect(result.current.draft?.profiles).toHaveLength(1)
		expect(result.current.currentProfile?.id).toBe('default')
	})

	it('switches between profiles', () => {
		const { result } = renderHook(() => useEnvEditor())

		act(() => result.current.addProfile())
		const added = result.current.draft?.profiles.find((p) => p.id !== 'default')?.id as string
		act(() => result.current.selectProfile('default'))
		expect(result.current.currentProfile?.id).toBe('default')

		act(() => result.current.selectProfile(added))
		expect(result.current.currentProfile?.id).toBe(added)
	})

	it('adds, edits and removes variables', () => {
		const { result } = renderHook(() => useEnvEditor())

		act(() => result.current.addVar())
		expect(result.current.varsRows).toHaveLength(2)

		const newRowId = result.current.varsRows[1].id
		act(() => result.current.updateVar(newRowId, { key: 'TOKEN_URL', value: 'https://x' }))
		expect(result.current.varsRows[1]).toMatchObject({ key: 'TOKEN_URL', value: 'https://x' })

		act(() => result.current.removeVar(newRowId))
		expect(result.current.varsRows).toHaveLength(1)
	})

	it('saves the draft to the store', async () => {
		const { result } = renderHook(() => useEnvEditor())

		act(() => result.current.renameProfile('staging'))
		let ok: boolean | undefined
		await act(async () => {
			ok = await result.current.save()
		})

		expect(ok).toBe(true)
		expect(updateStoreInDB).toHaveBeenCalledTimes(1)
		const saved = updateStoreInDB.mock.calls[0][0] as IStore
		expect(saved.env?.profiles[0].name).toBe('staging')
		expect(refreshContentStore).toHaveBeenCalled()
	})

	it('reports a failed save', async () => {
		updateStoreInDB.mockRejectedValue(new Error('quota exceeded'))
		const { result } = renderHook(() => useEnvEditor())

		let ok: boolean | undefined
		await act(async () => {
			ok = await result.current.save()
		})

		expect(ok).toBe(false)
	})
})
