import type { IDynamicURLMap, IMockResponse, IStore, IURLMap } from '@/interface/mock'
import { isCollectionActive } from '@/panel/app/service/collection-tree'
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
	const dynMatch = (candidates as IDynamicRoute[]).find((route) => route.method === method && !!route.match(sanitized))
	return dynMatch ? [dynMatch.getterKey] : []
}

export function getActiveMockWithPath(
	paths: string[],
	store: IStore,
): { mock: IMockResponse | null; path: string | null } {
	for (const p of paths) {
		const m = getByPath(store, p, null) as IMockResponse | null
		if (!m || !m.active) continue
		if (!store.collectionTree || isCollectionActive(store.collectionTree, m.collectionId ?? null)) {
			return { mock: m, path: p }
		}
	}
	return { mock: null, path: null }
}

