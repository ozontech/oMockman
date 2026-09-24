/**
 * Outbound URL checks. The background worker has host permissions everywhere and no
 * CORS, so a user-supplied URL could otherwise reach localhost or the private network.
 */

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '::', '0.0.0.0'])

const isIpv4 = (host: string): boolean => /^\d{1,3}(\.\d{1,3}){3}$/.test(host)

const ipv4Parts = (host: string): number[] => host.split('.').map((part) => Number(part))

/** URL writes ::ffff:127.0.0.1 as ::ffff:7f00:1; both mean the IPv4 address. */
function unmapIpv4(host: string): string {
	const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(host)
	if (dotted) return dotted[1]
	const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host)
	if (!hex) return host
	const high = parseInt(hex[1], 16)
	const low = parseInt(hex[2], 16)
	return [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.')
}

/** Lowercase, without IPv6 brackets or a trailing dot ("localhost." resolves like "localhost"). */
function normalizeHost(hostname: string): string {
	const host = String(hostname ?? '').toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
	return unmapIpv4(host)
}

export function isLoopbackHost(hostname: string): boolean {
	const host = normalizeHost(hostname)
	if (LOOPBACK_HOSTNAMES.has(host)) return true
	if (isIpv4(host)) return ipv4Parts(host)[0] === 127
	return false
}

export function isPrivateHost(hostname: string): boolean {
	const host = normalizeHost(hostname)
	if (isLoopbackHost(host)) return true
	if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost')) return true
	// A bare hostname with no dot is only resolvable inside a local network.
	if (!host.includes('.') && !host.includes(':')) return true

	if (isIpv4(host)) {
		const [a, b] = ipv4Parts(host)
		if (a === 10) return true
		if (a === 172 && b >= 16 && b <= 31) return true
		if (a === 192 && b === 168) return true
		if (a === 169 && b === 254) return true
		if (a === 100 && b >= 64 && b <= 127) return true
		if (a === 0 || a >= 224) return true
		return false
	}

	// IPv6 literals: unique local (fc00::/7) and link-local (fe80::/10).
	const stripped = host.replace(/^\[|\]$/g, '')
	if (/^f[cd][0-9a-f]{2}:/.test(stripped)) return true
	if (/^fe[89ab][0-9a-f]:/.test(stripped)) return true

	return false
}

export type UrlRejection =
	| 'invalid_url'
	| 'unsupported_protocol'
	| 'insecure_http'
	| 'private_host'

export interface UrlGuardOptions {
	allowInsecureHttp?: boolean
	allowLoopback?: boolean
	allowPrivateHosts?: boolean
}

export function checkOutboundUrl(
	rawUrl: string,
	options: UrlGuardOptions = {},
): { ok: true; url: URL } | { ok: false; reason: UrlRejection } {
	let url: URL
	try {
		url = new URL(String(rawUrl ?? '').trim())
	} catch {
		return { ok: false, reason: 'invalid_url' }
	}

	const protocol = url.protocol.toLowerCase()
	if (protocol !== 'https:' && protocol !== 'http:') {
		return { ok: false, reason: 'unsupported_protocol' }
	}

	if (protocol === 'http:' && !options.allowInsecureHttp) {
		return { ok: false, reason: 'insecure_http' }
	}

	if (isLoopbackHost(url.hostname)) {
		if (!options.allowLoopback && !options.allowPrivateHosts) {
			return { ok: false, reason: 'private_host' }
		}
		return { ok: true, url }
	}

	if (isPrivateHost(url.hostname) && !options.allowPrivateHosts) {
		return { ok: false, reason: 'private_host' }
	}

	return { ok: true, url }
}

export async function readTextCapped(response: Response, maxBytes: number): Promise<string> {
	const body = response.body
	if (!body || typeof body.getReader !== 'function') {
		const text = await response.text()
		if (text.length > maxBytes) throw new Error(`Response exceeds ${maxBytes} bytes`)
		return text
	}

	const reader = body.getReader()
	const decoder = new TextDecoder()
	let total = 0
	let out = ''

	for (;;) {
		const { done, value } = await reader.read()
		if (done) break
		total += value?.byteLength ?? 0
		if (total > maxBytes) {
			await reader.cancel().catch(() => void 0)
			throw new Error(`Response exceeds ${maxBytes} bytes`)
		}
		out += decoder.decode(value, { stream: true })
	}
	out += decoder.decode()
	return out
}
