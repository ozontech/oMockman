import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { usePanelListener } from '@/panel/app/hooks/usePanelListener'
import { useGlobalStore, useLogStore } from '@/panel/app/store'
import type { ILog } from '@/interface/mock'

const addBulkMock = vi.fn()

vi.mock('@/panel/app/hooks/usePanelListener/add-bulk-mock', () => ({
	useAddBulkMock: () => addBulkMock,
}))

const port = {
	postMessage: vi.fn(),
	disconnect: vi.fn(),
	onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
	onDisconnect: { addListener: vi.fn() },
}

const meta = { tab: { id: 42 }, host: '', active: false, storeKey: '' } as never

const log = (overrides: Partial<ILog> = {}): ILog => ({
	id: 'log-1',
	request: { url: 'https://example.com/api', method: 'GET', headers: [], body: '' },
	response: { status: 200, response: '{}', headers: [] },
	...overrides,
} as ILog)

describe('usePanelListener', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		addBulkMock.mockResolvedValue(undefined)
		vi.stubGlobal('chrome', {
			runtime: {
				connect: vi.fn(() => port),
				sendMessage: vi.fn(),
				onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
				lastError: undefined,
			},
		})
		useGlobalStore.setState({ recording: false, loggingEnabled: true })
		useLogStore.setState({ logs: [] } as never)
	})

	it('registers the panel for its tab and reports the logging state', () => {
		renderHook(() => usePanelListener(meta))

		expect(port.postMessage).toHaveBeenCalledWith({ type: 'REGISTER_PANEL', tabId: 42 })
		expect(port.postMessage).toHaveBeenCalledWith({ type: 'SET_LOGGING', tabId: 42, enabled: true })
	})

	it('tells the background when logging is switched off', () => {
		renderHook(() => usePanelListener(meta))
		port.postMessage.mockClear()

		act(() => {
			useGlobalStore.getState().toggleLogging()
		})

		expect(port.postMessage).toHaveBeenCalledWith({ type: 'SET_LOGGING', tabId: 42, enabled: false })
	})

	it('stores incoming logs for its own tab', () => {
		renderHook(() => usePanelListener(meta))
		const handler = port.onMessage.addListener.mock.calls[0][0] as (msg: unknown) => void

		act(() => handler({ type: 'LOG', sourceTabId: 42, message: log() }))

		expect(useLogStore.getState().logs).toHaveLength(1)
	})

	it('drops logs coming from another tab', () => {
		renderHook(() => usePanelListener(meta))
		const handler = port.onMessage.addListener.mock.calls[0][0] as (msg: unknown) => void

		act(() => handler({ type: 'LOG', sourceTabId: 99, message: log() }))

		expect(useLogStore.getState().logs).toHaveLength(0)
	})

	it('does not store logs while logging is off', () => {
		useGlobalStore.setState({ loggingEnabled: false })
		renderHook(() => usePanelListener(meta))
		const handler = port.onMessage.addListener.mock.calls[0][0] as (msg: unknown) => void

		act(() => handler({ type: 'LOG', sourceTabId: 42, message: log() }))

		expect(useLogStore.getState().logs).toHaveLength(0)
	})

	it('turns recorded calls into mocks when recording stops', () => {
		useGlobalStore.setState({ recording: true })
		renderHook(() => usePanelListener(meta))
		const handler = port.onMessage.addListener.mock.calls[0][0] as (msg: unknown) => void

		act(() => handler({ type: 'LOG', sourceTabId: 42, message: log() }))
		act(() => {
			useGlobalStore.getState().toggleRecording()
		})

		expect(addBulkMock).toHaveBeenCalledTimes(1)
		expect(addBulkMock.mock.calls[0][0]).toHaveLength(1)
	})

	it('picks up the inspected host from an INIT message', () => {
		const { result } = renderHook(() => usePanelListener(meta))
		const handler = port.onMessage.addListener.mock.calls[0][0] as (msg: unknown) => void

		act(() => handler({ type: 'INIT', message: 'example.com' }))

		expect(result.current).toBeDefined()
	})

	it('disconnects the port on unmount', () => {
		const { unmount } = renderHook(() => usePanelListener(meta))
		unmount()
		expect(port.disconnect).toHaveBeenCalled()
	})
})
