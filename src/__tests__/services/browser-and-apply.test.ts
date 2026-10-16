import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('IS_FIREFOX', () => {
	beforeEach(() => vi.resetModules())
	afterEach(() => vi.unstubAllGlobals())

	it('is true for a moz-extension origin', async () => {
		vi.stubGlobal('chrome', { runtime: { getURL: () => 'moz-extension://abc/' } })
		const { IS_FIREFOX } = await import('@/services/browser')
		expect(IS_FIREFOX).toBe(true)
	})

	it('is false for a chrome-extension origin', async () => {
		vi.stubGlobal('chrome', { runtime: { getURL: () => 'chrome-extension://abc/' } })
		const { IS_FIREFOX } = await import('@/services/browser')
		expect(IS_FIREFOX).toBe(false)
	})

	it('falls back to the browser namespace', async () => {
		vi.stubGlobal('chrome', undefined)
		vi.stubGlobal('browser', { runtime: { getURL: () => 'moz-extension://abc/' } })
		const { IS_FIREFOX } = await import('@/services/browser')
		expect(IS_FIREFOX).toBe(true)
	})

	it('is false when getURL throws', async () => {
		vi.stubGlobal('chrome', { runtime: { getURL: () => { throw new Error('no context') } } })
		const { IS_FIREFOX } = await import('@/services/browser')
		expect(IS_FIREFOX).toBe(false)
	})
})

describe('MessageAPI.applyMocksNow', () => {
	beforeEach(() => {
		vi.resetModules()
		vi.stubGlobal('browser', undefined)
	})
	afterEach(() => vi.unstubAllGlobals())

	const load = async () => (await import('@/services/message/api')).MessageAPI

	it('sends no mock data, only the refresh request and the mocking flag', async () => {
		const calls: unknown[][] = []
		const sendMessage = vi.fn((...args: unknown[]) => {
			calls.push(args)
		})
		vi.stubGlobal('chrome', { tabs: { sendMessage }, runtime: { sendMessage: vi.fn() } })

		;(await load()).applyMocksNow(7, true)

		expect(calls[0][0]).toBe(7)
		expect(calls[0][1]).toEqual({
			message: { kind: 'APPLY_MOCKS', active: true },
			from: 'PANEL',
			to: 'CONTENT',
			type: 'NOTIFICATION',
			id: 7,
			extensionName: 'MOCKMAN',
		})
		expect(calls[0][2]).toEqual({ frameId: 0 })
		expect(typeof calls[0][3]).toBe('function')
	})

	it('goes through the background when the tabs API is missing, as in Firefox DevTools', async () => {
		const sendMessage = vi.fn().mockResolvedValue({ ok: true, value: true })
		vi.stubGlobal('chrome', { runtime: { sendMessage } })

		;(await load()).applyMocksNow(7, false)

		expect(sendMessage).toHaveBeenCalledWith({
			type: 'PANEL_SEND_TO_TAB',
			tabId: 7,
			message: {
				message: { kind: 'APPLY_MOCKS', active: false },
				from: 'PANEL',
				to: 'CONTENT',
				type: 'NOTIFICATION',
				id: 7,
				extensionName: 'MOCKMAN',
			},
		})
	})

	it('does nothing without a tab id', async () => {
		const sendMessage = vi.fn()
		vi.stubGlobal('chrome', { tabs: { sendMessage }, runtime: { sendMessage: vi.fn() } })

		;(await load()).applyMocksNow(undefined, true)

		expect(sendMessage).not.toHaveBeenCalled()
	})

	it('swallows a failing sendMessage', async () => {
		const sendMessage = vi.fn(() => Promise.reject(new Error('no receiver')))
		vi.stubGlobal('chrome', { tabs: { sendMessage }, runtime: { sendMessage: vi.fn() } })

		const api = await load()

		expect(() => api.applyMocksNow(7, true)).not.toThrow()
	})
})
