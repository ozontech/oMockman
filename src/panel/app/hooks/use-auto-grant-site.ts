import { useEffect, useRef } from 'react'

import { usePageOrigin } from './use-page-origin'

import { persistStoreChange } from '@/panel/app/service'
import { useChromeStore, useGlobalStore } from '@/panel/app/store'
import { grantSitePermission, readSitePermission } from '@/services/origin'

/**
 * Records every site visited while auto-grant is on, so Site access lists what was allowed.
 *
 * Lives in the app, not in the banner: with auto-grant on the banner never renders, so an
 * effect inside it would stop recording exactly when it is needed.
 */
export function useAutoGrantSite(): void {
	const tabId = useGlobalStore((g) => g.meta.tab?.id)
	const store = useChromeStore((c) => c.store)
	const setStoreProperties = useChromeStore((c) => c.setStoreProperties)
	const { origin } = usePageOrigin()

	const writing = useRef<string | null>(null)

	useEffect(() => {
		if (!origin || store?.autoGrantSites !== true) return
		if (readSitePermission(store, origin) || writing.current === origin) return
		const current = useChromeStore.getState().store
		if (current?.autoGrantSites !== true || readSitePermission(current, origin)) return

		writing.current = origin
		void persistStoreChange({
			updatedStore: grantSitePermission(current, origin),
			setStoreProperties,
			tabId,
			applyMocksNow: false,
		})
			.catch(() => void 0)
			.finally(() => {
				if (writing.current === origin) writing.current = null
			})
	}, [origin, store, setStoreProperties, tabId])
}
