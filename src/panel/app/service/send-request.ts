import type { ISendRequest, ISendResult } from '@/interface/bridge'
import type { ILog, IMockResponseRaw } from '@/interface/mock'
import { resolveTemplate } from '@/services/env'
import { canPatchMethod, requestPatchProblem } from '@/services/request-patch'
import { isJsonValid } from '@/services/json'
import { messageTopFrame } from '@/panel/app/service/tab-message'
import { normalizeUrl } from '@/services/url'

/** The browser sets these itself; a copy from the log would be dropped or rejected. */
const BROWSER_HEADERS = new Set([
	'accept-encoding',
	'connection',
	'content-length',
	'cookie',
	'host',
	'origin',
	'referer',
	'user-agent',
])

export function sendableHeaders(headers: Array<{ name: string; value: string }>): Array<{ name: string; value: string }> {
	return headers.filter(({ name }) => {
		const lower = String(name || '').toLowerCase()
		return lower && !BROWSER_HEADERS.has(lower) && !lower.startsWith('sec-') && !lower.startsWith(':')
	})
}

function urlWithQuery(url: string, queryParams?: string): string {
	if (!queryParams) return url
	try {
		const parsed = JSON.parse(queryParams) as Record<string, string | string[]>
		const search = new URLSearchParams()
		for (const [key, value] of Object.entries(parsed)) {
			for (const item of Array.isArray(value) ? value : [value]) search.append(key, String(item))
		}
		const query = search.toString()
		return query ? `${url}?${query}` : url
	} catch {
		return url
	}
}

/** A logged request, ready to send again: the body that went out, the headers the page set. */
export function requestFromLog(log: ILog): ISendRequest {
	return {
		method: String(log.request?.method ?? 'GET').toUpperCase(),
		url: urlWithQuery(String(log.request?.url ?? ''), log.request?.queryParams),
		headers: sendableHeaders(log.request?.headers ?? []),
		body: log.request?.body ?? '',
		withCredentials: true,
	}
}

/** Where the headers of a request built from a mock came from. */
export type HeadersSource = 'endpoint' | 'site' | 'none'

const originOf = (url: string): string | null => {
	try {
		return new URL(url).origin
	} catch {
		return null
	}
}

const hasHeader = (headers: Array<{ name: string; value: string }>, name: string): boolean =>
	headers.some((header) => header.name.toLowerCase() === name)

/**
 * A request-body rule, ready to send: its body to its URL. A rule keeps no headers, and the page
 * adds its token to every call, so they come from the latest logged call to the same endpoint,
 * or else to the same site (without its Content-Type, which belonged to that call's body). A JSON
 * body with no Content-Type gets application/json: a bare string goes out as text/plain.
 */
export function requestFromMock(
	mock: IMockResponseRaw,
	logs: ILog[],
	envVars: Record<string, string>,
): { request: ISendRequest; headersFrom: HeadersSource } {
	const method = String(mock.method ?? 'POST').toUpperCase()
	const url = resolveTemplate(String(mock.url ?? ''), envVars)
	const target = normalizeUrl(url)
	const origin = originOf(url)
	const body = mock.requestPatch?.body ?? ''

	const sameEndpoint = logs.find((log) =>
		String(log.request?.method ?? '').toUpperCase() === method
		&& normalizeUrl(String(log.request?.url ?? '')) === target)
	const sameSite = sameEndpoint || !origin
		? undefined
		: logs.find((log) => !log.sentByMockman && originOf(String(log.request?.url ?? '')) === origin)

	const headers = sameEndpoint
		? sendableHeaders(sameEndpoint.request?.headers ?? [])
		: sendableHeaders(sameSite?.request?.headers ?? []).filter(({ name }) => name.toLowerCase() !== 'content-type')
	if (canPatchMethod(method) && body.trim() && isJsonValid(body) && !hasHeader(headers, 'content-type')) {
		headers.push({ name: 'Content-Type', value: 'application/json' })
	}

	return {
		request: { method, url, headers, body, withCredentials: true },
		headersFrom: sameEndpoint ? 'endpoint' : sameSite ? 'site' : 'none',
	}
}

/** Asks the top frame of the tab to send the request; the answer never throws. */
export async function sendRequestToTab(tabId: number, request: ISendRequest): Promise<ISendResult> {
	const answer = await messageTopFrame<ISendResult>(tabId, { type: 'MOCKMAN_SEND_REQUEST', request })
	if (!answer.ok) return { ok: false, reason: 'unavailable', error: answer.error }
	const result = answer.value
	return result && typeof result === 'object' && 'ok' in result
		? result
		: { ok: false, reason: 'unavailable', error: 'No answer from the page' }
}

/**
 * Why the body cannot be sent, the same check as the request body tab: broken JSON or over the
 * limit. A body declared as something else (a form, plain text) is not held to JSON.
 */
export function sendBodyProblem(request: Pick<ISendRequest, 'method' | 'headers' | 'body'>): 'invalid_json' | 'too_large' | null {
	if (!canPatchMethod(request.method)) return null
	const contentType = request.headers.find(({ name }) => name.toLowerCase() === 'content-type')?.value ?? ''
	const declaredJson = !contentType.trim() || /json/i.test(contentType)
	const problem = requestPatchProblem({ mode: 'replace', body: request.body ?? '' })
	if (problem === 'too_large') return problem
	return declaredJson && problem === 'invalid_json' ? problem : null
}
