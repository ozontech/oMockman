import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

declare global {
	interface Window {
		__MOCKMAN_CONTENT_PORT__?: chrome.runtime.Port | null
	}
}

vi.stubGlobal('window', {
	__MOCKMAN_CONTENT_PORT__: null as chrome.runtime.Port | null,
	// getContentPort attaches a pagehide handler (it closes the port before
	// bfcache), so the window stub needs addEventListener.
	addEventListener: vi.fn(),
})

const mockPort = {
	onDisconnect: {
		addListener: vi.fn(),
	},
	onMessage: {
		addListener: vi.fn(),
	},
	disconnect: vi.fn(),
	postMessage: vi.fn(),
}

vi.stubGlobal('chrome', {
	runtime: {
		connect: vi.fn(() => mockPort),
	},
})

const { getContentPort } = await import('../../contentScript/port')

describe('getContentPort', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		window.__MOCKMAN_CONTENT_PORT__ = undefined
	})

	afterEach(() => {
		window.__MOCKMAN_CONTENT_PORT__ = undefined
	})

	it('creates the port on first call', () => {
		const port = getContentPort()

		expect(chrome.runtime.connect).toHaveBeenCalledWith({ name: 'mockman-content' })
		expect(port).toBe(mockPort)
	})

	it('reuses the existing port', () => {
		getContentPort()
		getContentPort()

		expect(chrome.runtime.connect).toHaveBeenCalledTimes(1)
	})

	it('nulls the port on disconnect', () => {
		getContentPort()

		const disconnectCallback = (mockPort.onDisconnect.addListener as ReturnType<typeof vi.fn>).mock.calls[0][0]
		disconnectCallback()

		expect(window.__MOCKMAN_CONTENT_PORT__).toBeNull()
	})
})