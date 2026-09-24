/**
 * Shared helpers for the injected wrappers.
 */
export type HeadersMap = Record<string, string>
export type XhrEventHandler = (this: XMLHttpRequest, ev: Event) => unknown

export const BLOCKED_HEADERS = new Set<string>([
	'content-encoding',
	'transfer-encoding',
	'content-length',
])

export function buildHeadersMap(list?: Array<{ name?: string; value?: string }>): HeadersMap {
	return (list || []).reduce<HeadersMap>((acc, h) => {
		const name = String(h.name || '').trim()
		if (!name) return acc
		const key = name.toLowerCase()
		if (BLOCKED_HEADERS.has(key)) return acc
		acc[name] = String(h.value || '')
		return acc
	}, {})
}

export function scheduleComplete(delayMs: number, cb: () => void): void {
	if (delayMs > 0) setTimeout(cb, delayMs)
	else queueMicrotask(cb)
}

export function parseAllResponseHeaders(raw: string): Array<{ name: string; value: string }> {
	if (!raw || !raw.trim()) return []
	return raw
		.split('\r\n')
		.filter(Boolean)
		.map((line) => {
			const idx = line.indexOf(':')
			if (idx === -1) return { name: line, value: '' }
			return { name: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() }
		})
}

export function safeCall(
	handler: XhrEventHandler | null | undefined,
	thisArg: XMLHttpRequest,
	ev: Event,
): void {
	try {
		if (handler) handler.call(thisArg, ev)
	} catch {
		void 0
	}
}
