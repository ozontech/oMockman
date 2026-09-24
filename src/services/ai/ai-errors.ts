import type { AIErrorCode, IAIChatResponseError } from '@/interface/ai'

const TOKEN_INVALID_BODY_HINTS = [
	'unauthorized. check token.',
	'invalid token',
	'invalid api key',
	'incorrect api key',
]

/**
 * Maps an HTTP failure onto an AIErrorCode.
 */
export function classifyHttpError(status: number, body: string): AIErrorCode {
	if (status === 401 || status === 403) return 'token_invalid'
	if (status === 429) return 'rate_limited'
	if (status >= 400 && status < 500) {
		const lower = body.toLowerCase()
		if (TOKEN_INVALID_BODY_HINTS.some((hint) => lower.includes(hint))) return 'token_invalid'
		return 'bad_response'
	}
	if (status >= 500) return 'bad_response'
	return 'unknown'
}

export function classifyThrownError(error: unknown): AIErrorCode {
	if (error instanceof DOMException && error.name === 'AbortError') return 'aborted'
	const message = error instanceof Error ? error.message : String(error ?? '')
	if (/network|failed to fetch|load failed|networkerror/i.test(message)) return 'network'
	return 'unknown'
}

export function buildErrorResponse(
	code: AIErrorCode,
	message: string,
	extra?: { status?: number; traceId?: string },
): IAIChatResponseError {
	return {
		ok: false,
		error: {
			code,
			message,
			status: extra?.status,
			traceId: extra?.traceId,
		},
	}
}
