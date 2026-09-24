import type { ILog } from '@/interface/mock'
import { exceedsBodyLimit, MAX_BODY_BYTES, utf8ByteLength } from '@/services/body-limits'

export const MAX_LOGGED_BODY_BYTES = MAX_BODY_BYTES

type LogResponse = NonNullable<ILog['response']>

export interface LimitedBody {
	text: string
	tooLarge: boolean
	bytes?: number
}

export function limitBody(body: string | undefined): LimitedBody {
	const text = typeof body === 'string' ? body : ''
	if (!exceedsBodyLimit(text)) return { text, tooLarge: false }
	return { text: '', tooLarge: true, bytes: utf8ByteLength(text) }
}

export function responseForLog(status: number, body: string | undefined, headers: LogResponse['headers']): LogResponse {
	const limited = limitBody(body)
	return limited.tooLarge
		? { status, response: '', headers, tooLarge: true, size: limited.bytes }
		: { status, response: limited.text, headers }
}

export function markRequestBody(message: unknown, body: LimitedBody): void {
	if (!body.tooLarge) return
	const request = (message as { request?: Record<string, unknown> } | undefined)?.request
	if (!request) return
	request.bodyTooLarge = true
	request.bodySize = body.bytes
}
