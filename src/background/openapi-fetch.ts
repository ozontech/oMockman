import { safeNumberFloat } from '@/services/number'
import { checkOutboundUrl, readTextCapped } from '@/services/net-guard'
import type { IOpenApiFetchResult, RecordLike } from '@/interface/openapi'

const FETCH_TIMEOUT_MS = 15_000
const MAX_SPEC_BYTES = 10 * 1024 * 1024
const MAX_REDIRECTS = 2
// Keeps one URL from turning into a path scan.
const MAX_CANDIDATES = 6

export interface SpecFetchOptions {
	allowLocalTargets?: boolean
}

function guard(url: string, options: SpecFetchOptions): { ok: true; url: URL } | { ok: false; error: string } {
	const allowLocal = options.allowLocalTargets === true
	const checked = checkOutboundUrl(url, {
		// Plain http is fine for a schema; the local network needs an opt-in.
		allowInsecureHttp: true,
		allowLoopback: allowLocal,
		allowPrivateHosts: allowLocal,
	})
	if (checked.ok) return checked

	switch (checked.reason) {
		case 'invalid_url':
			return { ok: false, error: 'OpenAPI URL must be an absolute URL.' }
		case 'unsupported_protocol':
			return { ok: false, error: 'Only http/https OpenAPI URLs are supported.' }
		case 'private_host':
			return {
				ok: false,
				error: 'This URL points to a local or private address. Enable local OpenAPI sources in Settings to use it.',
			}
		default:
			return { ok: false, error: 'OpenAPI URL is not allowed.' }
	}
}

export function isRecord(value: unknown): value is RecordLike {
	return typeof value === 'object' && value !== null
}

function parseLooseJson(input: string): unknown {
	return JSON.parse(input)
}

export function parseSimpleYaml(input: string): unknown {
	const text = String(input ?? '').trim()
	if (!text) return {}

	const lines = text
		.replace(/\r\n/g, '\n')
		.split('\n')
		.filter((line) => !/^\s*#/.test(line))

	const root: RecordLike = {}
	const stack: Array<{ indent: number; node: RecordLike }> = [{ indent: -1, node: root }]

	for (const rawLine of lines) {
		if (!rawLine.trim()) continue
		const indent = (rawLine.match(/^\s*/) || [''])[0].length
		const line = rawLine.trim()
		const idx = line.indexOf(':')
		if (idx === -1) continue
		const key = line.slice(0, idx).trim().replace(/^['"]|['"]$/g, '')
		const rest = line.slice(idx + 1).trim()

		while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
			stack.pop()
		}
		const parent = stack[stack.length - 1].node

		if (!rest) {
			const next: RecordLike = {}
			parent[key] = next
			stack.push({ indent, node: next })
			continue
		}

		if (/^(true|false)$/i.test(rest)) {
			parent[key] = /^true$/i.test(rest)
			continue
		}
		if (/^-?\d+(\.\d+)?$/.test(rest)) {
			parent[key] = safeNumberFloat(rest) ?? rest
			continue
		}
		if (rest.startsWith('[') && rest.endsWith(']')) {
			const values = rest
				.slice(1, -1)
				.split(',')
				.map((item) => item.trim())
				.filter(Boolean)
				.map((item) => item.replace(/^['"]|['"]$/g, ''))
			parent[key] = values
			continue
		}
		parent[key] = rest.replace(/^['"]|['"]$/g, '')
	}

	return root
}

function tryParseSpecText(input: string): unknown {
	try {
		return parseLooseJson(input)
	} catch {
		return parseSimpleYaml(input)
	}
}

async function fetchText(url: string, options: SpecFetchOptions): Promise<string> {
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
	try {
		let target = url
		for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
			const checked = guard(target, options)
			if (!checked.ok) throw new Error(checked.error)

			const response = await fetch(checked.url.toString(), {
				method: 'GET',
				cache: 'no-cache',
				signal: controller.signal,
				// Manual, so a redirect to 127.0.0.1 is checked again.
				redirect: 'manual',
				credentials: 'omit',
				headers: {
					Accept: 'application/json, application/yaml, text/yaml, text/plain, */*',
				},
			})

			const location = response.headers.get('location')
			if (response.status >= 300 && response.status < 400 && location) {
				target = new URL(location, checked.url).toString()
				continue
			}
			// Browsers hide Location on a manual redirect (status 0), so the target cannot be
			// checked again and is not followed.
			if (response.type === 'opaqueredirect') {
				throw new Error('Redirects are not followed')
			}

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`)
			}

			return await readTextCapped(response, MAX_SPEC_BYTES)
		}
		throw new Error('Too many redirects')
	} finally {
		clearTimeout(timer)
	}
}

export function parseSpecCandidate(rawText: string): RecordLike | null {
	const parsed = tryParseSpecText(rawText)
	if (!isRecord(parsed)) return null
	if (!isRecord(parsed.paths)) return null
	if (typeof parsed.openapi !== 'string' && typeof parsed.swagger !== 'string' && !isRecord(parsed.info)) return null
	return parsed
}

export function safeAbsoluteUrl(baseUrl: string, candidate: string): string | null {
	const clean = String(candidate ?? '').trim().replace(/^['"]|['"]$/g, '')
	if (!clean) return null
	if (clean.startsWith('data:')) return null
	try {
		return new URL(clean, baseUrl).toString()
	} catch {
		return null
	}
}

export function extractSpecCandidatesFromSwaggerHtml(html: string, pageUrl: string): string[] {
	const out = new Set<string>()

	const add = (candidate: string | null) => {
		if (!candidate) return
		out.add(candidate)
	}

	const urlMatchRegexes = [
		/url\s*:\s*['"]([^'"]+)['"]/g,
		/swaggerUrl\s*[:=]\s*['"]([^'"]+)['"]/g,
		/openapiUrl\s*[:=]\s*['"]([^'"]+)['"]/g,
	]

	for (const regex of urlMatchRegexes) {
		let match = regex.exec(html)
		while (match) {
			add(safeAbsoluteUrl(pageUrl, match[1]))
			match = regex.exec(html)
		}
	}

	const urlsBlockRegex = /urls\s*:\s*\[([\s\S]*?)\]/g
	let urlsBlockMatch = urlsBlockRegex.exec(html)
	while (urlsBlockMatch) {
		const block = urlsBlockMatch[1]
		const itemRegex = /url\s*:\s*['"]([^'"]+)['"]/g
		let item = itemRegex.exec(block)
		while (item) {
			add(safeAbsoluteUrl(pageUrl, item[1]))
			item = itemRegex.exec(block)
		}
		urlsBlockMatch = urlsBlockRegex.exec(html)
	}

	const standardPaths = ['/swagger.json', '/openapi.json', '/v3/api-docs', '/swagger/v1/swagger.json']
	for (const path of standardPaths) {
		add(safeAbsoluteUrl(pageUrl, path))
	}

	return [...out]
}

export function getLikelySpecCandidates(url: string): string[] {
	const result = new Set<string>()
	const add = (candidate: string | null) => {
		if (candidate) result.add(candidate)
	}

	let parsed: URL
	try {
		parsed = new URL(url)
	} catch {
		return []
	}

	const path = parsed.pathname.toLowerCase()
	const looksLikeSpec = path.endsWith('.json') || path.endsWith('.yaml') || path.endsWith('.yml')
	if (looksLikeSpec) add(parsed.toString())

	const isSwaggerUi = /swagger|api-docs|openapi/.test(path) || path.endsWith('/')
	if (isSwaggerUi) {
		add(new URL('/swagger.json', parsed.origin).toString())
		add(new URL('/openapi.json', parsed.origin).toString())
		add(new URL('/v3/api-docs', parsed.origin).toString())
		add(new URL('/swagger/v1/swagger.json', parsed.origin).toString())
		if (!looksLikeSpec) add(parsed.toString())
	}

	add(parsed.toString())
	return [...result]
}

async function tryFetchSpec(
	url: string,
	options: SpecFetchOptions,
): Promise<{ ok: true; sourceUrl: string; spec: RecordLike } | null> {
	try {
		const text = await fetchText(url, options)
		const parsed = parseSpecCandidate(text)
		if (parsed) return { ok: true, sourceUrl: url, spec: parsed }

		const maybeHtml = text.toLowerCase().includes('<html') || text.toLowerCase().includes('swaggerui')
		if (!maybeHtml) return null

		const htmlCandidates = extractSpecCandidatesFromSwaggerHtml(text, url).slice(0, MAX_CANDIDATES)
		for (const candidate of htmlCandidates) {
			try {
				const nestedText = await fetchText(candidate, options)
				const nestedParsed = parseSpecCandidate(nestedText)
				if (nestedParsed) return { ok: true, sourceUrl: candidate, spec: nestedParsed }
			} catch {
				void 0
			}
		}
		return null
	} catch {
		return null
	}
}

export async function fetchOpenApiSpec(
	url: string,
	options: SpecFetchOptions = {},
): Promise<IOpenApiFetchResult> {
	const clean = String(url ?? '').trim()
	if (!clean) return { ok: false, error: 'OpenAPI URL is empty.' }

	const checked = guard(clean, options)
	if (!checked.ok) return { ok: false, error: checked.error }

	const candidates = getLikelySpecCandidates(checked.url.toString()).slice(0, MAX_CANDIDATES)
	for (const candidate of candidates) {
		const result = await tryFetchSpec(candidate, options)
		if (result?.ok) {
			return {
				ok: true,
				sourceUrl: result.sourceUrl,
				spec: result.spec,
			}
		}
	}

	return {
		ok: false,
		error:
			'Cannot load OpenAPI schema by this URL. Try a direct spec URL (e.g. /swagger.json or /openapi.json).',
	}
}
