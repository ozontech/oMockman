import { describe, it, expect, vi } from 'vitest'

import { classifyImport, coerceToRawMock, queuedItemToRaw } from '../../services'
import type { IMockResponse } from '../../interface/mock'
import { MethodEnum } from '../../interface'

vi.mock('@/panel/app/mocks/addMock/utils', () => ({
	buildMockPayload: vi.fn((values: Record<string, unknown>): IMockResponse => ({
		id: (values.id as string) || 'mock-id',
		name: (values.name as string) || '',
		url: (values.url as string) || '',
		openApiUrl: values.openApiUrl as string | undefined,
		method: (values.method as MethodEnum) || MethodEnum.GET,
		status: (values.status as number) || 200,
		delay: values.delay as number | undefined,
		active: values.active !== false,
		response: (values.response as string) || '',
		headers: [],
		description: (values.description as string) || '',
		createdOn: (values.createdOn as number) || Date.now(),
		dynamic: values.dynamic === true,
		collectionId: values.collectionId as string | null,
	})),
}))

describe('coerceToRawMock', () => {
	it('converts a valid object', () => {
		const input = {
			id: 'test-id',
			name: 'Test Mock',
			description: 'Test description',
			method: 'POST',
			url: '/api/users',
			openApiUrl: '/openapi',
			status: 201,
			response: '{"data": "test"}',
			headers: [{ name: 'Content-Type', value: 'application/json' }],
			delay: 100,
			active: true,
			createdOn: 1234567890,
			dynamic: false,
			collectionId: 'col-1',
		}
		const result = coerceToRawMock(input)
		expect(result).toEqual({
			id: 'test-id',
			name: 'Test Mock',
			description: 'Test description',
			method: 'POST',
			url: '/api/users',
			openApiUrl: '/openapi',
			status: 201,
			response: '{"data": "test"}',
			headers: [{ name: 'Content-Type', value: 'application/json' }],
			delay: 100,
			active: true,
			createdOn: 1234567890,
			dynamic: false,
			collectionId: 'col-1',
		})
	})

	it('converts an object without optional fields', () => {
		const input = { name: 'Test' }
		const result = coerceToRawMock(input)
		expect(result?.name).toBe('Test')
		expect(result?.id).toBeUndefined()
		// Missing numeric fields become undefined, not 0: optionalInt does not confuse
		// "empty" with zero. Without this an imported mock got delay/status/createdOn = 0.
		expect(result?.status).toBeUndefined()
		expect(result?.delay).toBeUndefined()
		expect(result?.createdOn).toBeUndefined()
	})

	it('keeps an explicit delay = 0', () => {
		const result = coerceToRawMock({ name: 'Test', delay: 0, status: 200 })
		// An explicit 0 is a valid value and must be kept, unlike a missing one
		expect(result?.delay).toBe(0)
		expect(result?.status).toBe(200)
	})

	it('handles null input', () => {
		expect(coerceToRawMock(null)).toBeUndefined()
	})

	it('handles undefined input', () => {
		expect(coerceToRawMock(undefined)).toBeUndefined()
	})

	it('handles primitives', () => {
		expect(coerceToRawMock('string')).toBeUndefined()
		expect(coerceToRawMock(123)).toBeUndefined()
		expect(coerceToRawMock(true)).toBeUndefined()
	})

	it('handles an array', () => {
		const input: unknown = []
		const result = coerceToRawMock(input as Record<string, unknown>)
		expect(result).toBeDefined()
		expect(result?.name).toBeUndefined()
	})

	it('handles a name with spaces', () => {
		const input = { name: '  Test Mock  ' }
		const result = coerceToRawMock(input)
		expect(result?.name).toBe('Test Mock')
	})

	it('handles name as null', () => {
		const input = { name: null }
		const result = coerceToRawMock(input)
		expect(result?.name).toBeUndefined()
	})

	it('handles name as undefined', () => {
		const input = { name: undefined }
		const result = coerceToRawMock(input)
		expect(result?.name).toBeUndefined()
	})

	it('handles response as an object', () => {
		const input = { response: { data: 'test' } }
		const result = coerceToRawMock(input)
		expect(result?.response).toBe('{"data":"test"}')
	})

	it('handles headers with invalid items', () => {
		const input = { headers: [{ name: 'Valid', value: 'header-value' }, { notName: 'test' }, { name: 123 }] }
		const result = coerceToRawMock(input)
		expect(result?.headers).toEqual([{ name: 'Valid', value: 'header-value' }])
	})

	it('handles active as false', () => {
		const input = { active: false }
		const result = coerceToRawMock(input)
		expect(result?.active).toBe(false)
	})

	it('handles active as true', () => {
		const input = { active: true }
		const result = coerceToRawMock(input)
		expect(result?.active).toBe(true)
	})

	it('handles dynamic as true', () => {
		const input = { dynamic: true }
		const result = coerceToRawMock(input)
		expect(result?.dynamic).toBe(true)
	})

	it('handles collectionId as null', () => {
		const input = { collectionId: null }
		const result = coerceToRawMock(input)
		expect(result?.collectionId).toBe(null)
	})

	it('handles collectionId as a number', () => {
		const input = { collectionId: 123 as unknown as string }
		const result = coerceToRawMock(input)
		expect(result?.collectionId).toBeUndefined()
	})
})

describe('queuedItemToRaw', () => {
	it('converts a valid object', () => {
		const input = { name: 'Test', url: '/api' }
		const result = queuedItemToRaw(input)
		expect(result?.name).toBe('Test')
	})

	it('handles undefined', () => {
		expect(queuedItemToRaw(undefined)).toBeUndefined()
	})

	it('handles null', () => {
		expect(queuedItemToRaw(null as unknown as undefined)).toBeUndefined()
	})
})

describe('classifyImport', () => {
	it('imports a single mock', () => {
		const input = { name: 'Test', url: '/api', status: 200 }
		const result = classifyImport(input)
		expect(result.valid).toHaveLength(1)
		expect(result.valid[0].name).toBe('Test')
	})

	it('imports an array of mocks', () => {
		const input = [
			{ name: 'Test1', url: '/api1', status: 200 },
			{ name: 'Test2', url: '/api2', status: 201 },
		]
		const result = classifyImport(input)
		expect(result.valid).toHaveLength(2)
	})

	it('lenient strategy without required fields', () => {
		const input = [{ name: 'Test' }]
		const result = classifyImport(input, { strategy: 'lenient' })
		expect(result.valid).toHaveLength(1)
		expect(result.toFix).toHaveLength(0)
	})

	it('strict strategy without required fields', () => {
		const input = [{ name: 'Test' }]
		const result = classifyImport(input, { strategy: 'strict' })
		expect(result.valid).toHaveLength(0)
		expect(result.toFix).toHaveLength(1)
	})

	it('imports a bundle', () => {
		const input = {
			type: 'mockman.export',
			version: 1,
			mocks: [{ name: 'Test', url: '/api', status: 200 }],
			collectionTree: {
				nodes: { 'col-1': { id: 'col-1', name: 'Collection', entries: [] } },
				root: [{ id: 'col-1', type: 'collection' }],
			},
		}
		const result = classifyImport(input)
		expect(result.package).toBeDefined()
		expect(result.package?.type).toBe('mockman.export')
		expect(result.valid).toHaveLength(1)
	})

	it('imports a bundle without collectionTree', () => {
		const input = {
			type: 'mockman.export',
			version: 1,
			mocks: [{ name: 'Test', url: '/api', status: 200 }],
		}
		const result = classifyImport(input)
		expect(result.valid).toHaveLength(0)
		expect(result.package).toBeUndefined()
	})

	it('handles an invalid bundle', () => {
		const input = { type: 'other', version: 1 }
		const result = classifyImport(input)
		expect(result.package).toBeUndefined()
		expect(result.valid).toHaveLength(0)
	})

	it('handles null input', () => {
		const result = classifyImport(null)
		expect(result.valid).toHaveLength(0)
		expect(result.toFix).toHaveLength(0)
	})

	it('handles an empty array', () => {
		const result = classifyImport([])
		expect(result.valid).toHaveLength(0)
	})

	it('handles a string', () => {
		const result = classifyImport('string')
		expect(result.valid).toHaveLength(0)
	})

	it('handles a number', () => {
		const result = classifyImport(123)
		expect(result.valid).toHaveLength(0)
	})

	it('bundle with a version', () => {
		const input = {
			type: 'mockman.export',
			version: 2,
			mocks: [{ name: 'Test', url: '/api', status: 200 }],
			collectionTree: { nodes: {}, root: [] },
		}
		const result = classifyImport(input)
		expect(result.package?.version).toBe(2)
	})

	it('bundle without a version', () => {
		const input = {
			type: 'mockman.export',
			mocks: [{ name: 'Test', url: '/api', status: 200 }],
			collectionTree: { nodes: {}, root: [] },
		}
		const result = classifyImport(input)
		expect(result.package?.version).toBe(1)
	})
})