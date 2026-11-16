import { match as getMatcher } from 'path-to-regexp'

import { getActiveEnvVars, resolveTemplate } from './env'
import { defaultLibrary, normalizeLibrary } from './library-normalize'
import { normalizeUrl } from './url'

import type { IDynamicURLMap, IMockResponse, IStore, IURLMap } from '@/interface/mock'

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

const getNetworkMethodMap = (): Record<Method, string[]> => ({
	GET: [],
	POST: [],
	PATCH: [],
	PUT: [],
	DELETE: [],
})

export const STORE_NAME = 'mockman.extension.main.db'

export const getDefaultStore = defaultLibrary

export const getStore = (
	name: string = STORE_NAME,
): Promise<{
	store: IStore
	urlMap: IURLMap
	dynamicUrlMap: IDynamicURLMap
}> =>
	new Promise((resolve) => {
		chrome.storage.local.get([name], (res) => {
			const raw = res[name] ?? {}
			const normalizedStore = normalizeLibrary(raw)
			// Receipts are background bookkeeping, not UI state or export data.
			delete (normalizedStore as IStore & { commandState?: unknown }).commandState
			const { urlMap, dynamicUrlMap } = getURLMapWithStore(normalizedStore)
			resolve({ store: normalizedStore, urlMap, dynamicUrlMap })
		})
	})

export const getURLMapWithStore = (
	store: IStore,
): { urlMap: IURLMap; dynamicUrlMap: IDynamicURLMap; store: IStore } => {
	const urlMap: IURLMap = {}
	const dynamicUrlMap: IDynamicURLMap = {}
	const vars = getActiveEnvVars(store)

	store.mocks.forEach((mock, idx) => {
		const path = `mocks[${idx}]`
		const effectiveUrl = normalizeUrl(resolveTemplate(mock.url, vars))
		if (mock.dynamic) {
			addDynamic(mock, path, effectiveUrl)
			return
		}

		urlMap[effectiveUrl] ??= getNetworkMethodMap()
		urlMap[effectiveUrl][mock.method as Method].push(path)
	})

	return { urlMap, dynamicUrlMap, store }

	function addDynamic(mock: IMockResponse, path: string, effectiveUrl: string): void {
		const replaced = effectiveUrl.replace('://', '-')
		const depth = replaced.split('/').length

		const matcher: IDynamicURLMap[number][0] = {
			getterKey: path,
			method: mock.method,
			url: replaced,
			match: getMatcher(replaced, { decode: decodeURIComponent }),
		}

		if (dynamicUrlMap[depth]) {
			dynamicUrlMap[depth].push(matcher)
		} else {
			dynamicUrlMap[depth] = [matcher]
		}
	}
}
