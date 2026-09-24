import { describe, it, expect } from 'vitest'

import { parseJSONIfPossible } from '../../panel/app/logs/logDetails'

describe('parseJSONIfPossible', () => {
	it('parses a valid JSON object', () => {
		const result = parseJSONIfPossible('{"key": "value"}')
		expect(result.parsed).toBe(true)
		expect(result.json).toEqual({ key: 'value' })
		expect(result.original).toBe('{"key": "value"}')
	})

	it('parses a valid JSON array', () => {
		const result = parseJSONIfPossible('[1, 2, 3]')
		expect(result.parsed).toBe(true)
		expect(result.json).toEqual([1, 2, 3])
	})

	it('returns an empty object for invalid JSON', () => {
		const result = parseJSONIfPossible('not a json')
		expect(result.parsed).toBe(false)
		expect(result.json).toEqual({})
		expect(result.original).toBe('not a json')
	})

	it('returns an empty object for a whitespace string', () => {
		const result = parseJSONIfPossible('   ')
		expect(result.parsed).toBe(false)
		expect(result.json).toEqual({})
	})

	it('returns an empty object for an empty string', () => {
		const result = parseJSONIfPossible('')
		expect(result.parsed).toBe(false)
		expect(result.json).toEqual({})
	})

	it('treats JSON null as invalid', () => {
		const result = parseJSONIfPossible('null')
		expect(result.parsed).toBe(false)
		expect(result.json).toEqual({})
	})

	it('treats primitives as invalid JSON', () => {
		const stringResult = parseJSONIfPossible('"just a string"')
		expect(stringResult.parsed).toBe(false)
		expect(stringResult.json).toEqual({})

		const numberResult = parseJSONIfPossible('123')
		expect(numberResult.parsed).toBe(false)
		expect(numberResult.json).toEqual({})

		const boolResult = parseJSONIfPossible('true')
		expect(boolResult.parsed).toBe(false)
		expect(boolResult.json).toEqual({})
	})

	it('handles nested objects', () => {
		const result = parseJSONIfPossible('{"a": {"b": 1}}')
		expect(result.parsed).toBe(true)
		expect(result.json).toEqual({ a: { b: 1 } })
	})
})
