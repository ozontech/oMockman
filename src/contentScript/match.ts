import { matchesConditions } from '@/services/mock-conditions'
import type { IDynamicURLMap, ILog, IMockResponse, IStore, IURLMap } from '@/interface/mock'
import { isCollectionActive } from '@/services/collection-tree'
import { normalizeUrl } from '@/services/url'
import { getByPath } from '@/services/helper'

export interface IDynamicRoute {
	method: string
	match: (s: string) => boolean | { path: string; params: Record<string, string> }
	getterKey: string
	url: string
}

export function getMockPaths(
	url: string,
	method: string,
	maps: { urlMap: IURLMap; dynamicUrlMap: IDynamicURLMap },
): string[] {
	const normalized = normalizeUrl(url)
	const staticHit = maps.urlMap[normalized]?.[method]
	if (staticHit) return staticHit

	const sanitized = normalized.replace(/:\/\//, '-')
	const segCount = sanitized.split('/').length
	const candidates = maps.dynamicUrlMap[segCount] ?? []
	return (candidates as IDynamicRoute[]).filter((route) => route.method === method && !!route.match(sanitized)).map(route => route.getterKey)
}

export function getActiveMockWithPath(
	paths: string[],
	store: IStore,
	request?: { url: string; body?: string },
): { mock: IMockResponse | null; path: string | null } {
	const ordered = [...paths].sort((a, b) => ((getByPath(store, b, null) as IMockResponse | null)?.priority ?? 0) - ((getByPath(store, a, null) as IMockResponse | null)?.priority ?? 0))
	for (const p of ordered) {
		const m = getByPath(store, p, null) as IMockResponse | null
		if (!m || !m.active || (m.when && (!request || !matchesConditions(m, store, request.url, request.body)))) continue
		if (!store.collectionTree || isCollectionActive(store.collectionTree, m.collectionId ?? null)) {
			return { mock: m, path: p }
		}
	}
	return { mock: null, path: null }
}

/**
 * Fills in how the log should show the request. The page world says whether a mock was served or
 * the request patched; a matching mock alone proves nothing, since the request may have left
 * before the bridge was up or on a site that was not allowed. The mock path is looked up only to
 * link the log to it.
 */
export function markMockedInLog(
	log: ILog,
	state: { store: IStore; urlMap: IURLMap; dynamicUrlMap: IDynamicURLMap } | undefined,
): void {
	if (!state || !log.request?.url || !log.request?.method) return
	if (log.isMocked !== true) log.isMocked = false
	if (!log.isMocked && log.isPatched !== true) return
	const paths = getMockPaths(log.request.url, log.request.method, {
		urlMap: state.urlMap,
		dynamicUrlMap: state.dynamicUrlMap,
	})
	const { path } = getActiveMockWithPath(paths, state.store, { url: log.request.url, body: log.request.body })
	log.mockPath = path ?? undefined
}
