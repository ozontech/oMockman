import { useCallback, useEffect, useState } from 'react'

import { useGlobalStore } from '@/panel/app/store'

/**
 * Origin of the inspected page, as the browser reports it.
 *
 * Deliberately not `meta.tab.url`: that can fall back to `inspectedWindow.eval`, which the
 * page controls. Permissions are granted against this value.
 */
export function usePageOrigin(): { origin: string | null; loading: boolean } {
	const tabId = useGlobalStore((s) => s.meta.tab?.id)
	const [origin, setOrigin] = useState<string | null>(null)
	const [loading, setLoading] = useState(true)
	const [nonce, setNonce] = useState(0)

	const refresh = useCallback(() => setNonce((value) => value + 1), [])

	useEffect(() => {
		let cancelled = false

		if (typeof tabId !== 'number') {
			setOrigin(null)
			setLoading(false)
			return () => {
				cancelled = true
			}
		}

		setLoading(true)
		try {
			chrome.runtime.sendMessage({ type: 'PANEL_GET_ORIGIN', tabId }, (response?: { origin?: string | null }) => {
				if (cancelled) return
				void chrome.runtime?.lastError
				setOrigin(response?.origin ?? null)
				setLoading(false)
			})
		} catch {
			if (!cancelled) {
				setOrigin(null)
				setLoading(false)
			}
		}

		return () => {
			cancelled = true
		}
	}, [tabId, nonce])

	// Navigating within one tab keeps `tabId`, so the panel would otherwise show a stale origin.
	useEffect(() => {
		if (typeof tabId !== 'number') return undefined

		const onUpdated = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo): void => {
			if (updatedTabId !== tabId) return
			// `url` arrives only when the address changes; a plain reload shows up as `status`.
			if (!changeInfo.url && changeInfo.status !== 'loading') return
			refresh()
		}

		try {
			chrome.tabs?.onUpdated?.addListener(onUpdated)
		} catch {
			return undefined
		}

		return () => {
			try {
				chrome.tabs?.onUpdated?.removeListener(onUpdated)
			} catch {
				void 0
			}
		}
	}, [tabId, refresh])

	return { origin, loading }
}
