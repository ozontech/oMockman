import { describe, it, expect } from 'vitest'

import {
	parsePathSegments,
	findRangeByPath,
	applyQuickFixToJson,
} from '../../panel/app/common/cm-json-path'

describe('parsePathSegments', () => {
	it('returns an empty array for an empty string', () => {
		expect(parsePathSegments('')).toEqual([])
	})

	it('returns an empty array for $', () => {
		expect(parsePathSegments('$')).toEqual([])
	})

	it('parses a simple path', () => {
		expect(parsePathSegments('$.key')).toEqual(['key'])
	})

	it('parses nested paths', () => {
		expect(parsePathSegments('$.a.b.c')).toEqual(['a', 'b', 'c'])
	})

	it('parses array indexes', () => {
		expect(parsePathSegments('$[0]')).toEqual([0])
		expect(parsePathSegments('[0]')).toEqual([0])
		expect(parsePathSegments('$.items[0]')).toEqual(['items', 0])
	})

	it('parses string indexes', () => {
		expect(parsePathSegments('["key"]')).toEqual(['key'])
		expect(parsePathSegments('$["key"]')).toEqual(['key'])
		expect(parsePathSegments('[\'key\']')).toEqual(['key'])
	})

	it('parses mixed paths', () => {
		expect(parsePathSegments('$.items[0].name')).toEqual(['items', 0, 'name'])
	})

	it('parses a path with $ and several dots', () => {
		expect(parsePathSegments('$.a[0].b[1].c')).toEqual(['a', 0, 'b', 1, 'c'])
	})
})

describe('findRangeByPath', () => {
	it('returns the document start for empty content', () => {
		const result = findRangeByPath('', '$')
		expect(result).toEqual({ from: 0, to: 0 })
	})

	it('returns the document start for an empty path', () => {
		const result = findRangeByPath('{"key": "value"}', '')
		expect(result.from).toBe(0)
		expect(result.to).toBeGreaterThan(0)
	})

	it('returns the document start for $', () => {
		const result = findRangeByPath('{"key": "value"}', '$')
		expect(result.from).toBe(0)
	})

	it('finds the range by path', () => {
		const content = '{"key": "value"}'
		const result = findRangeByPath(content, '$.key')
		expect(result.from).toBeGreaterThanOrEqual(0)
		expect(result.to).toBeGreaterThan(result.from)
	})

	it('finds nested keys', () => {
		const content = '{"a": {"b": "value"}}'
		const result = findRangeByPath(content, '$.a.b')
		expect(result.from).toBeGreaterThan(0)
	})
})

describe('applyQuickFixToJson', () => {
	it('applies a fix to an empty object', () => {
		const result = applyQuickFixToJson('', { type: 'set-value', path: '$.key', value: 'test' })
		expect(result).toBe('{\n  "key": "test"\n}')
	})

	it('applies a fix to an empty array', () => {
		const result = applyQuickFixToJson('', { type: 'set-value', path: '$[0]', value: 'test' })
		expect(result).toBe('[\n  "test"\n]')
	})

	it('applies a fix to existing JSON', () => {
		const result = applyQuickFixToJson('{"key": "old"}', { type: 'set-value', path: '$.key', value: 'new' })
		expect(result).toBe('{\n  "key": "new"\n}')
	})

	it('adds a new field', () => {
		const result = applyQuickFixToJson('{"existing": 1}', { type: 'set-value', path: '$.new', value: 2 })
		expect(result).toContain('"existing": 1')
		expect(result).toContain('"new": 2')
	})

	it('returns null for invalid JSON', () => {
		const result = applyQuickFixToJson('not json', { type: 'set-value', path: '$.key', value: 'test' })
		expect(result).toBeNull()
	})

	it('handles createParents', () => {
		const content = '{}'
		const result = applyQuickFixToJson(content, { type: 'set-value', path: '$.a.b', value: 'test', createParents: true })
		expect(result).toContain('a')
		expect(result).toContain('b')
	})

	it('updates nested values', () => {
		const result = applyQuickFixToJson('{"a": {"b": 1}}', { type: 'set-value', path: '$.a.b', value: 2 })
		expect(result).toBe('{\n  "a": {\n    "b": 2\n  }\n}')
	})

	it('works with arrays', () => {
		const result = applyQuickFixToJson('{"items": []}', { type: 'set-value', path: '$.items[0]', value: 'first' })
		expect(result).toContain('"items"')
		expect(result).toContain('"first"')
	})
})
