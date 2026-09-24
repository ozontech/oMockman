import { describe, expect, it } from 'vitest'

import { exceedsBodyLimit, formatBytes, MAX_BODY_BYTES, utf8ByteLength } from '@/services/body-limits'
import { limitBody, markRequestBody, responseForLog } from '@/inject/limits'

describe('body limits', () => {
	it('sets the limit at 20 MB', () => {
		expect(MAX_BODY_BYTES).toBe(20 * 1024 * 1024)
	})

	it('measures UTF-8 bytes, not characters', () => {
		expect(utf8ByteLength('abc')).toBe(3)
		expect(utf8ByteLength('é')).toBe(2)
		expect(utf8ByteLength('€')).toBe(3)
	})

	it('decides by length when that is enough', () => {
		expect(exceedsBodyLimit('x'.repeat(10), 9)).toBe(true)
		expect(exceedsBodyLimit('x'.repeat(3), 9)).toBe(false)
	})

	it('encodes only when the length is ambiguous', () => {
		// 4 accented letters = 4 units but 8 bytes.
		expect(exceedsBodyLimit('éééé', 7)).toBe(true)
		expect(exceedsBodyLimit('éééé', 8)).toBe(false)
	})

	it('formats sizes for people', () => {
		expect(formatBytes(512)).toBe('512 B')
		expect(formatBytes(2048)).toBe('2 KB')
		expect(formatBytes(21 * 1024 * 1024)).toBe('21.0 MB')
	})
})

describe('log body helpers', () => {
	const overLimit = 'x'.repeat(MAX_BODY_BYTES + 1)

	it('keeps a body under the limit as is', () => {
		expect(limitBody('{"ok":true}')).toEqual({ text: '{"ok":true}', tooLarge: false })
	})

	it('drops a body over the limit and reports its size', () => {
		expect(limitBody(overLimit)).toEqual({ text: '', tooLarge: true, bytes: overLimit.length })
	})

	it('builds a flagged response entry for an oversized body', () => {
		expect(responseForLog(200, overLimit, [])).toEqual({
			status: 200, response: '', headers: [], tooLarge: true, size: overLimit.length,
		})
		expect(responseForLog(201, '{}', [])).toEqual({ status: 201, response: '{}', headers: [] })
	})

	it('flags the request of a log entry', () => {
		const message = { request: { url: 'https://x', body: '' } } as Record<string, Record<string, unknown>>
		markRequestBody(message, limitBody(overLimit))
		expect(message.request.bodyTooLarge).toBe(true)
		expect(message.request.bodySize).toBe(overLimit.length)

		const untouched = { request: { url: 'https://x' } } as Record<string, Record<string, unknown>>
		markRequestBody(untouched, limitBody('{}'))
		expect(untouched.request.bodyTooLarge).toBeUndefined()
	})
})
