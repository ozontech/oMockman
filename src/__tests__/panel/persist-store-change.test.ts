import { afterEach, describe, expect, it, vi } from 'vitest'

import { persistStoreChange } from '@/panel/app/service'
import type { StoreProperties } from '@/panel/app/store/use-mock-store'
import { createEmptyCollectionTree } from '@/interface/collection'
import type { IMockResponse, IStore } from '@/interface/mock'

const mock = (id: string): IMockResponse => ({
	id,
	name: id,
	url: `/api/${id}`,
	method: 'GET',
	status: 200,
	response: '{}',
	active: false,
	createdOn: 0,
} as unknown as IMockResponse)

const store = (): IStore => ({
	theme: 'light',
	active: true,
	mocks: [mock('a'), mock('b')],
	totalMocksCreated: 2,
	collectionTree: createEmptyCollectionTree(),
	activityInfo: { promoted: false },
	env: { activeId: 'default', profiles: [{ id: 'default', name: 'default', vars: {} }] },
})

describe('persistStoreChange', () => {
	afterEach(() => vi.unstubAllGlobals())

	it('lands two quick changes instead of letting the second undo the first', async () => {
		// A slow storage write: the second click comes while the first is still in flight.
		vi.stubGlobal('chrome', {
			runtime: { sendMessage: vi.fn(), lastError: undefined },
			tabs: { sendMessage: vi.fn() },
			storage: { local: { set: (_items: unknown, cb: () => void) => setTimeout(cb, 10) } },
		})
		let current = store()
		const setStoreProperties = vi.fn((p: StoreProperties) => {
			current = p.store
		})
		const activate = (id: string) => (): IStore => ({
			...current,
			mocks: current.mocks.map((m) => (m.id === id ? { ...m, active: true } : m)),
		})

		await Promise.all([
			persistStoreChange({ updatedStore: activate('a'), setStoreProperties, applyMocksNow: false }),
			persistStoreChange({ updatedStore: activate('b'), setStoreProperties, applyMocksNow: false }),
		])

		expect(current.mocks.map((m) => m.active)).toEqual([true, true])
	})

	it('keeps writing after a failed write', async () => {
		let fail = true
		const runtime: { lastError?: { message: string }; sendMessage: () => void } = { sendMessage: vi.fn() }
		vi.stubGlobal('chrome', {
			runtime,
			tabs: { sendMessage: vi.fn() },
			storage: {
				local: {
					set: (_items: unknown, cb: () => void) => {
						runtime.lastError = fail ? { message: 'quota' } : undefined
						fail = false
						cb()
						runtime.lastError = undefined
					},
				},
			},
		})
		const setStoreProperties = vi.fn()

		await expect(persistStoreChange({ updatedStore: store(), setStoreProperties, applyMocksNow: false })).rejects.toThrow()
		await expect(persistStoreChange({ updatedStore: store(), setStoreProperties, applyMocksNow: false })).resolves.toBeDefined()
		expect(setStoreProperties).toHaveBeenCalledTimes(1)
	})
})
