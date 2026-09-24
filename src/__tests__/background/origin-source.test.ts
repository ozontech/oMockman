import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type * as ActualModule from '@/services/ai'

/**
 * The origin a permission is checked against must come from the browser. A page can claim
 * any origin it likes, so the background answers from sender.tab / tabs.get instead.
 */

type Listener = (...args: unknown[]) => unknown

const messageRouters: Listener[] = []
const tabsGet = vi.fn()

vi.mock('@/services/ai', async (importOriginal) => {
	const actual = await importOriginal<typeof ActualModule>()
	return { ...actual, chatCompletion: vi.fn() }
})

vi.mock('@/background/openapi-fetch', () => ({ fetchOpenApiSpec: vi.fn() }))
vi.mock('@/background/headers-store', () => ({
	setHeaders: vi.fn(),
	getHeaders: () => [],
	clearHeaders: vi.fn(),
}))
vi.mock('@/background/store-access', () => ({
	getStoredAIProvider: vi.fn(),
	getSecuritySettings: vi.fn().mockResolvedValue({ allowLocalOpenApi: false }),
	STORE_KEY: 'mockman.extension.main.db',
}))

const sendMessage = (message: unknown, sender: chrome.runtime.MessageSender): unknown => {
	let response: unknown
	for (const router of messageRouters) {
		;(router as (m: unknown, s: chrome.runtime.MessageSender, r: (v: unknown) => void) => unknown)(
			message,
			sender,
			(value: unknown) => {
				response = value
			},
		)
	}
	return response
}

const PANEL_SENDER = {
	id: 'test-extension-id',
	url: 'chrome-extension://test-extension-id/public/html/panel.html',
} as chrome.runtime.MessageSender

const CONTENT_SENDER = {
	id: 'test-extension-id',
	url: 'https://evil.example.com/page',
	tab: { id: 42 },
} as chrome.runtime.MessageSender

describe('trusted origin source', () => {
	beforeEach(async () => {
		vi.resetModules()
		messageRouters.length = 0
		vi.clearAllMocks()

		vi.stubGlobal('chrome', {
			runtime: {
				id: 'test-extension-id',
				onConnect: { addListener: vi.fn() },
				onMessage: { addListener: (cb: Listener) => messageRouters.push(cb) },
				lastError: undefined,
			},
			webRequest: { onResponseStarted: { addListener: vi.fn() } },
			tabs: { query: vi.fn(), get: tabsGet, sendMessage: vi.fn(), onRemoved: { addListener: vi.fn() } },
		})

		await import('@/background')
	})

	afterEach(() => vi.unstubAllGlobals())

	it('answers a content script about its own frame only', () => {
		tabsGet.mockImplementation((_id: number, cb: (tab: unknown) => void) => cb({ url: 'https://site.ru/inner/page' }))

		// The page names another tab; the background ignores that and reads sender.url.
		const response = sendMessage({ type: 'PANEL_GET_ORIGIN', tabId: 999 }, CONTENT_SENDER)

		expect(response).toEqual({ origin: 'https://evil.example.com' })
		// The tab's own URL never enters the answer, so an iframe cannot inherit it.
		expect(tabsGet).not.toHaveBeenCalled()
	})

	it('gives a cross-origin iframe its own origin, not the top page one', () => {
		// Storybook and the like render in an iframe; each frame is judged on itself.
		tabsGet.mockImplementation((_id: number, cb: (tab: unknown) => void) => cb({ url: 'https://top.example.com/' }))

		const frameSender = {
			id: 'test-extension-id',
			url: 'https://frame.example.com/inner.html',
			frameId: 3,
			tab: { id: 42, url: 'https://top.example.com/' },
		} as chrome.runtime.MessageSender

		expect(sendMessage({ type: 'PANEL_GET_ORIGIN' }, frameSender)).toEqual({ origin: 'https://frame.example.com' })
	})

	it('answers the panel about the tab it asks for', () => {
		tabsGet.mockImplementation((_id: number, cb: (tab: unknown) => void) => cb({ url: 'https://site.ru:8443/app' }))

		const response = sendMessage({ type: 'PANEL_GET_ORIGIN', tabId: 7 }, PANEL_SENDER)

		expect(tabsGet).toHaveBeenCalledWith(7, expect.any(Function))
		expect(response).toEqual({ origin: 'https://site.ru:8443' })
	})

	it('reports no origin for a page that cannot be mocked', () => {
		tabsGet.mockImplementation((_id: number, cb: (tab: unknown) => void) => cb({ url: 'about:blank' }))

		expect(sendMessage({ type: 'PANEL_GET_ORIGIN', tabId: 7 }, PANEL_SENDER)).toEqual({ origin: null })
	})

	it('reports no origin when the tab is gone', () => {
		tabsGet.mockImplementation((_id: number, cb: (tab: unknown) => void) => cb(undefined))

		expect(sendMessage({ type: 'PANEL_GET_ORIGIN', tabId: 7 }, PANEL_SENDER)).toEqual({ origin: null })
	})
})
