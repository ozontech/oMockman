import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useAddBulkMock } from '@/panel/app/hooks/usePanelListener/add-bulk-mock'
import { getMockFromLog } from '@/panel/app/logs/log-util'
import type * as Service from '@/panel/app/service'
import type { ILog, IMockResponse, IStore } from '@/interface/mock'

const saved = vi.hoisted((): IMockResponse[][] => [])

vi.mock('@/panel/app/service', async (importOriginal) => ({
	...(await importOriginal<typeof Service>()),
	storeActions: {
		getStore: vi.fn(async () => ({ store: { mocks: [] } as unknown as IStore })),
		addMocks: vi.fn((store: IStore, mocks: IMockResponse[]) => {
			saved.push(mocks)
			return { ...store, mocks }
		}),
		updateStoreInDB: vi.fn(async (store: IStore) => ({ store, urlMap: {}, dynamicUrlMap: {} })),
		refreshContentStore: vi.fn(),
	},
}))

describe('useAddBulkMock', () => {
	it('keeps the request body of a recorded call as a draft and mocks the response', async () => {
		const log = {
			request: { url: 'https://example.com/api/orders', method: 'POST', headers: [], body: '{"qty":1}' },
			response: { status: 200, response: '{"ok":true}', headers: [] },
		} as unknown as ILog
		const { result } = renderHook(() => useAddBulkMock())

		await result.current([getMockFromLog(log)])

		const [mock] = saved[0]
		expect(mock.requestPatch).toEqual({ mode: 'replace', body: '{"qty":1}' })
		expect(mock.apply).toEqual({ responseBody: true, responseHeaders: true, requestBody: false })
		expect(mock.response).toBe('{"ok":true}')
	})
})
