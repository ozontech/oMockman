import { tryHandleAIMessage } from '@/background/ai-handler'
import { migrateLegacyKeys } from '@/background/secrets'
import { isExtensionPageSender } from '@/background/sender'
import { getSecuritySettings, STORE_KEY } from '@/background/store-access'
import { clearHeaders, getHeaders, setHeaders } from '@/background/headers-store'
import { fetchOpenApiSpec } from '@/background/openapi-fetch'
import type { IEventMessage } from '@/interface/message'
import { canonicalOrigin } from '@/services/origin'

/**
 * Background service worker:
 * - captures the full response headers that CORS hides from the page
 * - answers GET_RESPONSE_HEADERS from the content script
 */

/**
 * AI keys used to sit in the main store, which the panel and every content script read. They are
 * moved out on each worker start, and again whenever a write from an older panel brings one back.
 */
const moveKeysOutOfStore = (): void => {
	migrateLegacyKeys().catch(() => undefined)
}
moveKeysOutOfStore()
try {
	chrome.storage.onChanged.addListener((changes, areaName) => {
		if (areaName !== 'local' || !changes?.[STORE_KEY]) return
		const providers = (changes[STORE_KEY].newValue as { ai?: { providers?: Array<{ apiKey?: unknown }> } } | undefined)?.ai?.providers
		if (Array.isArray(providers) && providers.some((provider) => typeof provider?.apiKey === 'string')) moveKeysOutOfStore()
	})
} catch {
	void 0
}

const panelPortsByTab = new Map<number, Set<chrome.runtime.Port>>()
const panelPortTabs = new WeakMap<chrome.runtime.Port, number>()

const contentPortsByTab = new Map<number, Set<chrome.runtime.Port>>()
const loggingEnabledByTab = new Map<number, boolean>()

const isCaptureEnabled = (tabId: number): boolean =>
	(panelPortsByTab.get(tabId)?.size ?? 0) > 0 && loggingEnabledByTab.get(tabId) !== false

const pushCaptureState = (tabId: number): void => {
	const message = { type: 'MOCKMAN_CAPTURE', enabled: isCaptureEnabled(tabId) }
	if (contentPortsByTab.get(tabId)?.size) {
		postToContentByTab(tabId, message)
		return
	}
	try {
		chrome.tabs.sendMessage(tabId, message, () => void chrome.runtime.lastError)
	} catch {
		void 0
	}
}

const isValidTabId = (tabId: number | undefined): tabId is number =>
	typeof tabId === 'number' && tabId >= 0

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null

const addPortToTabSet = (
	map: Map<number, Set<chrome.runtime.Port>>,
	tabId: number,
	port: chrome.runtime.Port,
): void => {
	const set = map.get(tabId) ?? new Set<chrome.runtime.Port>()
	set.add(port)
	map.set(tabId, set)
}

const removePortFromTabSet = (
	map: Map<number, Set<chrome.runtime.Port>>,
	tabId: number,
	port: chrome.runtime.Port,
): void => {
	const set = map.get(tabId)
	if (!set) return
	set.delete(port)
	if (set.size === 0) {
		map.delete(tabId)
	}
}

const postToPort = (port: chrome.runtime.Port, message: object): void => {
	try {
		port.postMessage(message)
	} catch {
		void 0
	}
}

const postToContentByTab = (tabId: number, message: object): void => {
	const ports = contentPortsByTab.get(tabId)
	if (!ports || ports.size === 0) return
	for (const p of ports) postToPort(p, message)
}

const postToAllContent = (message: object): void => {
	for (const ports of contentPortsByTab.values()) {
		for (const p of ports) postToPort(p, message)
	}
}

const postToPanelsByTab = (tabId: number, message: object): void => {
	const ports = panelPortsByTab.get(tabId)
	if (!ports || ports.size === 0) return
	for (const p of ports) postToPort(p, message)
}

const forwardLogToPanelByTab = (tabId: number, message: IEventMessage): void => {
	if (message.type !== 'LOG' || message.to !== 'PANEL') return
	const panelLogMessage: IEventMessage = { ...message, sourceTabId: tabId }
	postToPanelsByTab(tabId, panelLogMessage)
}

chrome.runtime.onConnect.addListener((port) => {
	if (port.name !== 'mockman-panel') return

	port.onMessage.addListener((raw) => {
		const msg = raw as { type?: string; tabId?: number } | IEventMessage
		if ('type' in msg && msg.type === 'REGISTER_PANEL') {
			const tabId = (msg as { tabId?: number }).tabId
			if (typeof tabId === 'number') {
				const previousTabId = panelPortTabs.get(port)
				if (typeof previousTabId === 'number' && previousTabId !== tabId) {
					removePortFromTabSet(panelPortsByTab, previousTabId, port)
				}
				panelPortTabs.set(port, tabId)
				addPortToTabSet(panelPortsByTab, tabId, port)
				pushCaptureState(tabId)
			}
		}
		if ('type' in msg && msg.type === 'SET_LOGGING') {
			const { tabId, enabled } = msg as { tabId?: number; enabled?: boolean }
			if (typeof tabId === 'number') {
				loggingEnabledByTab.set(tabId, enabled !== false)
				pushCaptureState(tabId)
			}
		}
		if (
			'type' in msg &&
			(msg as IEventMessage).type === 'NOTIFICATION' &&
			(msg as IEventMessage).to === 'CONTENT'
		) {
			const tabId = (msg as IEventMessage).id
			if (typeof tabId === 'number') {
				postToContentByTab(tabId, msg)
			} else {
				postToAllContent(msg)
			}
		}
	})

	port.onDisconnect.addListener(() => {
		const tabId = panelPortTabs.get(port)
		if (typeof tabId === 'number') {
			removePortFromTabSet(panelPortsByTab, tabId, port)
			panelPortTabs.delete(port)
			if (!panelPortsByTab.has(tabId)) {
				loggingEnabledByTab.delete(tabId)
				clearHeaders(tabId)
			}
			pushCaptureState(tabId)
		}
	})
})

chrome.runtime.onConnect.addListener((port) => {
	if (port.name !== 'mockman-content') return

	const tabId = port.sender?.tab?.id
	if (isValidTabId(tabId)) {
		addPortToTabSet(contentPortsByTab, tabId, port)
		postToPort(port, { type: 'MOCKMAN_CAPTURE', enabled: isCaptureEnabled(tabId) })
	}

	port.onMessage.addListener((raw) => {
		const msg = raw as IEventMessage
		if (msg && typeof tabId === 'number') {
			forwardLogToPanelByTab(tabId, msg)
		}
	})

	port.onDisconnect.addListener(() => {
		if (isValidTabId(tabId)) {
			removePortFromTabSet(contentPortsByTab, tabId, port)
		}
	})
})

chrome.webRequest.onResponseStarted.addListener(
	(details) => {
		if (details.type === 'main_frame' || details.type === 'sub_frame') return
		if (!isValidTabId(details.tabId) || !isCaptureEnabled(details.tabId)) return

		setHeaders(details.tabId, details.method, details.url, details.responseHeaders)
	},
	{ urls: ['<all_urls>'] },
	['responseHeaders'],
)

/**
 * An SPA changes the URL without a reload, so a content script outlives the origin it started
 * on. `tabs.onUpdated` covers history.pushState, hence no webNavigation permission.
 */
const originByTab = new Map<number, string | null>()

try {
	chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
		if (!changeInfo.url && !tab?.url) return
		const next = canonicalOrigin(changeInfo.url ?? tab?.url)
		if (originByTab.get(tabId) === next) return
		originByTab.set(tabId, next)
		postToContentByTab(tabId, { type: 'MOCKMAN_ORIGIN_CHANGED', origin: next })
	})

	chrome.tabs.onRemoved.addListener((tabId) => {
		originByTab.delete(tabId)
	})
} catch {
	void 0
}

// The only messages content scripts may send; everything else needs an extension page.
const CONTENT_ALLOWED_TYPES = new Set(['GET_RESPONSE_HEADERS', 'PANEL_GET_ORIGIN'])

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	const senderTabId = sender.tab?.id
	if (request && isValidTabId(senderTabId)) {
		forwardLogToPanelByTab(senderTabId, request as IEventMessage)
	}

	if (!isObject(request) || typeof request.type !== 'string') {
		return undefined
	}

	const fromExtensionPage = isExtensionPageSender(sender)
	if (!fromExtensionPage && !CONTENT_ALLOWED_TYPES.has(request.type)) {
		return undefined
	}

	if (tryHandleAIMessage(request, sendResponse)) {
		return true
	}

	if (request.type === 'GET_RESPONSE_HEADERS') {
		const method = String(request.method ?? '')
		const url = String(request.url ?? '')
		// Only a content script asks, and only about its own tab.
		const headers = isValidTabId(senderTabId) ? getHeaders(senderTabId, method, url) : []
		sendResponse({ headers })
		return true
	}

	if (request.type === 'PANEL_QUERY_TABS') {
		try {
			chrome.tabs.query(request.query ?? {}, (tabs) => {
				void chrome.runtime.lastError
				sendResponse({ tabs: tabs ?? [] })
			})
		} catch {
			sendResponse({ tabs: [] })
		}
		return true
	}

	// Answered from the browser, never from the caller: a page could name any origin it likes.
	if (request.type === 'PANEL_GET_ORIGIN') {
		if (!fromExtensionPage) {
			sendResponse({ origin: canonicalOrigin(sender.url) })
			return true
		}
		const tabId = request.tabId
		if (typeof tabId !== 'number') {
			sendResponse({ origin: null })
			return true
		}
		try {
			chrome.tabs.get(tabId, (tab) => {
				// Reading lastError keeps a closed tab out of the extension's error log.
				void chrome.runtime.lastError
				sendResponse({ origin: canonicalOrigin(tab?.url) })
			})
		} catch {
			sendResponse({ origin: null })
		}
		return true
	}

	if (request.type === 'PANEL_GET_TAB') {
		const tabId = request.tabId
		if (typeof tabId !== 'number') {
			sendResponse({ tab: null })
			return true
		}
		try {
			chrome.tabs.get(tabId, (tab) => {
				void chrome.runtime.lastError
				sendResponse({ tab: tab ?? null })
			})
		} catch {
			sendResponse({ tab: null })
		}
		return true
	}

	/** DevTools pages in Firefox have no `tabs` API, so the panel asks the worker to message a tab. */
	if (request.type === 'PANEL_SEND_TO_TAB') {
		const tabId = request.tabId
		if (typeof tabId !== 'number' || !isObject(request.message)) {
			sendResponse({ ok: false, error: 'No tab to message.' })
			return true
		}
		try {
			chrome.tabs.sendMessage(tabId, request.message, { frameId: 0 }, (value) => {
				const lastError = chrome.runtime.lastError
				if (lastError) sendResponse({ ok: false, error: lastError.message ?? 'No connection to the page' })
				else if (value === undefined) sendResponse({ ok: false, error: 'No answer from the page' })
				else sendResponse({ ok: true, value })
			})
		} catch (error) {
			sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) })
		}
		return true
	}

	if (request.type === 'PANEL_FETCH_OPENAPI_SPEC') {
		const specUrl = String(request.url ?? '')
		// Read from storage, never from the message.
		void getSecuritySettings()
			.then((security) => fetchOpenApiSpec(specUrl, { allowLocalTargets: security.allowLocalOpenApi }))
			.then((result) => sendResponse(result))
			.catch(() => sendResponse({ ok: false, error: 'Failed to load OpenAPI schema.' }))
		return true
	}

})
