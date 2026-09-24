import { describe, it, expect } from 'vitest'

import { isJsonValid, prettifyJson, safeParseJson } from '../../services'

describe('safeParseJson', () => {
	it('parses valid JSON', () => {
		expect(safeParseJson('{"a":1}')).toEqual({ ok: true, value: { a: 1 } })
		expect(safeParseJson('[1,2,3]')).toEqual({ ok: true, value: [1, 2, 3] })
		expect(safeParseJson('"string"')).toEqual({ ok: true, value: 'string' })
		expect(safeParseJson('123')).toEqual({ ok: true, value: 123 })
		expect(safeParseJson('true')).toEqual({ ok: true, value: true })
		expect(safeParseJson('null')).toEqual({ ok: true, value: null })
	})

	it('handles null', () => {
		expect(safeParseJson(null)).toEqual({ ok: true, value: undefined })
	})

	it('handles undefined', () => {
		expect(safeParseJson(undefined)).toEqual({ ok: true, value: undefined })
	})

	it('handles an empty string', () => {
		expect(safeParseJson('')).toEqual({ ok: true, value: undefined })
	})

	it('handles a whitespace string', () => {
		expect(safeParseJson('   ')).toEqual({ ok: true, value: undefined })
		expect(safeParseJson('   {"a":1}   ')).toEqual({ ok: true, value: { a: 1 } })
	})

	it('handles invalid JSON', () => {
		const result = safeParseJson('{a:1}')
		if (!result.ok) {
			expect(result.error).toBeDefined()
		}
	})

	it('parses with a type parameter', () => {
		const result = safeParseJson<{ name: string }>('{"name":"test"}')
		expect(result.ok).toBe(true)
		if (result.ok) {
			expect(result.value).toEqual({ name: 'test' })
		}
	})
})

describe('isJsonValid', () => {
	it('accepts valid JSON', () => {
		expect(isJsonValid('{"a":1}')).toBe(true)
		expect(isJsonValid('[1,2,3]')).toBe(true)
		expect(isJsonValid('"string"')).toBe(true)
		expect(isJsonValid('123')).toBe(true)
	})

	it('rejects invalid JSON', () => {
		expect(isJsonValid('{a:1}')).toBe(false)
		expect(isJsonValid('')).toBe(true)
		expect(isJsonValid('   ')).toBe(true)
	})
})

describe('prettifyJson', () => {
	it('formats an object', () => {
		expect(prettifyJson('{"a":1,"b":2}')).toBe('{\n  "a": 1,\n  "b": 2\n}')
	})

	it('formats an array', () => {
		expect(prettifyJson('[1,2,3]')).toBe('[\n  1,\n  2,\n  3\n]')
	})

	it('formats nested objects', () => {
		expect(prettifyJson('{"a":{"b":1}}')).toBe('{\n  "a": {\n    "b": 1\n  }\n}')
	})

	it('formats nested arrays', () => {
		expect(prettifyJson('[[1,2],[3,4]]')).toBe('[\n  [\n    1,\n    2\n  ],\n  [\n    3,\n    4\n  ]\n]')
	})

	it('handles an empty string', () => {
		expect(prettifyJson('')).toBe('')
	})

	it('handles null', () => {
		expect(prettifyJson(null as unknown as string)).toBe(null)
	})

	it('handles undefined', () => {
		expect(prettifyJson(undefined as unknown as string)).toBe(undefined)
	})

	it('handles invalid JSON', () => {
		expect(prettifyJson('{a:1}')).toBe('{\n  "a": 1\n}')
	})

	it('keeps strings unchanged', () => {
		expect(prettifyJson('{"str":"hello world"}')).toBe('{\n  "str": "hello world"\n}')
	})

	it('handles special symbols', () => {
		expect(prettifyJson('{"a":"b\\nc"}')).toBe('{\n  "a": "b\\nc"\n}')
	})

	it('handles an empty object', () => {
		expect(prettifyJson('{}')).toBe('{\n  \n}')
	})

	it('handles an empty array', () => {
		expect(prettifyJson('[]')).toBe('[\n  \n]')
	})

	it('handles JSON with special values', () => {
		expect(prettifyJson('{"a":null,"b":true,"c":false}')).toBe('{\n  "a": null,\n  "b": true,\n  "c": false\n}')
	})

	it('handles numbers', () => {
		expect(prettifyJson('{"a":1,"b":1.5,"c":1e10}')).toBe('{\n  "a": 1,\n  "b": 1.5,\n  "c": 10000000000\n}')
	})

	it('handles JSON-like input without quotes', () => {
		expect(prettifyJson('{a:1}')).toBe('{\n  "a": 1\n}')
	})

	it('handles JSON-like input with single quotes', () => {
		expect(prettifyJson('{a:\'test\'}')).toBe('{\n  "a": "test"\n}')
	})

	it('handles JSON with escaped characters', () => {
		expect(prettifyJson('{"a":"test\\"quote"}')).toBe('{\n  "a": "test\\"quote"\n}')
	})

	it('handles a value with spaces', () => {
		expect(prettifyJson('{a: test}')).toBe('{\n  "a": "test"\n}')
	})

	it('handles tabs and line breaks', () => {
		expect(prettifyJson('{\t"a": 1\n}')).toBe('{\n  "a": 1\n}')
	})
})
