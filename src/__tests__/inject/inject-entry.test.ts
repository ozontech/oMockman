import { beforeEach, describe, expect, it, vi } from 'vitest'

type InjectFlags = {
	__MOCKMAN_LOADED__?: boolean
	__MOCKMAN_INJECT_READY__?: boolean
}

const flags = window as unknown as InjectFlags

describe('inject entry', () => {
	beforeEach(() => {
		vi.resetModules()
		vi.restoreAllMocks()
		delete flags.__MOCKMAN_LOADED__
		delete flags.__MOCKMAN_INJECT_READY__
	})

	it('installs the wrappers and announces readiness', async () => {
		const postMessage = vi.spyOn(window, 'postMessage').mockImplementation(() => void 0)

		await import('@/inject/inject')

		expect(flags.__MOCKMAN_LOADED__).toBe(true)
		expect(flags.__MOCKMAN_INJECT_READY__).toBe(true)
		expect(postMessage).toHaveBeenCalledWith({ type: 'MOCKMAN_INJECT_READY' }, '*')
	})

	it('answers a readiness ping without sending any data', async () => {
		const postMessage = vi.spyOn(window, 'postMessage').mockImplementation(() => void 0)
		await import('@/inject/inject')
		postMessage.mockClear()

		window.dispatchEvent(new MessageEvent('message', { source: window, data: { type: 'MOCKMAN_CHECK_READY' } }))

		// Earlier imports in this file left their listeners on the shared window.
		expect(postMessage).toHaveBeenCalled()
		for (const call of postMessage.mock.calls) {
			expect(call).toEqual([{ type: 'MOCKMAN_INJECT_READY' }, '*'])
		}
	})

	it('ignores pings from other windows', async () => {
		const postMessage = vi.spyOn(window, 'postMessage').mockImplementation(() => void 0)
		await import('@/inject/inject')
		postMessage.mockClear()

		window.dispatchEvent(new MessageEvent('message', { source: null, data: { type: 'MOCKMAN_CHECK_READY' } }))

		expect(postMessage).not.toHaveBeenCalled()
	})

	it('does nothing when loaded inside the extension world', async () => {
		vi.stubGlobal('chrome', { runtime: { id: 'extension-id' } })
		const postMessage = vi.spyOn(window, 'postMessage').mockImplementation(() => void 0)

		await import('@/inject/inject')

		expect(flags.__MOCKMAN_LOADED__).toBeUndefined()
		expect(postMessage).not.toHaveBeenCalled()
		vi.unstubAllGlobals()
	})
})
