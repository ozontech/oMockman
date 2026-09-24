import { getStore } from '@/panel/app/service/store-actions'
import type { IStore, IURLMap, IDynamicURLMap } from '@/interface/mock'

export class ContentScriptState {
	store: IStore = {} as IStore
	urlMap: IURLMap = {}
	dynamicUrlMap: IDynamicURLMap = {}
	/** From the background (sender.tab.url), never from location: permissions rely on it. */
	origin: string | null = null

	async refresh(): Promise<void> {
		const { store, urlMap, dynamicUrlMap } = await getStore()
		this.store = store
		this.urlMap = urlMap
		this.dynamicUrlMap = dynamicUrlMap
	}

	async refreshOrigin(): Promise<void> {
		this.origin = await requestOwnOrigin()
	}
}

/** Asks the background for this tab's origin; it answers from sender.tab, not from us. */
function requestOwnOrigin(): Promise<string | null> {
	return new Promise((resolve) => {
		try {
			chrome.runtime.sendMessage({ type: 'PANEL_GET_ORIGIN' }, (response?: { origin?: string | null }) => {
				if (chrome.runtime?.lastError) {
					resolve(null)
					return
				}
				resolve(response?.origin ?? null)
			})
		} catch {
			resolve(null)
		}
	})
}
