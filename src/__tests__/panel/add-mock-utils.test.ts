import { describe, it, expect, vi } from 'vitest'

import { safeNumberInt } from '@/services/number'
import { MethodEnum } from '@/interface'
import { buildMockPayload, isAddMockFormValid } from '@/panel/app/mocks/addMock/utils'

vi.stubGlobal('safeNumberInt', safeNumberInt)

describe('buildMockPayload', () => {
	it('builds a payload with defaults', () => {
		const result = buildMockPayload({})

		expect(result.name).toBe('')
		expect(result.url).toBe('')
		expect(result.method).toBe(MethodEnum.GET)
		expect(result.status).toBe(200)
		expect(result.active).toBe(true)
		expect(result.response).toBe('')
		expect(result.headers).toEqual([])
		expect(result.description).toBe('')
		expect(result.dynamic).toBe(false)
		expect(result.collectionId).toBeNull()
	})

	it('uses the given values', () => {
		const result = buildMockPayload({
			id: 'test-id',
			name: 'Test Mock',
			url: '/api/test',
			openApiUrl: '  https://api.example.com  ',
			method: MethodEnum.POST,
			status: 201,
			delay: 500,
			active: false,
			response: '{"test": true}',
			headers: [{ name: 'Content-Type', value: 'application/json' }],
			description: 'Test description',
			createdOn: 1234567890,
			dynamic: true,
			collectionId: 'col-1',
		})

		expect(result.id).toBe('test-id')
		expect(result.name).toBe('Test Mock')
		expect(result.url).toBe('/api/test')
		expect(result.openApiUrl).toBe('https://api.example.com')
		expect(result.method).toBe(MethodEnum.POST)
		expect(result.status).toBe(201)
		expect(result.delay).toBe(500)
		expect(result.active).toBe(false)
		expect(result.response).toBe('{"test": true}')
		expect(result.headers).toEqual([{ name: 'Content-Type', value: 'application/json' }])
		expect(result.description).toBe('Test description')
		expect(result.createdOn).toBe(1234567890)
		expect(result.dynamic).toBe(true)
		expect(result.collectionId).toBe('col-1')
	})

	it('trims openApiUrl', () => {
		const result1 = buildMockPayload({ openApiUrl: '  https://api.example.com  ' })
		expect(result1.openApiUrl).toBe('https://api.example.com')

		const result2 = buildMockPayload({ openApiUrl: '   ' })
		expect(result2.openApiUrl).toBeUndefined()
	})

	it('handles delay', () => {
		expect(buildMockPayload({ delay: 100 }).delay).toBe(100)
		expect(buildMockPayload({ delay: undefined }).delay).toBeUndefined()
		expect(buildMockPayload({ delay: null as unknown as undefined }).delay).toBeUndefined()
	})

	it('handles headers', () => {
		expect(buildMockPayload({ headers: [{ name: 'X-Test', value: 'value' }] }).headers).toEqual([{ name: 'X-Test', value: 'value' }])
		expect(buildMockPayload({ headers: 'not-array' as unknown as undefined }).headers).toEqual([])
		expect(buildMockPayload({}).headers).toEqual([])
	})
})

describe('isAddMockFormValid', () => {
	it('returns false without name', () => {
		expect(isAddMockFormValid({ url: '/api/test', status: 200 })).toBe(false)
	})

	it('returns false without url', () => {
		expect(isAddMockFormValid({ name: 'Test', status: 200 })).toBe(false)
	})

	it('returns false without status', () => {
		expect(isAddMockFormValid({ name: 'Test', url: '/api/test' })).toBe(false)
	})

	it('returns false for an invalid delay', () => {
		expect(isAddMockFormValid({ name: 'Test', url: '/api/test', status: 200, delay: 'invalid' as unknown as number })).toBe(false)
	})

	it('returns false for an invalid JSON response', () => {
		expect(isAddMockFormValid({ name: 'Test', url: '/api/test', status: 200, response: 'invalid{json' })).toBe(false)
	})

	it('returns true for a valid JSON response', () => {
		expect(isAddMockFormValid({ name: 'Test', url: '/api/test', status: 200, response: '{"key": "value"}' })).toBe(true)
	})

	it('returns true for an empty response', () => {
		expect(isAddMockFormValid({ name: 'Test', url: '/api/test', status: 200, response: '' })).toBe(true)
	})

	it('returns false for a header without name or value', () => {
		expect(isAddMockFormValid({ name: 'Test', url: '/api/test', status: 200, headers: [{ name: '', value: 'value' }] })).toBe(false)
		expect(isAddMockFormValid({ name: 'Test', url: '/api/test', status: 200, headers: [{ name: 'Header', value: '' }] })).toBe(false)
	})

	it('returns true for valid headers', () => {
		expect(isAddMockFormValid({ name: 'Test', url: '/api/test', status: 200, headers: [{ name: 'X-Test', value: 'value' }] })).toBe(true)
	})

	it('returns true for a fully valid form', () => {
		expect(isAddMockFormValid({
			name: 'Test',
			url: '/api/test',
			status: 200,
			delay: 100,
			response: '{"data": "test"}',
			headers: [{ name: 'Content-Type', value: 'application/json' }],
		})).toBe(true)
	})
})
