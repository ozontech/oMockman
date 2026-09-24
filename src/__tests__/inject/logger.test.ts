import { describe, it, expect, vi } from 'vitest'

import type { ILog } from '@/interface'

vi.stubGlobal('window', {
	location: {
		origin: 'http://example.com',
		href: 'http://example.com',
	},
	addEventListener: vi.fn(),
})

vi.stubGlobal('history', {
	pushState: vi.fn(),
	replaceState: vi.fn(),
})

const { buildLog } = await import('../../inject/logger')

describe('buildLog', () => {
	it('builds a log with a string body', () => {
		const request = {
			url: 'http://example.com/api',
			method: 'POST' as const,
			body: 'test-body-string',
			headers: { 'Content-Type': 'application/json' },
			mockmanId: 'mock-123',
		}

		const result = buildLog(request) as ILog
		const req = result.request

		expect(result.id).toBe('mock-123')
		expect(req?.url).toBe('http://example.com/api')
		expect(req?.method).toBe('POST')
		expect(req?.body).toBe('test-body-string')
		expect(req?.headers).toEqual([
			{ name: 'Content-Type', value: 'application/json' },
		])
	})

	it('builds a log with an object body', () => {
		const request = {
			url: 'http://example.com/api',
			method: 'GET' as const,
			body: { key: 'value', nested: { a: 1 } },
			headers: {},
			mockmanId: 'mock-456',
		}

		const result = buildLog(request) as ILog
		expect(result.request).toBeDefined()
		expect(result.request?.body).toBe('{"key":"value","nested":{"a":1}}')
	})

	it('builds a log with a ReadableStream body', () => {
		const stream = new ReadableStream()
		const request = {
			url: 'http://example.com/api',
			method: 'GET' as const,
			body: stream,
			headers: {},
			mockmanId: 'mock-789',
		}

		const result = buildLog(request) as ILog
		expect(result.request).toBeDefined()
		expect(result.request?.body).toBe('Unsupported body type!')
	})

	it('builds a log with query params', () => {
		const request = {
			url: 'http://example.com/api?foo=bar&count=5',
			method: 'GET' as const,
			body: null,
			headers: {},
			mockmanId: 'mock-111',
		}

		const result = buildLog(request) as ILog
		const req = result.request

		expect(req?.url).toBe('http://example.com/api')
		expect(req?.queryParams).toContain('"foo"')
		expect(req?.queryParams).toContain('"bar"')
		expect(req?.queryParams).toContain('"count"')
		expect(req?.queryParams).toContain('"5"')
	})

	it('builds a log without a response', () => {
		const request = {
			url: 'http://example.com/api',
			method: 'GET' as const,
			body: null,
			headers: {},
		}

		const result = buildLog(request) as ILog

		expect(result.response).toBeUndefined()
	})

	it('builds a log with a response', () => {
		const request = {
			url: 'http://example.com/api',
			method: 'GET' as const,
			body: null,
			headers: {},
			mockmanId: 'mock-222',
		}
		const response = {
			status: 200,
			response: '{"success":true}',
			headers: [{ name: 'Content-Type', value: 'application/json' }],
		}

		const result = buildLog(request, response) as ILog

		expect(result.response).toEqual(response)
	})

	it('builds a log with a null body', () => {
		const request = {
			url: 'http://example.com/api',
			method: 'GET' as const,
			body: null,
			headers: {},
			mockmanId: 'mock-333',
		}

		const result = buildLog(request) as ILog
		expect(result.request).toBeDefined()
		expect(result.request?.body).toBe('null')
	})

	it('mockmanId is optional', () => {
		const request = {
			url: 'http://example.com/api',
			method: 'GET' as const,
			body: 'test',
			headers: {},
		}

		const result = buildLog(request) as ILog

		expect(result.id).toBeUndefined()
	})

	it('returns Unsupported body type for a circular reference', () => {
		const circular: Record<string, unknown> = { key: 'value' }
		circular.self = circular

		const request = {
			url: 'http://example.com/api',
			method: 'POST' as const,
			body: circular,
			headers: {},
			mockmanId: 'mock-circular',
		}

		const result = buildLog(request) as ILog

		expect(result.request?.body).toBe('Unsupported body type!')
	})
})
