import { makeHeadersKey } from '@/services/url'

export type HeaderItem = { name: string; value: string }

const TTL_MS = 10_000

// Credential headers are never cached.
const DENIED_HEADERS = new Set([
	'authorization',
	'proxy-authorization',
	'cookie',
	'cookie2',
	'set-cookie',
	'set-cookie2',
	'www-authenticate',
	'proxy-authenticate',
	'x-api-key',
	'x-auth-token',
	'x-csrf-token',
	'x-xsrf-token',
	'x-session-token',
	'x-amz-security-token',
])

/** Past this many entries the oldest go first, whatever their age. */
const MAX_ENTRIES = 500
/** A response with more headers keeps the first ones; a longer value is cut. */
const MAX_HEADERS_PER_ENTRY = 100
const MAX_HEADER_VALUE_CHARS = 8 * 1024

type Entry = { headers: HeaderItem[]; expiresAt: number }

// Insertion order is expiry order: an entry is re-inserted whenever it is set again.
const store = new Map<string, Entry>()

const entryKey = (tabId: number, method: string, url: string): string => `${tabId} ${makeHeadersKey(method, url)}`

function dropExpired(now: number): void {
	for (const [key, entry] of store) {
		if (entry.expiresAt > now) return
		store.delete(key)
	}
}

export function isDeniedHeader(name: string): boolean {
	return DENIED_HEADERS.has(String(name || '').toLowerCase())
}

/** Keyed by tab as well: the same URL in two tabs must not swap headers. */
export function setHeaders(
	tabId: number,
	method: string,
	url: string,
	headers: chrome.webRequest.HttpHeader[] | undefined,
): void {
	const now = Date.now()
	dropExpired(now)
	const key = entryKey(tabId, method, url)
	const norm = (headers || [])
		.map((h) => ({ name: (h.name || '').toLowerCase(), value: (h.value || '').slice(0, MAX_HEADER_VALUE_CHARS) }))
		.filter((h) => !isDeniedHeader(h.name))
		.slice(0, MAX_HEADERS_PER_ENTRY)
	store.delete(key)
	store.set(key, { headers: norm, expiresAt: now + TTL_MS })
	while (store.size > MAX_ENTRIES) {
		const oldest = store.keys().next().value
		if (oldest === undefined) break
		store.delete(oldest)
	}
}

export function getHeaders(tabId: number, method: string, url: string): HeaderItem[] {
	const key = entryKey(tabId, method, url)
	const entry = store.get(key)
	if (!entry) return []
	if (entry.expiresAt <= Date.now()) {
		store.delete(key)
		return []
	}
	return entry.headers
}

/** Without a tab, empties the whole cache. */
export function clearHeaders(tabId?: number): void {
	if (tabId === undefined) {
		store.clear()
		return
	}
	const prefix = `${tabId} `
	for (const key of store.keys()) {
		if (key.startsWith(prefix)) store.delete(key)
	}
}
