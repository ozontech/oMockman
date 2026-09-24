import { describe, expect, it } from 'vitest'

import { buildErrorResponse, classifyHttpError, classifyThrownError } from '../ai-errors'

describe('classifyHttpError', () => {
	it('maps 401 to token_invalid', () => {
		expect(classifyHttpError(401, 'Unauthorized')).toBe('token_invalid')
	})

	it('maps 403 to token_invalid', () => {
		expect(classifyHttpError(403, 'Forbidden')).toBe('token_invalid')
	})

	it('maps 429 to rate_limited', () => {
		expect(classifyHttpError(429, 'Too Many Requests')).toBe('rate_limited')
	})

	it('detects token problems from the body even on a plain 400', () => {
		expect(classifyHttpError(400, 'Unauthorized. Check token.')).toBe('token_invalid')
		expect(classifyHttpError(400, 'Invalid API key provided')).toBe('token_invalid')
	})

	it('maps other 4xx to bad_response', () => {
		expect(classifyHttpError(404, 'not found')).toBe('bad_response')
		expect(classifyHttpError(422, 'unprocessable')).toBe('bad_response')
	})

	it('maps 5xx to bad_response', () => {
		expect(classifyHttpError(500, 'internal error')).toBe('bad_response')
		expect(classifyHttpError(503, 'temporary outage')).toBe('bad_response')
	})

	it('maps unexpected statuses to unknown', () => {
		expect(classifyHttpError(0, '')).toBe('unknown')
		expect(classifyHttpError(200, '')).toBe('unknown')
	})
})

describe('classifyThrownError', () => {
	it('detects AbortError as aborted', () => {
		const error = new DOMException('aborted', 'AbortError')
		expect(classifyThrownError(error)).toBe('aborted')
	})

	it('detects network failures by message', () => {
		expect(classifyThrownError(new Error('Failed to fetch'))).toBe('network')
		expect(classifyThrownError(new Error('NetworkError when attempting to fetch'))).toBe('network')
		expect(classifyThrownError(new Error('Load failed'))).toBe('network')
	})

	it('falls back to unknown for other errors', () => {
		expect(classifyThrownError(new Error('something else'))).toBe('unknown')
		expect(classifyThrownError('string error')).toBe('unknown')
		expect(classifyThrownError(undefined)).toBe('unknown')
	})
})

describe('buildErrorResponse', () => {
	it('builds a well-formed error object', () => {
		const res = buildErrorResponse('token_invalid', 'expired', { status: 401, traceId: 't-1' })
		expect(res.ok).toBe(false)
		expect(res.error).toEqual({
			code: 'token_invalid',
			message: 'expired',
			status: 401,
			traceId: 't-1',
		})
	})

	it('handles missing optional fields', () => {
		const res = buildErrorResponse('unknown', 'nope')
		expect(res.error.status).toBeUndefined()
		expect(res.error.traceId).toBeUndefined()
	})
})
