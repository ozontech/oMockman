import { describe, expect, it } from 'vitest'

import { MethodEnum } from '@/interface/network'
import { buildMockPayload, isAddMockFormValid } from '@/panel/app/mocks/addMock/utils'
import { getMockFromLog } from '@/panel/app/logs/log-util'
import type { ILog } from '@/interface/mock'

const base = { name: 'order', url: 'https://example.com/api/orders', status: 200, method: MethodEnum.POST }
const REQUEST = { responseBody: false, responseHeaders: false, requestBody: true }

describe('mock form apply switches', () => {
	it('saves a request-only rule with a JSON body, and refuses broken JSON', () => {
		expect(isAddMockFormValid({ ...base, apply: REQUEST, requestPatch: { mode: 'replace', body: '{"a":1}' } })).toBe(true)
		expect(isAddMockFormValid({ ...base, apply: REQUEST, requestPatch: { mode: 'replace', body: '{"a":' } })).toBe(false)
	})

	it('refuses a request-only rule without a body draft', () => {
		expect(isAddMockFormValid({ ...base, apply: REQUEST })).toBe(false)
	})

	it('refuses a rule with everything off', () => {
		expect(isAddMockFormValid({ ...base, apply: { responseBody: false, responseHeaders: false, requestBody: false } })).toBe(false)
	})

	it('does not check a switched-off response body', () => {
		expect(isAddMockFormValid({ ...base, apply: REQUEST, response: '{broken', requestPatch: { mode: 'replace', body: '' } })).toBe(true)
		expect(isAddMockFormValid({ ...base, response: '{broken' })).toBe(false)
	})

	it('needs no status when the server answers', () => {
		expect(isAddMockFormValid({ ...base, status: undefined, apply: { responseBody: false, responseHeaders: true, requestBody: false } })).toBe(true)
	})

	it('stamps no creation date of its own', () => {
		expect('createdOn' in buildMockPayload({ ...base, id: 'm-1' })).toBe(false)
		expect(buildMockPayload({ ...base, id: 'm-1', createdOn: 5 }).createdOn).toBe(5)
	})

	it('saves the switches and keeps the body draft', () => {
		const apply = { responseBody: true, responseHeaders: false, requestBody: false }
		const payload = buildMockPayload({ ...base, id: 'm-1', apply, requestPatch: { mode: 'replace', body: 'x' } })
		expect(payload.apply).toEqual(apply)
		expect(payload.requestPatch).toEqual({ mode: 'replace', body: 'x' })
	})

	it('mocks the response by default for a mock made from a log', () => {
		const log = { request: { url: base.url, method: 'POST', headers: [], body: '{"qty":1}' } } as ILog
		expect(getMockFromLog(log).apply).toEqual({ responseBody: true, responseHeaders: true, requestBody: false })
	})

	it('drafts the request body from the log, the page body for a patched one', () => {
		const log = { request: { url: base.url, method: 'POST', headers: [], body: '{"qty":9}', originalBody: '{"qty":1}' } } as ILog
		expect(getMockFromLog(log).requestPatch).toEqual({ mode: 'replace', body: '{"qty":1}' })
		expect(getMockFromLog({ request: { url: base.url, method: 'GET', headers: [], body: '' } } as ILog).requestPatch).toBeUndefined()
	})
})
