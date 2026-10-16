import type { ISendRequest, ISendResult } from '@/interface/bridge'
import type { ILog } from '@/interface/mock'

/** Repeated keys collapse into an array, as in the logs of the page's own requests. */
function queryToJson(search: string): string | undefined {
	const params = new URLSearchParams(search)
	const out: Record<string, string | string[]> = {}
	for (const [key, value] of params) {
		const existing = out[key]
		if (existing === undefined) out[key] = value
		else if (Array.isArray(existing)) existing.push(value)
		else out[key] = [existing, value]
	}
	return Object.keys(out).length > 0 ? JSON.stringify(out) : undefined
}

/** The Logs entry of a request the panel sent through the page. */
export function buildSentLog(request: ISendRequest, result: Extract<ISendResult, { ok: true }>): ILog {
	const [url, search = ''] = String(request.url).split('?')
	return {
		id: `sent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		request: {
			url,
			queryParams: queryToJson(search),
			method: String(request.method || 'GET').toUpperCase() as never,
			headers: request.headers,
			body: request.body ?? '',
		},
		response: {
			status: result.status,
			response: result.body,
			headers: result.headers,
			...(result.tooLarge ? { tooLarge: true, size: result.size } : {}),
			...(result.binary ? { binary: true, size: result.size } : {}),
		},
		isMocked: false,
		sentByMockman: true,
		time: Date.now(),
	}
}
