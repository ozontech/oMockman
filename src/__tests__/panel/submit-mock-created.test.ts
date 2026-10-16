import { describe, expect, it, vi } from 'vitest'

import { submitMock } from '@/panel/app/mocks/addMock/submit-mock'
import type * as Service from '@/panel/app/service'
import type { IMockResponse, IStore } from '@/interface/mock'
import { MethodEnum } from '@/interface/network'

const saved = vi.hoisted((): IStore[] => [])

vi.mock('@/panel/app/service', async (importOriginal) => ({
	...(await importOriginal<typeof Service>()),
	persistStoreChange: vi.fn(async ({ updatedStore }: { updatedStore: IStore }) => {
		saved.push(updatedStore)
	}),
}))

const store = (mocks: IMockResponse[] = []): IStore => ({
	active: true,
	mocks,
	collectionTree: { root: mocks.map((m) => ({ id: m.id, type: 'mock' as const })), nodes: {} },
} as unknown as IStore)

const values = { name: 'orders', url: 'https://x/orders', status: 200, method: MethodEnum.GET }
const noop = () => undefined

describe('submitMock creation date', () => {
	it('stamps a new mock with the time it was made', async () => {
		const before = Date.now()
		await submitMock({ store: store(), isNew: true, values, setStoreProperties: noop, handleClose: noop, setSelectedMock: noop })

		expect(saved.at(-1)?.mocks[0].createdOn).toBeGreaterThanOrEqual(before)
	})

	it('leaves an imported mock without a date as it is when edited', async () => {
		const imported = { ...values, id: 'm-1', active: true, description: '', response: '' } as IMockResponse
		await submitMock({
			store: store([imported]),
			isNew: false,
			values: { ...imported, name: 'renamed' },
			setStoreProperties: noop,
			handleClose: noop,
			setSelectedMock: noop,
		})

		const [mock] = saved.at(-1)?.mocks ?? []
		expect(mock.name).toBe('renamed')
		expect(mock.createdOn).toBeUndefined()
	})
})
