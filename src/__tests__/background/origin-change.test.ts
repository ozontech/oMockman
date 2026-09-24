import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type * as ActualModule from '@/services/ai'

/**
 * Permissions belong to an origin, and a content script outlives the origin it started on:
 * an SPA changes the URL without a reload. The background watches navigation and tells the
 * page world to re-check, so a grant for one site does not survive into the next.
 */

type Listener = (...args: unknown[]) => unknown

interface PortStub {
	name: string
	sender?: { tab?: { id: number } }
	postMessage: ReturnType<typeof vi.fn>
	onMessage: { addListener: (cb: Listener) => void; fire: (msg: unknown) => void }
	onDisconnect: { addListener: (cb: Listener) => void; fire: () => void }
}

const connectListeners: Listener[] = []
const updatedListeners: Listener[] = []
const removedListeners: Listener[] = []
const tabsSendMessage = vi.fn()

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

const makeContentPort = (tabId: number): PortStub => ({
	name: 'mockman-content',
	sender: { tab: { id: tabId } },
	postMessage: vi.fn(),
	onMessage: { addListener: vi.fn(), fire: vi.fn() },
	onDisconnect: { addListener: vi.fn(), fire: vi.fn() },
})

const navigate = (tabId: number, url: string | undefined, fromTab?: string) => {
	for (const listener of updatedListeners) {
		listener(tabId, url ? { url } : {}, fromTab ? { url: fromTab } : undefined)
	}
}

describe('origin change', () => {
	let content: PortStub

	beforeEach(async () => {
		vi.resetModules()
		connectListeners.length = 0
		updatedListeners.length = 0
		removedListeners.length = 0
		vi.clearAllMocks()

		vi.stubGlobal('chrome', {
			runtime: {
				id: 'test-extension-id',
				onConnect: { addListener: (cb: Listener) => connectListeners.push(cb) },
				onMessage: { addListener: vi.fn() },
				lastError: undefined,
			},
			webRequest: { onResponseStarted: { addListener: vi.fn() } },
			tabs: {
				query: vi.fn(),
				get: vi.fn(),
				sendMessage: tabsSendMessage,
				onUpdated: { addListener: (cb: Listener) => updatedListeners.push(cb) },
				onRemoved: { addListener: (cb: Listener) => removedListeners.push(cb) },
			},
		})

		await import('@/background')

		content = makeContentPort(42)
		for (const listener of connectListeners) listener(content)
		content.postMessage.mockClear()
	})

	afterEach(() => vi.unstubAllGlobals())

	it('tells the page world when the origin changes', () => {
		navigate(42, 'https://site.ru/app')

		expect(content.postMessage).toHaveBeenCalledWith({
			type: 'MOCKMAN_ORIGIN_CHANGED',
			origin: 'https://site.ru',
		})
	})

	it('stays quiet while only the path changes', () => {
		navigate(42, 'https://site.ru/app')
		content.postMessage.mockClear()

		navigate(42, 'https://site.ru/app/orders/1')

		expect(content.postMessage).not.toHaveBeenCalled()
	})

	it('reports a move to another origin', () => {
		navigate(42, 'https://site.ru/app')
		content.postMessage.mockClear()

		navigate(42, 'https://other.ru/app')

		expect(content.postMessage).toHaveBeenCalledWith({
			type: 'MOCKMAN_ORIGIN_CHANGED',
			origin: 'https://other.ru',
		})
	})

	it('reports a null origin for a page that cannot be mocked', () => {
		navigate(42, 'https://site.ru/app')
		content.postMessage.mockClear()

		navigate(42, 'about:blank')

		expect(content.postMessage).toHaveBeenCalledWith({ type: 'MOCKMAN_ORIGIN_CHANGED', origin: null })
	})

	it('forgets a tab that was closed', () => {
		navigate(42, 'https://site.ru/app')
		for (const listener of removedListeners) listener(42)
		content.postMessage.mockClear()

		// Same origin as before, but the tab was reset, so the verdict is sent again.
		navigate(42, 'https://site.ru/app')

		expect(content.postMessage).toHaveBeenCalledWith({
			type: 'MOCKMAN_ORIGIN_CHANGED',
			origin: 'https://site.ru',
		})
	})
})
