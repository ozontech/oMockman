import { describe, it, expect } from 'vitest'

import { getMockFromLog } from '@/panel/app/logs'
import type { ILog } from '@/interface'
import { MethodEnum } from '@/interface'

describe('getMockFromLog', () => {
	it('creates a mock from a full log', () => {
		const log: ILog = {
			request: { method: 'POST', url: '/api/users', body: '{}', headers: [], queryParams: '' },
			response: { status: 201, response: '{"id": 1}', headers: [{ name: 'Content-Type', value: 'application/json' }] },
		}
		const result = getMockFromLog(log)

		expect(result.active).toBe(true)
		expect(result.method).toBe(MethodEnum.POST)
		expect(result.url).toBe('/api/users')
		expect(result.status).toBe(201)
		expect(result.response).toBe('{"id": 1}')
		expect(result.headers).toEqual([{ name: 'Content-Type', value: 'application/json' }])
		expect(result.description).toBe('')
		expect(result.createdOn).toBeCloseTo(Date.now(), -3)
	})

	it('uses defaults for missing fields', () => {
		const log: ILog = {}
		const result = getMockFromLog(log)

		expect(result.active).toBe(true)
		expect(result.method).toBe(MethodEnum.GET)
		expect(result.url).toBe('/some-url')
		expect(result.status).toBe(200)
		expect(result.response).toBe('')
		expect(result.headers).toEqual([])
		expect(result.description).toBe('')
	})

	it('takes status from the response', () => {
		const log: ILog = {
			request: { method: 'GET', url: '/api/test', headers: [], queryParams: '' },
			response: { status: 404, response: 'Not Found', headers: [] },
		}
		const result = getMockFromLog(log)
		expect(result.status).toBe(404)
	})

	it('takes method from the request', () => {
		const log: ILog = {
			request: { method: 'DELETE', url: '/api/item', headers: [], queryParams: '' },
			response: { status: 204, response: '', headers: [] },
		}
		const result = getMockFromLog(log)
		expect(result.method).toBe(MethodEnum.DELETE)
	})

	it('takes url from the request', () => {
		const log: ILog = {
			request: { method: 'GET', url: '/custom/path', headers: [], queryParams: '' },
			response: { status: 200, response: '{}', headers: [] },
		}
		const result = getMockFromLog(log)
		expect(result.url).toBe('/custom/path')
	})

	it('takes the body from the response', () => {
		const log: ILog = {
			request: { method: 'GET', url: '/api/data', headers: [], queryParams: '' },
			response: { status: 200, response: 'custom response data', headers: [] },
		}
		const result = getMockFromLog(log)
		expect(result.response).toBe('custom response data')
	})

	it('takes headers from the response', () => {
		const log: ILog = {
			request: { method: 'GET', url: '/api/data', headers: [], queryParams: '' },
			response: {
				status: 200,
				response: '{}',
				headers: [
					{ name: 'X-Custom', value: 'header' },
					{ name: 'Cache-Control', value: 'no-cache' },
				],
			},
		}
		const result = getMockFromLog(log)
		expect(result.headers).toEqual([
			{ name: 'X-Custom', value: 'header' },
			{ name: 'Cache-Control', value: 'no-cache' },
		])
	})

	it('derives the endpoint name from the URL (instead of unnamed on export)', () => {
		const log: ILog = {
			request: { method: 'POST', url: 'https://api.app.com/v1/goals?x=1', headers: [], queryParams: '' },
			response: { status: 200, response: '{}', headers: [] },
		}
		const result = getMockFromLog(log)
		// the host is dropped, the path is joined with '-', the query is ignored
		expect(result.name).toBe('v1-goals')
	})

	it('leaves name empty when the URL has no path', () => {
		const log: ILog = {
			request: { method: 'GET', url: 'https://app.com/', headers: [], queryParams: '' },
			response: { status: 200, response: '{}', headers: [] },
		}
		const result = getMockFromLog(log)
		expect(result.name).toBeUndefined()
	})

	it('does not copy a response body that was too large to capture', () => {
		const log: ILog = {
			request: { method: 'GET', url: '/api/huge', headers: [], queryParams: '' },
			response: { status: 200, response: '', headers: [], tooLarge: true, size: 25 * 1024 * 1024 },
		}
		const result = getMockFromLog(log)

		expect(result.response).toBe('')
		expect(result.responseTooLargeBytes).toBe(25 * 1024 * 1024)
	})

	it('leaves the too-large marker unset for a normal response', () => {
		const log: ILog = {
			request: { method: 'GET', url: '/api/ok', headers: [], queryParams: '' },
			response: { status: 200, response: '{}', headers: [] },
		}
		expect(getMockFromLog(log).responseTooLargeBytes).toBeUndefined()
	})
})

