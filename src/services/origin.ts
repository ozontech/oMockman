/**
 * Site permissions: the page origins a user allowed Mockman to work on, granted per whole
 * origin rather than per mock.
 *
 * Without this, matching goes by `METHOD + url` alone, so any page could ask for an internal
 * URL and read the mock body: the wrapper answers before the request leaves the browser, so
 * CORS never applies. The origin always comes from the browser, never from the page.
 */
import type { IStore } from '@/interface/mock'

export type SitePermissions = NonNullable<IStore['sitePermissions']>
export type SitePermission = SitePermissions[string]

/** Schemes a page can run under and that we are willing to mock. */
const MOCKABLE_PROTOCOLS = new Set(['http:', 'https:'])

/**
 * `scheme://host[:port]`, with the default port dropped. Returns null for anything that is
 * not a mockable page: about:, chrome://, moz-extension://, file:, malformed input.
 */
export function canonicalOrigin(rawUrl: string | null | undefined): string | null {
	const value = String(rawUrl ?? '').trim()
	if (!value) return null

	let url: URL
	try {
		url = new URL(value)
	} catch {
		return null
	}

	if (!MOCKABLE_PROTOCOLS.has(url.protocol.toLowerCase())) return null
	if (!url.hostname) return null

	// URL already drops a default port, so `origin` is canonical apart from its case.
	return url.origin.toLowerCase()
}

export function readSitePermission(store: IStore, origin: string | null): SitePermission | null {
	if (!origin) return null
	const entry = store.sitePermissions?.[origin]
	return entry ?? null
}

/**
 * True when Mockman may serve mocks on this origin. An explicit grant wins; `autoGrantSites`
 * lets a user who does not want to confirm every site opt out of the prompt entirely.
 */
export function hasAnyPermission(store: IStore, origin: string | null): boolean {
	if (!canonicalOrigin(origin)) return false
	if (readSitePermission(store, origin)) return true
	return store.autoGrantSites === true
}

/** Drops malformed origins so a hand-edited import cannot smuggle in a bogus key. */
export function normalizeSitePermissions(store: IStore): IStore {
	const raw = store.sitePermissions
	if (!raw || typeof raw !== 'object') return { ...store, sitePermissions: {} }

	const next: SitePermissions = {}
	for (const [origin, entry] of Object.entries(raw)) {
		const key = canonicalOrigin(origin)
		if (!key || !entry || typeof entry !== 'object') continue
		next[key] = { grantedOn: typeof entry.grantedOn === 'number' ? entry.grantedOn : Date.now() }
	}

	return { ...store, sitePermissions: next }
}

export function grantSitePermission(store: IStore, origin: string): IStore {
	const key = canonicalOrigin(origin)
	if (!key) return store

	return {
		...store,
		sitePermissions: { ...store.sitePermissions, [key]: { grantedOn: Date.now() } },
	}
}

export function revokeSitePermission(store: IStore, origin: string): IStore {
	const key = canonicalOrigin(origin)
	if (!key || !store.sitePermissions?.[key]) return store

	const next = { ...store.sitePermissions }
	delete next[key]
	return { ...store, sitePermissions: next }
}
