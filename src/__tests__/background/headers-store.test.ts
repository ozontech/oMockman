import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { setHeaders, getHeaders, isDeniedHeader, clearHeaders } from '../../background/headers-store'

describe('headers-store', () => {
	beforeEach(() => {
		vi.useFakeTimers()
		clearHeaders()
	})

	afterEach(() => {
		vi.useRealTimers()
		vi.clearAllTimers()
	})

	describe('setHeaders', () => {
		it('stores headers and drops credential headers', () => {
			const headers = [
				{ name: 'Content-Type', value: 'application/json' },
				{ name: 'Authorization', value: 'Bearer token' },
				{ name: 'Set-Cookie', value: 'session=1' },
				{ name: 'X-Api-Key', value: 'secret' },
			] as chrome.webRequest.HttpHeader[]

			setHeaders(1, 'GET', 'https://example.com/api', headers)

			const result = getHeaders(1, 'GET', 'https://example.com/api')
			expect(result).toEqual([
				{ name: 'content-type', value: 'application/json' },
			])
		})

		it('recognises denied header names case-insensitively', () => {
			expect(isDeniedHeader('Set-Cookie')).toBe(true)
			expect(isDeniedHeader('AUTHORIZATION')).toBe(true)
			expect(isDeniedHeader('x-csrf-token')).toBe(true)
			expect(isDeniedHeader('content-type')).toBe(false)
		})

		it('clearHeaders empties the cache', () => {
			setHeaders(1, 'GET', 'https://example.com/api', [
				{ name: 'Content-Type', value: 'application/json' },
			] as chrome.webRequest.HttpHeader[])
			clearHeaders()
			expect(getHeaders(1, 'GET', 'https://example.com/api')).toEqual([])
		})

		it('lower-cases header names', () => {
			const headers = [
				{ name: 'Content-Type', value: 'application/json' },
				{ name: 'X-CUSTOM-HEADER', value: 'value' },
			] as chrome.webRequest.HttpHeader[]

			setHeaders(1, 'POST', 'https://api.test', headers)

			const result = getHeaders(1, 'POST', 'https://api.test')
			expect(result[0].name).toBe('content-type')
			expect(result[1].name).toBe('x-custom-header')
		})

		it('handles undefined headers', () => {
			setHeaders(1, 'GET', 'https://example.com', undefined)

			const result = getHeaders(1, 'GET', 'https://example.com')
			expect(result).toEqual([])
		})

		it('handles null headers', () => {
			setHeaders(1, 'GET', 'https://example.com', null as unknown as undefined)

			const result = getHeaders(1, 'GET', 'https://example.com')
			expect(result).toEqual([])
		})

		it('handles an empty header array', () => {
			setHeaders(1, 'GET', 'https://example.com', [])

			const result = getHeaders(1, 'GET', 'https://example.com')
			expect(result).toEqual([])
		})

		it('does not throw on empty names', () => {
			const headers = [
				{ name: '', value: 'value1' },
				{ name: undefined as unknown as string, value: 'value2' },
			] as chrome.webRequest.HttpHeader[]

			expect(() => setHeaders(1, 'GET', 'https://example.com', headers)).not.toThrow()
		})

		it('treats empty values as an empty string', () => {
			const headers = [{ name: 'X-Header' }] as chrome.webRequest.HttpHeader[]

			setHeaders(1, 'GET', 'https://example.com', headers)

			const result = getHeaders(1, 'GET', 'https://example.com')
			expect(result[0].value).toBe('')
		})
	})

	describe('getHeaders', () => {
		it('returns nothing for unknown headers', () => {
			const result = getHeaders(1, 'GET', 'https://not-exist.com')
			expect(result).toEqual([])
		})

		it('keeps headers separate per URL', () => {
			const headers1 = [{ name: 'Content-Type', value: 'json' }] as chrome.webRequest.HttpHeader[]
			const headers2 = [{ name: 'Content-Type', value: 'xml' }] as chrome.webRequest.HttpHeader[]

			setHeaders(1, 'GET', 'https://example.com/1', headers1)
			setHeaders(1, 'GET', 'https://example.com/2', headers2)

			expect(getHeaders(1, 'GET', 'https://example.com/1')[0].value).toBe('json')
			expect(getHeaders(1, 'GET', 'https://example.com/2')[0].value).toBe('xml')
		})

		it('keeps headers separate per method', () => {
			const headersGet = [{ name: 'X-Method', value: 'GET' }] as chrome.webRequest.HttpHeader[]
			const headersPost = [{ name: 'X-Method', value: 'POST' }] as chrome.webRequest.HttpHeader[]

			setHeaders(1, 'GET', 'https://api.test', headersGet)
			setHeaders(1, 'POST', 'https://api.test', headersPost)

			expect(getHeaders(1, 'GET', 'https://api.test')[0].value).toBe('GET')
			expect(getHeaders(1, 'POST', 'https://api.test')[0].value).toBe('POST')
		})
	})

	describe('TTL', () => {
		it('drops headers after the TTL', () => {
			const headers = [{ name: 'Content-Type', value: 'json' }] as chrome.webRequest.HttpHeader[]

			setHeaders(1, 'GET', 'https://example.com', headers)

			expect(getHeaders(1, 'GET', 'https://example.com').length).toBe(1)

			vi.advanceTimersByTime(10_000)

			expect(getHeaders(1, 'GET', 'https://example.com')).toEqual([])
		})

		it('serves headers right after they are set', () => {
			const headers = [{ name: 'Test', value: 'value' }] as chrome.webRequest.HttpHeader[]

			setHeaders(1, 'GET', 'https://example.com', headers)
			vi.advanceTimersByTime(9_999)

			expect(getHeaders(1, 'GET', 'https://example.com').length).toBe(1)
		})
	})

	describe('limits', () => {
		const row = (value: string) => [{ name: 'X-Test', value }] as chrome.webRequest.HttpHeader[]

		it('keeps the same URL apart per tab', () => {
			setHeaders(1, 'GET', 'https://example.com/api', row('one'))
			setHeaders(2, 'GET', 'https://example.com/api', row('two'))

			expect(getHeaders(1, 'GET', 'https://example.com/api')[0].value).toBe('one')
			expect(getHeaders(2, 'GET', 'https://example.com/api')[0].value).toBe('two')
		})

		it('clears one tab only', () => {
			setHeaders(1, 'GET', 'https://example.com/api', row('one'))
			setHeaders(2, 'GET', 'https://example.com/api', row('two'))

			clearHeaders(1)

			expect(getHeaders(1, 'GET', 'https://example.com/api')).toEqual([])
			expect(getHeaders(2, 'GET', 'https://example.com/api')).toHaveLength(1)
		})

		it('evicts the oldest entries past 500', () => {
			for (let i = 0; i < 510; i += 1) setHeaders(1, 'GET', `https://example.com/${i}`, row(String(i)))

			expect(getHeaders(1, 'GET', 'https://example.com/0')).toEqual([])
			expect(getHeaders(1, 'GET', 'https://example.com/9')).toEqual([])
			expect(getHeaders(1, 'GET', 'https://example.com/10')).toHaveLength(1)
			expect(getHeaders(1, 'GET', 'https://example.com/509')).toHaveLength(1)
		})

		it('caps the number of headers and the length of a value', () => {
			const many = Array.from({ length: 150 }, (_, i) => ({ name: `x-h${i}`, value: 'v' }))
			setHeaders(1, 'GET', 'https://example.com/many', many)
			setHeaders(1, 'GET', 'https://example.com/long', row('v'.repeat(20_000)))

			expect(getHeaders(1, 'GET', 'https://example.com/many')).toHaveLength(100)
			expect(getHeaders(1, 'GET', 'https://example.com/long')[0].value).toHaveLength(8 * 1024)
		})

		it('lets a refreshed entry outlive the first TTL', () => {
			// A per-entry timer from the first set used to delete the second one early.
			setHeaders(1, 'GET', 'https://example.com', row('first'))
			vi.advanceTimersByTime(6_000)
			setHeaders(1, 'GET', 'https://example.com', row('second'))
			vi.advanceTimersByTime(6_000)

			expect(getHeaders(1, 'GET', 'https://example.com')[0].value).toBe('second')
		})
	})
})
