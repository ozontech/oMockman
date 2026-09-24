import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { setHeaders, getHeaders, isDeniedHeader, clearHeaders } from '../../background/headers-store'

describe('headers-store', () => {
	beforeEach(() => {
		vi.useFakeTimers()
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

			setHeaders('GET', 'https://example.com/api', headers)

			const result = getHeaders('GET', 'https://example.com/api')
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
			setHeaders('GET', 'https://example.com/api', [
				{ name: 'Content-Type', value: 'application/json' },
			] as chrome.webRequest.HttpHeader[])
			clearHeaders()
			expect(getHeaders('GET', 'https://example.com/api')).toEqual([])
		})

		it('lower-cases header names', () => {
			const headers = [
				{ name: 'Content-Type', value: 'application/json' },
				{ name: 'X-CUSTOM-HEADER', value: 'value' },
			] as chrome.webRequest.HttpHeader[]

			setHeaders('POST', 'https://api.test', headers)

			const result = getHeaders('POST', 'https://api.test')
			expect(result[0].name).toBe('content-type')
			expect(result[1].name).toBe('x-custom-header')
		})

		it('handles undefined headers', () => {
			setHeaders('GET', 'https://example.com', undefined)

			const result = getHeaders('GET', 'https://example.com')
			expect(result).toEqual([])
		})

		it('handles null headers', () => {
			setHeaders('GET', 'https://example.com', null as unknown as undefined)

			const result = getHeaders('GET', 'https://example.com')
			expect(result).toEqual([])
		})

		it('handles an empty header array', () => {
			setHeaders('GET', 'https://example.com', [])

			const result = getHeaders('GET', 'https://example.com')
			expect(result).toEqual([])
		})

		it('does not throw on empty names', () => {
			const headers = [
				{ name: '', value: 'value1' },
				{ name: undefined as unknown as string, value: 'value2' },
			] as chrome.webRequest.HttpHeader[]

			expect(() => setHeaders('GET', 'https://example.com', headers)).not.toThrow()
		})

		it('treats empty values as an empty string', () => {
			const headers = [{ name: 'X-Header' }] as chrome.webRequest.HttpHeader[]

			setHeaders('GET', 'https://example.com', headers)

			const result = getHeaders('GET', 'https://example.com')
			expect(result[0].value).toBe('')
		})
	})

	describe('getHeaders', () => {
		it('returns nothing for unknown headers', () => {
			const result = getHeaders('GET', 'https://not-exist.com')
			expect(result).toEqual([])
		})

		it('keeps headers separate per URL', () => {
			const headers1 = [{ name: 'Content-Type', value: 'json' }] as chrome.webRequest.HttpHeader[]
			const headers2 = [{ name: 'Content-Type', value: 'xml' }] as chrome.webRequest.HttpHeader[]

			setHeaders('GET', 'https://example.com/1', headers1)
			setHeaders('GET', 'https://example.com/2', headers2)

			expect(getHeaders('GET', 'https://example.com/1')[0].value).toBe('json')
			expect(getHeaders('GET', 'https://example.com/2')[0].value).toBe('xml')
		})

		it('keeps headers separate per method', () => {
			const headersGet = [{ name: 'X-Method', value: 'GET' }] as chrome.webRequest.HttpHeader[]
			const headersPost = [{ name: 'X-Method', value: 'POST' }] as chrome.webRequest.HttpHeader[]

			setHeaders('GET', 'https://api.test', headersGet)
			setHeaders('POST', 'https://api.test', headersPost)

			expect(getHeaders('GET', 'https://api.test')[0].value).toBe('GET')
			expect(getHeaders('POST', 'https://api.test')[0].value).toBe('POST')
		})
	})

	describe('TTL', () => {
		it('drops headers after the TTL', () => {
			const headers = [{ name: 'Content-Type', value: 'json' }] as chrome.webRequest.HttpHeader[]

			setHeaders('GET', 'https://example.com', headers)

			expect(getHeaders('GET', 'https://example.com').length).toBe(1)

			vi.advanceTimersByTime(10_000)

			expect(getHeaders('GET', 'https://example.com')).toEqual([])
		})

		it('serves headers right after they are set', () => {
			const headers = [{ name: 'Test', value: 'value' }] as chrome.webRequest.HttpHeader[]

			setHeaders('GET', 'https://example.com', headers)
			vi.advanceTimersByTime(9_999)

			expect(getHeaders('GET', 'https://example.com').length).toBe(1)
		})
	})
})
