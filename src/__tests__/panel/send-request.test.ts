import { describe, expect, it } from 'vitest'

import { buildSentLog } from '@/contentScript/sent-log'
import { requestFromLog, requestFromMock, sendableHeaders, sendBodyProblem } from '@/panel/app/service/send-request'
import type { ILog } from '@/interface/mock'
import { MethodEnum } from '@/interface/network'

const log = {
	request: {
		url: 'https://api.example.com/v3/tasks/query',
		method: 'POST',
		queryParams: JSON.stringify({ page: '2', tag: ['a', 'b'] }),
		headers: [
			{ name: 'Authorization', value: 'Bearer t' },
			{ name: 'Content-Type', value: 'application/json' },
			{ name: 'Cookie', value: 'sid=1' },
			{ name: 'sec-fetch-mode', value: 'cors' },
		],
		body: '{"limit":50}',
	},
} as unknown as ILog

describe('send request helpers', () => {
	it('rebuilds a logged request with its query, and drops the headers the browser sets', () => {
		expect(requestFromLog(log)).toEqual({
			method: 'POST',
			url: 'https://api.example.com/v3/tasks/query?page=2&tag=a&tag=b',
			headers: [
				{ name: 'Authorization', value: 'Bearer t' },
				{ name: 'Content-Type', value: 'application/json' },
			],
			body: '{"limit":50}',
			withCredentials: true,
		})
	})

	it('sends a rule body to its URL with the headers of the latest call there', () => {
		const older = { ...log, request: { ...log.request, headers: [{ name: 'Authorization', value: 'Bearer old' }] } } as ILog
		const mock = {
			method: MethodEnum.POST,
			url: '{BASE}/v3/tasks/query',
			requestPatch: { mode: 'replace' as const, body: '{"limit":1}' },
		}

		const { request, headersFrom } = requestFromMock(mock, [log, older], { BASE: 'https://api.example.com' })

		expect(headersFrom).toBe('endpoint')
		expect(request.url).toBe('https://api.example.com/v3/tasks/query')
		expect(request.body).toBe('{"limit":1}')
		expect(request.headers).toContainEqual({ name: 'Authorization', value: 'Bearer t' })
	})

	it('takes the token from another call to the same site when the endpoint was not called', () => {
		const other = {
			request: {
				url: 'https://api.example.com/v1/obstacles/list',
				method: 'GET',
				headers: [
					{ name: 'Authorization', value: 'Bearer site' },
					{ name: 'Content-Type', value: 'text/plain' },
					{ name: 'x-o3-app-name', value: 'fe-topology' },
				],
			},
		} as unknown as ILog
		const elsewhere = { request: { url: 'https://other.example.com/x', method: 'GET', headers: [{ name: 'Authorization', value: 'Bearer no' }] } } as unknown as ILog
		const mock = { method: MethodEnum.POST, url: 'https://api.example.com/v1/obstacles/get', requestPatch: { mode: 'replace' as const, body: '{"floor":0}' } }

		const { request, headersFrom } = requestFromMock(mock, [elsewhere, other], {})

		expect(headersFrom).toBe('site')
		expect(request.headers).toEqual([
			{ name: 'Authorization', value: 'Bearer site' },
			{ name: 'x-o3-app-name', value: 'fe-topology' },
			{ name: 'Content-Type', value: 'application/json' },
		])
	})

	it('says so when Logs have nothing from the site, and still sends JSON as JSON', () => {
		const mock = { method: MethodEnum.POST, url: 'https://api.example.com/v1/x', requestPatch: { mode: 'replace' as const, body: '{"a":1}' } }

		const { request, headersFrom } = requestFromMock(mock, [], {})

		expect(headersFrom).toBe('none')
		expect(request.headers).toEqual([{ name: 'Content-Type', value: 'application/json' }])
	})

	it('adds no Content-Type to an empty body, a GET or one that has it', () => {
		expect(requestFromMock({ method: MethodEnum.POST, url: 'https://a/x' }, [], {}).request.headers).toEqual([])
		expect(requestFromMock({ method: MethodEnum.GET, url: 'https://a/x', requestPatch: { mode: 'replace', body: '{}' } }, [], {}).request.headers).toEqual([])
	})

	it('keeps only headers a page may set', () => {
		expect(sendableHeaders([{ name: 'Host', value: 'x' }, { name: 'X-Env', value: 'stg' }])).toEqual([{ name: 'X-Env', value: 'stg' }])
	})

	describe('sendBodyProblem', () => {
		const base = { method: 'POST', url: 'https://x/y', headers: [], withCredentials: true }

		it('holds a JSON body to strict JSON, as the request body tab does', () => {
			expect(sendBodyProblem({ ...base, body: '{"a":1}' })).toBeNull()
			expect(sendBodyProblem({ ...base, body: '' })).toBeNull()
			expect(sendBodyProblem({ ...base, body: '{"a":' })).toBe('invalid_json')
			expect(sendBodyProblem({ ...base, headers: [{ name: 'Content-Type', value: 'application/json' }], body: '{,}' })).toBe('invalid_json')
		})

		it('lets a form or plain text go as it is', () => {
			const form = [{ name: 'content-type', value: 'application/x-www-form-urlencoded' }]
			expect(sendBodyProblem({ ...base, headers: form, body: 'a=1&b=2' })).toBeNull()
		})

		it('ignores the body of a GET, which is not sent', () => {
			expect(sendBodyProblem({ ...base, method: 'GET', body: '{oops' })).toBeNull()
		})
	})

	it('logs a sent request like the page own, marked as sent', () => {
		const sent = buildSentLog(
			{ method: 'post', url: 'https://api.example.com/orders?x=1', headers: [], body: '{}', withCredentials: true },
			{ ok: true, status: 200, statusText: 'OK', headers: [], body: '{"ok":1}', durationMs: 5, url: 'https://api.example.com/orders?x=1' },
		)

		expect(sent).toMatchObject({
			request: { url: 'https://api.example.com/orders', method: 'POST', queryParams: '{"x":"1"}', body: '{}' },
			response: { status: 200, response: '{"ok":1}' },
			isMocked: false,
			sentByMockman: true,
		})
	})
})
