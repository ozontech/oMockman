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

const store = new Map<string, HeaderItem[]>()

export function isDeniedHeader(name: string): boolean {
	return DENIED_HEADERS.has(String(name || '').toLowerCase())
}

export function setHeaders(method: string, url: string, headers: chrome.webRequest.HttpHeader[] | undefined): void {
	const key = makeHeadersKey(method, url)
	const norm = (headers || [])
		.map((h) => ({ name: (h.name || '').toLowerCase(), value: h.value || '' }))
		.filter((h) => !isDeniedHeader(h.name))
	store.set(key, norm)
	setTimeout(() => store.delete(key), TTL_MS)
}

export function getHeaders(method: string, url: string): HeaderItem[] {
	return store.get(makeHeadersKey(method, url)) || []
}

export function clearHeaders(): void {
	store.clear()
}
