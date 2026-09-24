import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type * as ActualModule from '@/services/ai'

type Listener = (...args: unknown[]) => unknown

interface PortStub {
	name: string
	sender?: { tab?: { id: number } }
	postMessage: ReturnType<typeof vi.fn>
	onMessage: { addListener: (cb: Listener) => void; fire: (msg: unknown) => void }
	onDisconnect: { addListener: (cb: Listener) => void; fire: () => void }
}

const makePort = (name: string, tabId?: number): PortStub => {
	const messageListeners: Listener[] = []
	const disconnectListeners: Listener[] = []
	return {
		name,
		sender: typeof tabId === 'number' ? { tab: { id: tabId } } : undefined,
		postMessage: vi.fn(),
		onMessage: {
			addListener: (cb) => messageListeners.push(cb),
			fire: (msg) => messageListeners.forEach((cb) => cb(msg)),
		},
		onDisconnect: {
			addListener: (cb) => disconnectListeners.push(cb),
			fire: () => disconnectListeners.forEach((cb) => cb()),
		},
	}
}

const connectListeners: Listener[] = []
const messageRouters: Listener[] = []
const webRequestResponseStarted: Listener[] = []

const chatCompletion = vi.fn()
const fetchOpenApiSpec = vi.fn()
const setHeaders = vi.fn()
const HEADER_ROW = { name: 'content-type', value: 'application/json' }
const getHeaders = vi.fn((): Array<typeof HEADER_ROW> => [HEADER_ROW])
const clearHeaders = vi.fn()
const getStoredAIProvider = vi.fn()
const getSecuritySettings = vi.fn()

vi.mock('@/services/ai', async (importOriginal) => {
	const actual = await importOriginal<typeof ActualModule>()
	return { ...actual, chatCompletion: (...args: unknown[]) => chatCompletion(...args) }
})

vi.mock('@/background/openapi-fetch', () => ({
	fetchOpenApiSpec: (...args: unknown[]) => fetchOpenApiSpec(...args),
}))

vi.mock('@/background/headers-store', () => ({
	setHeaders: (...args: unknown[]) => setHeaders(...args),
	getHeaders: () => getHeaders(),
	clearHeaders: () => clearHeaders(),
}))

vi.mock('@/background/store-access', () => ({
	getStoredAIProvider: (...args: unknown[]) => getStoredAIProvider(...args),
	getSecuritySettings: () => getSecuritySettings(),
	STORE_KEY: 'mockman.extension.main.db',
}))

const connect = (port: PortStub): void => {
	connectListeners.forEach((cb) => cb(port))
}

const sendMessage = (
	message: unknown,
	sender: chrome.runtime.MessageSender,
): { handled: boolean; response: unknown } => {
	let response: unknown
	let handled = false
	for (const router of messageRouters) {
		const result = (router as (
			msg: unknown,
			from: chrome.runtime.MessageSender,
			respond: (value: unknown) => void,
		) => unknown)(message, sender, (value: unknown) => {
			response = value
		})
		if (result === true) handled = true
	}
	return { handled, response }
}

const EXTENSION_SENDER = {
	id: 'test-extension-id',
	url: 'chrome-extension://test-extension-id/public/html/panel.html',
} as chrome.runtime.MessageSender

const CONTENT_SENDER = {
	id: 'test-extension-id',
	url: 'https://example.com/page',
	tab: { id: 42 },
} as chrome.runtime.MessageSender

describe('background router', () => {
	beforeEach(async () => {
		vi.resetModules()
		connectListeners.length = 0
		messageRouters.length = 0
		webRequestResponseStarted.length = 0
		vi.clearAllMocks()
		getSecuritySettings.mockResolvedValue({ allowLocalOpenApi: false })
		fetchOpenApiSpec.mockResolvedValue({ ok: true, sourceUrl: 'https://x/openapi.json', spec: {} })
		chatCompletion.mockResolvedValue({ ok: true, content: '{}', model: 'm' })

		vi.stubGlobal('chrome', {
			runtime: {
				id: 'test-extension-id',
				onConnect: { addListener: (cb: Listener) => connectListeners.push(cb) },
				onMessage: { addListener: (cb: Listener) => messageRouters.push(cb) },
				lastError: undefined,
			},
			webRequest: {
				onResponseStarted: { addListener: (cb: Listener) => webRequestResponseStarted.push(cb) },
				onBeforeRequest: { addListener: vi.fn() },
				onSendHeaders: { addListener: vi.fn() },
			},
			tabs: {
				query: vi.fn((_query: unknown, cb: (tabs: unknown[]) => void) => cb([{ id: 1 }])),
				get: vi.fn((id: number, cb: (tab: unknown) => void) => cb({ id })),
				sendMessage: vi.fn(),
				onRemoved: { addListener: vi.fn() },
			},
		})

		await import('@/background')
	})

	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it('answers GET_RESPONSE_HEADERS from a content script', () => {
		const { handled, response } = sendMessage({ type: 'GET_RESPONSE_HEADERS', method: 'GET', url: 'https://x' }, CONTENT_SENDER)

		expect(handled).toBe(true)
		expect(response).toEqual({ headers: [{ name: 'content-type', value: 'application/json' }] })
	})

	it('refuses an AI request coming from a content script', () => {
		const { handled } = sendMessage(
			{ type: 'AI_CHAT', providerId: 'p-1', messages: [{ role: 'user', content: 'hi' }] },
			CONTENT_SENDER,
		)

		expect(handled).toBe(false)
		expect(chatCompletion).not.toHaveBeenCalled()
	})

	it('refuses an OpenAPI fetch coming from a content script', () => {
		const { handled } = sendMessage({ type: 'PANEL_FETCH_OPENAPI_SPEC', url: 'https://x/openapi.json' }, CONTENT_SENDER)

		expect(handled).toBe(false)
		expect(fetchOpenApiSpec).not.toHaveBeenCalled()
	})

	it('refuses tab queries coming from a content script', () => {
		expect(sendMessage({ type: 'PANEL_QUERY_TABS', query: {} }, CONTENT_SENDER).handled).toBe(false)
		expect(sendMessage({ type: 'PANEL_GET_TAB', tabId: 1 }, CONTENT_SENDER).handled).toBe(false)
		expect(chrome.tabs.query).not.toHaveBeenCalled()
	})

	it('serves an AI request from the panel and resolves the provider from storage', async () => {
		getStoredAIProvider.mockResolvedValue({
			id: 'p-1',
			baseURL: 'https://llm.example.com/api',
			apiKey: 'sk-stored',
			model: 'm',
		})

		const { handled } = sendMessage(
			{ type: 'AI_CHAT', providerId: 'p-1', messages: [{ role: 'user', content: 'hi' }] },
			EXTENSION_SENDER,
		)
		await vi.waitFor(() => expect(chatCompletion).toHaveBeenCalled())

		expect(handled).toBe(true)
		expect(getStoredAIProvider).toHaveBeenCalledWith('p-1')
		expect(chatCompletion.mock.calls[0][0]).toMatchObject({ apiKey: 'sk-stored' })
	})

	it('refuses an AI request naming a provider that is not stored', async () => {
		getStoredAIProvider.mockResolvedValue(null)
		let response: unknown
		messageRouters.forEach((router) => router(
			{ type: 'AI_CHAT', providerId: 'ghost', messages: [{ role: 'user', content: 'hi' }] },
			EXTENSION_SENDER,
			(value: unknown) => {
				response = value
			},
		))

		await vi.waitFor(() => expect(response).toBeDefined())
		expect(response).toMatchObject({ ok: false, error: { code: 'provider_misconfigured' } })
		expect(chatCompletion).not.toHaveBeenCalled()
	})

	it('passes the stored local-target setting to the OpenAPI loader', async () => {
		getSecuritySettings.mockResolvedValue({ allowLocalOpenApi: true })

		sendMessage({ type: 'PANEL_FETCH_OPENAPI_SPEC', url: 'https://x/openapi.json' }, EXTENSION_SENDER)
		await vi.waitFor(() => expect(fetchOpenApiSpec).toHaveBeenCalled())

		expect(fetchOpenApiSpec).toHaveBeenCalledWith('https://x/openapi.json', { allowLocalTargets: true })
	})

	it('answers tab queries from the panel', () => {
		const tabs = sendMessage({ type: 'PANEL_QUERY_TABS', query: {} }, EXTENSION_SENDER)
		expect(tabs.response).toEqual({ tabs: [{ id: 1 }] })

		const tab = sendMessage({ type: 'PANEL_GET_TAB', tabId: 5 }, EXTENSION_SENDER)
		expect(tab.response).toEqual({ tab: { id: 5 } })
	})

	it('ignores messages without a type', () => {
		expect(sendMessage({ nope: true }, EXTENSION_SENDER).handled).toBe(false)
		expect(sendMessage('string', EXTENSION_SENDER).handled).toBe(false)
	})

	it('does not capture response headers while no panel is open', () => {
		const details = { tabId: 42, method: 'GET', url: 'https://example.com/api', type: 'xmlhttprequest', responseHeaders: [] }
		webRequestResponseStarted.forEach((cb) => cb(details))

		expect(setHeaders).not.toHaveBeenCalled()
	})

	it('captures response headers once a panel registers and enables logging', () => {
		const panel = makePort('mockman-panel')
		connect(panel)
		panel.onMessage.fire({ type: 'REGISTER_PANEL', tabId: 42 })
		panel.onMessage.fire({ type: 'SET_LOGGING', tabId: 42, enabled: true })

		const details = { tabId: 42, method: 'GET', url: 'https://example.com/api', type: 'xmlhttprequest', responseHeaders: [] }
		webRequestResponseStarted.forEach((cb) => cb(details))

		expect(setHeaders).toHaveBeenCalledWith('GET', 'https://example.com/api', [])
	})

	it('stops capturing when the panel turns logging off', () => {
		const panel = makePort('mockman-panel')
		connect(panel)
		panel.onMessage.fire({ type: 'REGISTER_PANEL', tabId: 42 })
		panel.onMessage.fire({ type: 'SET_LOGGING', tabId: 42, enabled: false })

		webRequestResponseStarted.forEach((cb) => cb({
			tabId: 42, method: 'GET', url: 'https://example.com/api', type: 'xmlhttprequest', responseHeaders: [],
		}))

		expect(setHeaders).not.toHaveBeenCalled()
	})

	it('drops the header cache when the last panel for a tab closes', () => {
		const panel = makePort('mockman-panel')
		connect(panel)
		panel.onMessage.fire({ type: 'REGISTER_PANEL', tabId: 42 })
		panel.onDisconnect.fire()

		expect(clearHeaders).toHaveBeenCalled()
	})

	it('never captures main frame navigations', () => {
		const panel = makePort('mockman-panel')
		connect(panel)
		panel.onMessage.fire({ type: 'REGISTER_PANEL', tabId: 42 })
		panel.onMessage.fire({ type: 'SET_LOGGING', tabId: 42, enabled: true })

		webRequestResponseStarted.forEach((cb) => cb({
			tabId: 42, method: 'GET', url: 'https://example.com/', type: 'main_frame', responseHeaders: [],
		}))

		expect(setHeaders).not.toHaveBeenCalled()
	})

	it('tells a content script the capture state as soon as it connects', () => {
		const content = makePort('mockman-content', 42)
		connect(content)

		expect(content.postMessage).toHaveBeenCalledWith({ type: 'MOCKMAN_CAPTURE', enabled: false })
	})

	it('pushes the capture state to the content script when a panel opens', () => {
		const content = makePort('mockman-content', 42)
		connect(content)
		content.postMessage.mockClear()

		const panel = makePort('mockman-panel')
		connect(panel)
		panel.onMessage.fire({ type: 'REGISTER_PANEL', tabId: 42 })

		expect(content.postMessage).toHaveBeenCalledWith({ type: 'MOCKMAN_CAPTURE', enabled: true })
		expect(chrome.tabs.sendMessage).not.toHaveBeenCalled()
	})

	it('falls back to a tab message when the content port is gone', () => {
		// e.g. the worker was stopped and restarted while the page stayed open
		const panel = makePort('mockman-panel')
		connect(panel)
		panel.onMessage.fire({ type: 'REGISTER_PANEL', tabId: 42 })

		expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
			42,
			{ type: 'MOCKMAN_CAPTURE', enabled: true },
			expect.any(Function),
		)
	})

	it('forwards a log from the content port to the panel of the same tab', () => {
		const panel = makePort('mockman-panel')
		connect(panel)
		panel.onMessage.fire({ type: 'REGISTER_PANEL', tabId: 42 })
		panel.postMessage.mockClear()

		const content = makePort('mockman-content', 42)
		connect(content)
		content.onMessage.fire({ type: 'LOG', to: 'PANEL', message: { request: { url: 'https://x' } } })

		expect(panel.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'LOG', sourceTabId: 42 }))
	})

	it('does not forward a log to a panel watching another tab', () => {
		const panel = makePort('mockman-panel')
		connect(panel)
		panel.onMessage.fire({ type: 'REGISTER_PANEL', tabId: 7 })
		panel.postMessage.mockClear()

		const content = makePort('mockman-content', 42)
		connect(content)
		content.onMessage.fire({ type: 'LOG', to: 'PANEL', message: { request: { url: 'https://x' } } })

		expect(panel.postMessage).not.toHaveBeenCalled()
	})

	it('relays a panel notification to the content script of that tab', () => {
		const content = makePort('mockman-content', 42)
		connect(content)
		content.postMessage.mockClear()

		const panel = makePort('mockman-panel')
		connect(panel)
		panel.onMessage.fire({ type: 'NOTIFICATION', to: 'CONTENT', id: 42, message: 'UPDATE_STORE' })

		expect(content.postMessage).toHaveBeenCalledWith(expect.objectContaining({ message: 'UPDATE_STORE' }))
	})

	it('broadcasts a panel notification without a tab id to every content script', () => {
		const first = makePort('mockman-content', 1)
		const second = makePort('mockman-content', 2)
		connect(first)
		connect(second)
		first.postMessage.mockClear()
		second.postMessage.mockClear()

		const panel = makePort('mockman-panel')
		connect(panel)
		panel.onMessage.fire({ type: 'NOTIFICATION', to: 'CONTENT', message: 'UPDATE_STORE' })

		expect(first.postMessage).toHaveBeenCalled()
		expect(second.postMessage).toHaveBeenCalled()
	})

	it('ignores ports it does not own', () => {
		const other = makePort('someone-else', 42)
		expect(() => connect(other)).not.toThrow()
		expect(other.postMessage).not.toHaveBeenCalled()
	})
})
