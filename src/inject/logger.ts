import type { ILog, IRequestCore } from '@/interface/mock'
import type { IEventMessage } from '@/interface/message'
import { getHeaders } from '@/services/helper'
import { isReadableStream } from '@/inject'

/** Repeated keys collapse into an array, the way query-string used to report them. */
function parseQuery(query: string): Record<string, string | string[]> {
	const out: Record<string, string | string[]> = {}
	for (const [key, value] of new URLSearchParams(query)) {
		const existing = out[key]
		if (existing === undefined) out[key] = value
		else if (Array.isArray(existing)) existing.push(value)
		else out[key] = [existing, value]
	}
	return out
}

export function buildLog(
	request: IRequestCore & { mockmanId?: string },
	response?: ILog['response'],
): IEventMessage['message'] {
	const rawUrl = request.url
	const [url, query] = rawUrl.split('?')
	const body = isReadableStream(request.body)
		? 'Unsupported body type!'
		: (() => {
			try {
				return typeof request.body === 'object'
					? JSON.stringify(request.body)
					: request.body ?? ''
			} catch {
				return 'Unsupported body type!'
			}
		})()

	return {
		id: request.mockmanId,
		request: {
			url,
			queryParams: query ? JSON.stringify(parseQuery(query)) : undefined,
			body,
			method: request.method,
			headers: Object.entries(getHeaders(request.headers)).map(([name, value]) => ({ name, value })),
		},
		response,
	}
}