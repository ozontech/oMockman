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

/** `size` is unknown when reading stopped at the limit and nothing declared the length. */
export function tooLargeResponseForLog(status: number, headers: LogResponse['headers'], size?: number): LogResponse {
	return { status, response: '', headers, tooLarge: true, size }
}

/** Files and other binary bodies are not logged: only their size is. */
export function binaryResponseForLog(status: number, headers: LogResponse['headers'], size?: number): LogResponse {
	return { status, response: '', headers, binary: true, size }
}

export function markRequestBody(message: unknown, body: LimitedBody): void {
	if (!body.tooLarge) return
	const request = (message as { request?: Record<string, unknown> } | undefined)?.request
	if (!request) return
	request.bodyTooLarge = true
	request.bodySize = body.bytes
}

const EMPTY_BODY: LimitedBody = { text: '', tooLarge: false }

/** Reads a body stream up to the limit and cancels it there, so an oversized body is never held whole. */
export async function readBodyLimited(
	stream: ReadableStream<Uint8Array> | null | undefined,
	limit: number = MAX_LOGGED_BODY_BYTES,
): Promise<LimitedBody> {
	if (!stream) return EMPTY_BODY
	const reader = stream.getReader()
	const chunks: Uint8Array[] = []
	let bytes = 0
	try {
		for (;;) {
			const { done, value } = await reader.read()
			if (done) break
			bytes += value.byteLength
			if (bytes > limit) {
				reader.cancel().catch(() => undefined)
				return { text: '', tooLarge: true }
			}
			chunks.push(value)
		}
	} catch {
		return EMPTY_BODY
	}
	const decoder = new TextDecoder()
	let text = ''
	for (const chunk of chunks) text += decoder.decode(chunk, { stream: true })
	text += decoder.decode()
	return { text, tooLarge: false }
}

const TEXT_SUBTYPE = /^(?:(?:[\w.-]+\+)?(?:json|xml)|(?:x-)?(?:javascript|ecmascript|www-form-urlencoded|ndjson|jsonl|graphql|yaml))$/
const BINARY_TYPES = new Set(['application', 'image', 'audio', 'video', 'font'])

/** Files, images and media are logged by size only. An unknown type is read as text. */
export function isBinaryContentType(contentType: string | null | undefined): boolean {
	const [type = '', subtype = ''] = String(contentType || '').toLowerCase().split(';')[0].trim().split('/')
	if (type === 'text' || TEXT_SUBTYPE.test(subtype)) return false
	return BINARY_TYPES.has(type)
}

/** Server-sent events never end, so their body is not read for the log. */
export function isEventStream(contentType: string | null | undefined): boolean {
	return String(contentType || '').toLowerCase().startsWith('text/event-stream')
}
