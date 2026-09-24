import React from 'react'
import { createRoot } from 'react-dom/client'

import 'semantic-ui-css/semantic.min.css'

import { MultipleTabsSelector } from './app/multiple-tabs-selector'
import { AppLoader } from './app/app-loader'

import { safeNumberInt } from '@/services/number'

type ExtApi = typeof chrome

const ext = (
	(globalThis as unknown as { browser?: ExtApi }).browser
	?? (globalThis as unknown as { chrome?: ExtApi }).chrome
) as ExtApi | undefined

const devtools = (
	(globalThis as unknown as { browser?: { devtools?: typeof chrome.devtools } }).browser?.devtools
	?? (globalThis as unknown as { chrome?: { devtools?: typeof chrome.devtools } }).chrome?.devtools
) as typeof chrome.devtools | undefined

const LS_KEY = 'mockman.selectedTabId'

const runtimeSendMessage = <T, >(message: unknown): Promise<T> => {
	if (!ext?.runtime?.sendMessage) return Promise.reject(new Error('runtime.sendMessage is not available'))
	const fn = ext.runtime.sendMessage as unknown as ((...args: unknown[]) => unknown)
	if (ext.runtime.sendMessage.length >= 2) {
		return new Promise((resolve) => fn(message, resolve))
	}

	return Promise.resolve(fn(message) as T)
}

const queryTabs = async (queryInfo: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]> => {
	if (ext?.tabs?.query) {
		try {
			const fn = ext.tabs.query as unknown as ((...args: unknown[]) => unknown)

			if (ext.tabs.query.length >= 2) {
				return await new Promise((resolve) => fn(queryInfo, resolve))
			}

			return (await Promise.resolve(fn(queryInfo))) as unknown as chrome.tabs.Tab[]
		} catch {
			void 0
		}
	}

	try {
		const res = await runtimeSendMessage<{ tabs?: chrome.tabs.Tab[] }>({ type: 'PANEL_QUERY_TABS', query: queryInfo })
		return Array.isArray(res?.tabs) ? res.tabs : []
	} catch {
		return []
	}
}

const getTab = (tabId: number): Promise<chrome.tabs.Tab> => {
	if (ext?.tabs?.get) {
		try {
			const fn = ext.tabs.get as unknown as ((...args: unknown[]) => unknown)

			if (ext.tabs.get.length >= 2) {
				return new Promise((resolve) => fn(tabId, resolve))
			}

			return Promise.resolve(fn(tabId) as unknown as chrome.tabs.Tab)
		} catch {
			void 0
		}
	}

	return runtimeSendMessage<{ tab?: chrome.tabs.Tab | null }>({ type: 'PANEL_GET_TAB', tabId })
		.then((res) => {
			if (res?.tab) return res.tab
			throw new Error('tab not found')
		})
}

const getInspectedPageUrl = async (): Promise<string | undefined> => {
	if (!devtools?.inspectedWindow?.eval) return undefined
	try {
		const [res, isException] = await new Promise<[unknown, boolean]>((resolve) => {
			devtools.inspectedWindow.eval('location.href', (r, ex) => resolve([r, Boolean(ex)]))
		})
		if (!isException && typeof res === 'string') return res
	} catch {
		void 0
	}
	return undefined
}

const selectBestTab = (tabs: chrome.tabs.Tab[], preferredUrl?: string): chrome.tabs.Tab | undefined => {
	if (tabs.length === 0) return undefined
	if (tabs.length === 1) return tabs[0]

	const httpTabs = tabs.filter((t) => t.url?.startsWith('http'))
	if (httpTabs.length === 1) return httpTabs[0]

	if (preferredUrl) {
		const matching = httpTabs.filter((t) => t.url === preferredUrl)
		if (matching.length === 1) return matching[0]
	}

	if (httpTabs.length > 0) return httpTabs[0]
	return tabs[0]
}

(async () => {
	const rootElement = document.getElementById('root')
	if (!rootElement) return

	const root = createRoot(rootElement)

	const renderError = (title: string, details?: unknown) => {
		const msg =
			typeof details === 'string'
				? details
				: details instanceof Error
					? `${details.name}: ${details.message}\n${details.stack ?? ''}`
					: details != null
						? String(details)
						: ''
		root.render(
			<div style={{ padding: 12, fontFamily: 'system-ui', color: '#b00020' }}>
				<div style={{ fontWeight: 700, marginBottom: 8 }}>{title}</div>
				{msg ? <pre style={{ whiteSpace: 'pre-wrap' }}>{msg}</pre> : null}
			</div>,
		)
	}

	root.render(<div style={{ padding: 12, fontFamily: 'system-ui' }}>Loading…</div>)

	try {
		let activeTab: chrome.tabs.Tab | undefined

		const inspectedTabId = devtools?.inspectedWindow?.tabId
		const inspectedUrl = await getInspectedPageUrl()

		const storedId = localStorage.getItem(LS_KEY)
		const parsedStoredId = storedId ? safeNumberInt(storedId) : undefined

		if (inspectedTabId) {
			try {
				activeTab = await getTab(inspectedTabId)
			} catch {
				void 0
			}
		}

		if (!activeTab && parsedStoredId != null) {
			try {
				activeTab = await getTab(parsedStoredId)
				if (activeTab?.id !== parsedStoredId) activeTab = undefined
			} catch {
				void 0
			}
		}

		if (!activeTab && inspectedTabId) {
			activeTab = {
				id: inspectedTabId,
				url: inspectedUrl ?? '',
				title: inspectedUrl ?? 'Inspected tab',
			} as unknown as chrome.tabs.Tab
		}

		if (!activeTab && inspectedUrl) {
			const allTabs = await queryTabs({} as chrome.tabs.QueryInfo)
			const matching = allTabs.filter((t) => t.url === inspectedUrl)
			activeTab = selectBestTab(matching, inspectedUrl)
		}

		if (!activeTab) {
			const focused =
				(await queryTabs({ active: true, lastFocusedWindow: true } as chrome.tabs.QueryInfo))
				|| (await queryTabs({ active: true, currentWindow: true }))
			activeTab = selectBestTab(focused, inspectedUrl)
		}

		if (!activeTab) {
			const allActive = await queryTabs({ active: true } as chrome.tabs.QueryInfo)
			activeTab = selectBestTab(allActive, inspectedUrl)
		}

		if (activeTab) {
			if (activeTab.id != null) localStorage.setItem(LS_KEY, String(activeTab.id))
			root.render(<AppLoader tab={activeTab} />)
		} else {
			const allTabs = await queryTabs({} as chrome.tabs.QueryInfo)
			const httpTabs = allTabs.filter((t) => t.url?.startsWith('http'))
			root.render(<MultipleTabsSelector tabs={httpTabs.length > 0 ? httpTabs : allTabs} />)
		}
	} catch (e) {
		renderError('failed to start', e)
	}
})()
