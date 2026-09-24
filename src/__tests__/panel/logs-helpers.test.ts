import { describe, it, expect } from 'vitest'

import { getRowColor, matchesSearch } from '../../panel/app/logs'
import type { ILog } from '../../interface'

describe('getRowColor', () => {
	it('returns a colour for status 0', () => {
		const log = { response: { status: 0 } } as ILog
		expect(getRowColor(log)).toBe('#e06c75')
	})

	it('returns a colour for 5xx errors', () => {
		const log = { response: { status: 500 } } as ILog
		expect(getRowColor(log)).toBe('#e06c75')

		const log502 = { response: { status: 502 } } as ILog
		expect(getRowColor(log502)).toBe('#e06c75')

		const log599 = { response: { status: 599 } } as ILog
		expect(getRowColor(log599)).toBe('#e06c75')
	})

	it('returns undefined for normal status codes', () => {
		const log200 = { response: { status: 200 } } as ILog
		expect(getRowColor(log200)).toBeUndefined()

		const log404 = { response: { status: 404 } } as ILog
		expect(getRowColor(log404)).toBeUndefined()

		const log302 = { response: { status: 302 } } as ILog
		expect(getRowColor(log302)).toBeUndefined()
	})

	it('returns undefined when status is undefined', () => {
		const log = { response: {} } as ILog
		expect(getRowColor(log)).toBeUndefined()
	})

	it('returns undefined for 4xx errors', () => {
		const log400 = { response: { status: 400 } } as ILog
		expect(getRowColor(log400)).toBeUndefined()

		const log404 = { response: { status: 404 } } as ILog
		expect(getRowColor(log404)).toBeUndefined()

		const log499 = { response: { status: 499 } } as ILog
		expect(getRowColor(log499)).toBeUndefined()
	})
})

describe('matchesSearch', () => {
	it('returns true for an empty search', () => {
		const log = {} as ILog
		expect(matchesSearch(log, '')).toBe(true)
	})

	it('returns true when the method matches the search', () => {
		const log = { request: { method: 'GET' } } as ILog
		expect(matchesSearch(log, 'get')).toBe(true)
		expect(matchesSearch(log, 'post')).toBe(false)
	})

	it('returns true when the URL matches the search', () => {
		const log = { request: { url: '/api/users' } } as ILog
		expect(matchesSearch(log, 'users')).toBe(true)
		expect(matchesSearch(log, '/api/')).toBe(true)
		expect(matchesSearch(log, 'nonexistent')).toBe(false)
	})

	it('returns true when the status matches the search', () => {
		const log = { response: { status: 404 } } as ILog
		expect(matchesSearch(log, '404')).toBe(true)
		expect(matchesSearch(log, '40')).toBe(true)
		expect(matchesSearch(log, '500')).toBe(false)
	})

	it('searches across several fields', () => {
		const log = { request: { method: 'POST', url: '/api/test' }, response: { status: 201 } } as ILog
		expect(matchesSearch(log, 'post')).toBe(true)
		expect(matchesSearch(log, 'test')).toBe(true)
		expect(matchesSearch(log, '201')).toBe(true)
	})

	it('handles undefined fields', () => {
		const log = {} as ILog
		expect(matchesSearch(log, 'get')).toBe(false)
		expect(matchesSearch(log, '200')).toBe(false)
	})

	it('searches case-insensitively', () => {
		const log = { request: { method: 'DELETE', url: '/API/ITEM' } } as ILog
		expect(matchesSearch(log, 'delete')).toBe(true)
		expect(matchesSearch(log, 'item')).toBe(true)
	})
})
