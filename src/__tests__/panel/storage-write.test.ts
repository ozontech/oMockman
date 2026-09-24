import { afterEach, describe, expect, it, vi } from 'vitest'

import { describeSaveError, StorageWriteError, updateStoreInDB } from '@/panel/app/service'
import { createEmptyCollectionTree } from '@/interface/collection'
import type { IStore } from '@/interface/mock'
import { translations } from '@/panel/app/i18n/translations'

const store = (): IStore => ({
	theme: 'light',
	active: false,
	mocks: [],
	totalMocksCreated: 0,
	collectionTree: createEmptyCollectionTree(),
	activityInfo: { promoted: false },
	env: { activeId: 'default', profiles: [{ id: 'default', name: 'default', vars: {} }] },
})

const stubStorage = (set: (items: unknown, cb: () => void) => void, lastError?: { message?: string }) => {
	const runtime: { lastError?: { message?: string } } = {}
	vi.stubGlobal('chrome', {
		runtime,
		storage: {
			local: {
				set: (items: unknown, cb: () => void) => set(items, () => {
					runtime.lastError = lastError
					cb()
					runtime.lastError = undefined
				}),
			},
		},
	})
}

describe('updateStoreInDB', () => {
	afterEach(() => vi.unstubAllGlobals())

	it('resolves when the write succeeds', async () => {
		stubStorage((_items, cb) => cb())
		await expect(updateStoreInDB(store())).resolves.toMatchObject({ store: { active: false } })
	})

	it('rejects with the browser reason when the write fails', async () => {
		stubStorage((_items, cb) => cb(), { message: 'QUOTA_BYTES quota exceeded' })

		const error = await updateStoreInDB(store()).catch((err: unknown) => err)

		expect(error).toBeInstanceOf(StorageWriteError)
		expect((error as StorageWriteError).reason).toBe('QUOTA_BYTES quota exceeded')
	})

	it('rejects when storage throws synchronously', async () => {
		stubStorage(() => {
			throw new Error('Extension context invalidated.')
		})

		const error = await updateStoreInDB(store()).catch((err: unknown) => err)

		expect(error).toBeInstanceOf(StorageWriteError)
		expect((error as StorageWriteError).reason).toBe('Extension context invalidated.')
	})
})

describe('describeSaveError', () => {
	const t = translations.en

	it('explains a storage failure with its reason', () => {
		expect(describeSaveError(new StorageWriteError('quota exceeded'), t, 'fallback'))
			.toBe('Could not save to extension storage: quota exceeded')
	})

	it('keeps the fallback for other errors', () => {
		expect(describeSaveError(new Error('boom'), t, 'fallback')).toBe('fallback')
	})
})
