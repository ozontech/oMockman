import { describe, it, expect } from 'vitest'

import { BLOCKED_HEADERS, buildHeadersMap, parseAllResponseHeaders } from '../../inject/http-utils'

describe('buildHeadersMap', () => {
	it('builds a header map from a valid array', () => {
		const headers = [
			{ name: 'Content-Type', value: 'application/json' },
			{ name: 'Authorization', value: 'Bearer token' },
		]
		const result = buildHeadersMap(headers)
		expect(result).toEqual({
			'Content-Type': 'application/json',
			Authorization: 'Bearer token',
		})
	})

	it('filters out BLOCKED_HEADERS', () => {
		const headers = [
			{ name: 'Content-Type', value: 'application/json' },
			{ name: 'Content-Encoding', value: 'gzip' },
			{ name: 'Transfer-Encoding', value: 'chunked' },
			{ name: 'Content-Length', value: '123' },
			{ name: 'X-Custom-Header', value: 'value' },
		]
		const result = buildHeadersMap(headers)
		expect(result).toEqual({
			'Content-Type': 'application/json',
			'X-Custom-Header': 'value',
		})
	})

	it('handles undefined input', () => {
		const result = buildHeadersMap(undefined)
		expect(result).toEqual({})
	})

	it('handles null input', () => {
		const result = buildHeadersMap(null as unknown as Array<{ name?: string; value?: string }>)
		expect(result).toEqual({})
	})

	it('handles an empty array', () => {
		const result = buildHeadersMap([])
		expect(result).toEqual({})
	})

	it('ignores empty header names', () => {
		const headers = [
			{ name: '', value: 'value1' },
			{ name: '   ', value: 'value2' },
			{ name: 'Valid-Header', value: 'value3' },
		]
		const result = buildHeadersMap(headers)
		expect(result).toEqual({
			'Valid-Header': 'value3',
		})
	})

	it('filters BLOCKED_HEADERS case-insensitively', () => {
		const headers = [
			{ name: 'CONTENT-ENCODING', value: 'gzip' },
			{ name: 'Transfer-Encoding', value: 'chunked' },
			{ name: 'content-length', value: '100' },
		]
		const result = buildHeadersMap(headers)
		expect(result).toEqual({})
	})

	it('handles headers without a value', () => {
		const headers = [
			{ name: 'X-Custom-Header' },
			{ name: 'X-Another-Header', value: undefined },
		]
		const result = buildHeadersMap(headers)
		expect(result).toEqual({
			'X-Custom-Header': '',
			'X-Another-Header': '',
		})
	})
})

describe('parseAllResponseHeaders', () => {
	it('parses a simple header', () => {
		const raw = 'Content-Type: application/json'
		const result = parseAllResponseHeaders(raw)
		expect(result).toEqual([{ name: 'Content-Type', value: 'application/json' }])
	})

	it('parses several headers', () => {
		const raw = 'Content-Type: application/json\r\nX-Custom-Header: value\r\nAuthorization: Bearer token'
		const result = parseAllResponseHeaders(raw)
		expect(result).toEqual([
			{ name: 'Content-Type', value: 'application/json' },
			{ name: 'X-Custom-Header', value: 'value' },
			{ name: 'Authorization', value: 'Bearer token' },
		])
	})

	it('handles an empty string', () => {
		expect(parseAllResponseHeaders('')).toEqual([])
	})

	it('handles a whitespace string', () => {
		expect(parseAllResponseHeaders('   ')).toEqual([])
	})

	it('parses a header without a value', () => {
		const raw = 'X-Custom-Header:'
		const result = parseAllResponseHeaders(raw)
		expect(result).toEqual([{ name: 'X-Custom-Header', value: '' }])
	})

	it('treats everything before : as the name', () => {
		const raw = 'X-Header-Without-Value'
		const result = parseAllResponseHeaders(raw)
		expect(result).toEqual([{ name: 'X-Header-Without-Value', value: '' }])
	})

	it('trims values', () => {
		const raw = 'X-Header:   value with spaces   '
		const result = parseAllResponseHeaders(raw)
		expect(result).toEqual([{ name: 'X-Header', value: 'value with spaces' }])
	})

	it('handles undefined', () => {
		expect(parseAllResponseHeaders(undefined as unknown as string)).toEqual([])
	})

	it('handles null', () => {
		expect(parseAllResponseHeaders(null as unknown as string)).toEqual([])
	})

	it('handles a CRLF-only string', () => {
		expect(parseAllResponseHeaders('\r\n\r\n')).toEqual([])
	})
})

describe('BLOCKED_HEADERS', () => {
	it('BLOCKED_HEADERS contains the expected values', () => {
		expect(BLOCKED_HEADERS.has('content-encoding')).toBe(true)
		expect(BLOCKED_HEADERS.has('transfer-encoding')).toBe(true)
		expect(BLOCKED_HEADERS.has('content-length')).toBe(true)
	})

	it('BLOCKED_HEADERS does not contain regular headers', () => {
		expect(BLOCKED_HEADERS.has('content-type')).toBe(false)
		expect(BLOCKED_HEADERS.has('authorization')).toBe(false)
		expect(BLOCKED_HEADERS.has('x-custom-header')).toBe(false)
	})
})