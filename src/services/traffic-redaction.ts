import { credentialValue, redactJson, sensitiveField } from './redaction'

import type { Headers, ILog } from '@/interface/mock'

const bytes = (value: string) => new TextEncoder().encode(value).length
/** Bounded, explicit DTO: capture storage only receives the filtered result. */
export function sanitizeTraffic(log: ILog) {
	if (!log.request || typeof log.request.url !== 'string' || log.request.url.length > 8192)
		return null
	let url: URL
	try {
		url = new URL(log.request.url)
	} catch {
		return null
	}
	if (!['http:', 'https:'].includes(url.protocol)) return null
	// The page logger stores query separately from its display URL.
	if (
		!url.search &&
		typeof log.request.queryParams === 'string' &&
		log.request.queryParams.length <= 8192
	) {
		try {
			const parsed: unknown = JSON.parse(log.request.queryParams)
			if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
				for (const [key, raw] of Object.entries(parsed).slice(0, 50)) {
					for (const value of Array.isArray(raw) ? raw.slice(0, 20) : [raw])
						if (typeof value === 'string') url.searchParams.append(key, value)
				}
			}
		} catch {
			/* Unknown query representation is not exposed. */
		}
	}
	const hidden: string[] = []
	const query = Object.fromEntries(
		[...new Set(url.searchParams.keys())].slice(0, 50).map((key) => [
			key,
			url.searchParams
				.getAll(key)
				.slice(0, 20)
				.map((value) => {
					if (sensitiveField.test(key) || credentialValue.test(value)) {
						hidden.push(`/request/query/${key}`)
						return '[REDACTED]'
					}
					return value.slice(0, 4096)
				}),
		]),
	)
	const mask = (path: string) => {
		if (hidden.length < 100) hidden.push(path)
		else if (hidden.length === 100) hidden.push('/*/additional-redacted-fields')
		return '[REDACTED]'
	}
	const headers = (input: Headers | undefined, path: string) =>
		(Array.isArray(input) ? input : []).slice(0, 100).map((header, index) => ({
			name: String(header.name).slice(0, 256),
			value:
				/^(content-type|accept|cache-control|content-length)$/i.test(header.name) &&
				!credentialValue.test(String(header.value))
					? String(header.value).slice(0, 8192)
					: mask(`${path}/${index}/value`),
		}))
	const body = (input: string | undefined, path: string) => {
		if (typeof input !== 'string') return { body: null, bodyState: 'unavailable' }
		if (bytes(input) > 65536) {
			if (bytes(input) > 1024 * 1024) return { body: null, bodyState: 'too-large' }
			try {
				const cleaned = redactJson(JSON.parse(input), path, mask, 32)
				let remaining = 1000
				const sample = (value: unknown, depth = 0): unknown => {
					if (--remaining < 0 || depth > 12) return null
					if (Array.isArray(value))
						return value.slice(0, 3).map((child) => sample(child, depth + 1))
					if (value && typeof value === 'object')
						return Object.fromEntries(
							Object.entries(value)
								.slice(0, 50)
								.map(([key, child]) => [key, sample(child, depth + 1)]),
						)
					return typeof value === 'string' ? value.slice(0, 512) : value
				}
				const result = JSON.stringify(sample(cleaned))
				return bytes(result) <= 65536
					? { body: result, bodyState: 'sampled' }
					: { body: null, bodyState: 'too-large' }
			} catch {
				return { body: null, bodyState: 'too-large' }
			}
		}
		if (!input) return { body: '', bodyState: 'available' }
		try {
			return {
				body: JSON.stringify(redactJson(JSON.parse(input), path, mask, 32)),
				bodyState: 'available',
			}
		} catch {
			return { body: mask(path), bodyState: 'redacted' }
		}
	}
	if (url.search || url.hash || url.username || url.password) hidden.push('/request/url')
	return {
		request: {
			method: String(log.request.method).slice(0, 16),
			url: `${url.origin}${url.pathname}`,
			query,
			headers: headers(log.request.headers, '/request/headers'),
			...body(log.request.body, '/request/body'),
		},
		response: log.response
			? {
					status: Number.isInteger(log.response.status) ? log.response.status : 0,
					headers: headers(log.response.headers, '/response/headers'),
					...body(
						log.response.binary || log.response.tooLarge ? undefined : log.response.response,
						'/response/body',
					),
					binary: log.response.binary === true,
					tooLarge: log.response.tooLarge === true,
			  }
			: null,
		isMocked: log.isMocked === true,
		redacted: hidden.length > 0,
		redactedFields: hidden,
	}
}
