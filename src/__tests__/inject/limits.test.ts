import { describe, expect, it } from 'vitest'

import { isBinaryContentType, isEventStream, readBodyLimited } from '@/inject/limits'

const streamOf = (...parts: string[]): ReadableStream<Uint8Array> => {
	const encoder = new TextEncoder()
	return new ReadableStream({
		start(controller) {
			for (const part of parts) controller.enqueue(encoder.encode(part))
			controller.close()
		},
	})
}

describe('readBodyLimited', () => {
	it('reads a body under the limit', async () => {
		expect(await readBodyLimited(streamOf('{"a":', '1}'), 100)).toEqual({ text: '{"a":1}', tooLarge: false })
	})

	it('decodes a character split across chunks', async () => {
		const bytes = new TextEncoder().encode('я')
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(bytes.slice(0, 1))
				controller.enqueue(bytes.slice(1))
				controller.close()
			},
		})
		expect((await readBodyLimited(stream, 100)).text).toBe('я')
	})

	it('stops at the limit and keeps nothing', async () => {
		expect(await readBodyLimited(streamOf('12345', '67890'), 8)).toEqual({ text: '', tooLarge: true })
	})

	it('treats a missing body as empty', async () => {
		expect(await readBodyLimited(null)).toEqual({ text: '', tooLarge: false })
	})
})

describe('isBinaryContentType', () => {
	it.each([
		'application/json',
		'application/json; charset=utf-8',
		'application/problem+json',
		'application/vnd.api+json',
		'application/xml',
		'image/svg+xml',
		'application/javascript',
		'application/x-www-form-urlencoded',
		'application/x-ndjson',
		'text/csv',
		'text/html',
		'',
	])('reads %s as text', (type) => {
		expect(isBinaryContentType(type)).toBe(false)
	})

	it.each([
		'application/octet-stream',
		'application/pdf',
		'application/zip',
		'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		'image/png',
		'video/mp4',
		'font/woff2',
	])('treats %s as binary', (type) => {
		expect(isBinaryContentType(type)).toBe(true)
	})
})

describe('isEventStream', () => {
	it('recognises server-sent events', () => {
		expect(isEventStream('text/event-stream; charset=utf-8')).toBe(true)
		expect(isEventStream('text/plain')).toBe(false)
	})
})
