import { describe, it, expect } from 'vitest'

import { makeHeadersKey, normalizeUrl } from '../../services'

describe('normalizeUrl', () => {
	it('removes trailing slashes from the URL', () => {
		expect(normalizeUrl('https://api.example.com/users/')).toBe('https://api.example.com/users')
		expect(normalizeUrl('https://api.example.com/')).toBe('https://api.example.com')
		expect(normalizeUrl('https://api.example.com/a/b/c/')).toBe('https://api.example.com/a/b/c')
	})

	it('removes the query string from the URL', () => {
		expect(normalizeUrl('https://api.example.com/users?id=123')).toBe('https://api.example.com/users')
		expect(normalizeUrl('https://api.example.com/search?q=test&page=1')).toBe('https://api.example.com/search')
	})

	it('removes trailing slashes and the query string together', () => {
		expect(normalizeUrl('https://api.example.com/users/?id=123')).toBe('https://api.example.com/users')
		expect(normalizeUrl('https://api.example.com/api/v1/data/?foo=bar&baz=qux')).toBe('https://api.example.com/api/v1/data')
	})

	it('handles several trailing slashes in a row', () => {
		expect(normalizeUrl('https://api.example.com/users//')).toBe('https://api.example.com/users')
		expect(normalizeUrl('https://api.example.com///')).toBe('https://api.example.com')
	})

	it('handles null', () => {
		expect(normalizeUrl(null as unknown as string)).toBe('')
	})

	it('handles undefined', () => {
		expect(normalizeUrl(undefined as unknown as string)).toBe('')
	})

	it('handles an empty string', () => {
		expect(normalizeUrl('')).toBe('')
	})

	it('handles non-string values', () => {
		expect(normalizeUrl(123 as unknown as string)).toBe('123')
		expect(normalizeUrl({} as unknown as string)).toBe('[object Object]')
		expect(normalizeUrl([] as unknown as string)).toBe('')
	})

	it('handles an error during trim', () => {
		const objWithThrowingToString = {
			toString() {
				throw new Error('toString error')
			},
		}
		expect(normalizeUrl(objWithThrowingToString as unknown as string)).toBe(objWithThrowingToString)
	})

	it('keeps a URL without trailing slash and query string', () => {
		expect(normalizeUrl('https://api.example.com/users')).toBe('https://api.example.com/users')
	})

	it('handles a URL with only a query string', () => {
		expect(normalizeUrl('https://api.example.com/?id=123')).toBe('https://api.example.com')
	})

	it('handles a URL with an empty query string', () => {
		expect(normalizeUrl('https://api.example.com/path?')).toBe('https://api.example.com/path')
	})

	it('handles a URL without a protocol', () => {
		expect(normalizeUrl('api.example.com/users/')).toBe('api.example.com/users')
	})

	it('handles a URL with a port', () => {
		expect(normalizeUrl('https://api.example.com:8080/users/')).toBe('https://api.example.com:8080/users')
	})

	it('handles a URL with several query params', () => {
		expect(normalizeUrl('https://api.example.com/search?q=test&page=1&size=10')).toBe('https://api.example.com/search')
	})
})

describe('makeHeadersKey', () => {
	it('builds a key from a valid method and URL', () => {
		expect(makeHeadersKey('GET', 'https://api.example.com/users')).toBe('GET:https://api.example.com/users')
		expect(makeHeadersKey('POST', 'https://api.example.com/users?id=123')).toBe('POST:https://api.example.com/users')
	})

	it('upper-cases the method', () => {
		expect(makeHeadersKey('get', 'https://api.example.com/users')).toBe('GET:https://api.example.com/users')
		expect(makeHeadersKey('Post', 'https://api.example.com/users')).toBe('POST:https://api.example.com/users')
		expect(makeHeadersKey('pUt', 'https://api.example.com/users')).toBe('PUT:https://api.example.com/users')
	})

	it('normalises the URL before building the key', () => {
		expect(makeHeadersKey('GET', 'https://api.example.com/users/')).toBe('GET:https://api.example.com/users')
		expect(makeHeadersKey('GET', 'https://api.example.com/users?id=123')).toBe('GET:https://api.example.com/users')
	})

	it('handles a null method', () => {
		expect(makeHeadersKey(null as unknown as string, 'https://api.example.com/users')).toBe(':https://api.example.com/users')
	})

	it('handles a null url', () => {
		expect(makeHeadersKey('GET', null as unknown as string)).toBe('GET:')
	})

	it('handles an undefined method', () => {
		expect(makeHeadersKey(undefined as unknown as string, 'https://api.example.com/users')).toBe(':https://api.example.com/users')
	})

	it('handles an undefined url', () => {
		expect(makeHeadersKey('GET', undefined as unknown as string)).toBe('GET:')
	})

	it('handles an empty method', () => {
		expect(makeHeadersKey('', 'https://api.example.com/users')).toBe(':https://api.example.com/users')
	})

	it('handles an empty url', () => {
		expect(makeHeadersKey('GET', '')).toBe('GET:')
	})

	it('handles a lower-case method', () => {
		expect(makeHeadersKey('delete', 'https://api.example.com/users/1')).toBe('DELETE:https://api.example.com/users/1')
	})

	it('handles a mixed-case method', () => {
		expect(makeHeadersKey('GeT', 'https://api.example.com/users')).toBe('GET:https://api.example.com/users')
		expect(makeHeadersKey('CONnECT', 'https://api.example.com/users')).toBe('CONNECT:https://api.example.com/users')
	})

	it('builds the full key with normalizeUrl', () => {
		expect(makeHeadersKey('POST', 'https://api.example.com/api/v1/users/?page=1&size=10')).toBe('POST:https://api.example.com/api/v1/users')
	})

	it('handles a URL with spaces', () => {
		expect(makeHeadersKey('GET', '  https://api.example.com/users/  ')).toBe('GET:https://api.example.com/users')
	})
})