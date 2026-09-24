import { describe, it, expect } from 'vitest'

import { isReadableStream } from '../../inject'

describe('isReadableStream', () => {
	it('returns true for a ReadableStream', () => {
		const stream = new ReadableStream()
		expect(isReadableStream(stream)).toBe(true)
	})

	it('returns false for a plain object', () => {
		expect(isReadableStream({})).toBe(false)
	})

	it('returns false for an array', () => {
		expect(isReadableStream([])).toBe(false)
	})

	it('returns false for null', () => {
		expect(isReadableStream(null)).toBe(false)
	})

	it('returns false for undefined', () => {
		expect(isReadableStream(undefined)).toBe(false)
	})

	it('returns false for a string', () => {
		expect(isReadableStream('string')).toBe(false)
	})

	it('returns false for a number', () => {
		expect(isReadableStream(123)).toBe(false)
	})

	it('returns false for an object without getReader', () => {
		expect(isReadableStream({ foo: 'bar' })).toBe(false)
	})

	it('returns true for an object with a getReader function', () => {
		const obj = { getReader: () => null }
		expect(isReadableStream(obj)).toBe(true)
	})
})
