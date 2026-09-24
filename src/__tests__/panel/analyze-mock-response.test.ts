import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import {
	analyzeMockResponseByOpenApi,
	initialOpenApiValidationState,
} from '../../panel/app/mocks/addMock/openapi-analysis'

describe('analyzeMockResponseByOpenApi', () => {
	let sendMessageSpy: ReturnType<typeof vi.spyOn>

	beforeEach(() => {
		sendMessageSpy = vi.spyOn(browser.runtime, 'sendMessage').mockResolvedValue({
			ok: true,
			sourceUrl: 'https://api.example.com/openapi.json',
			spec: {
				openapi: '3.0.0',
				info: { title: 'Test', version: '1.0' },
				paths: {},
			},
		})
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	const setMockResponse = (response: unknown) => {
		sendMessageSpy.mockResolvedValue(response)
	}

	it('returns the idle state for an empty specUrl', async () => {
		const result = await analyzeMockResponseByOpenApi({
			specUrl: '',
			requestUrl: 'http://example.com/users',
			method: 'GET',
			status: 200,
			responseBody: '{}',
		})
		expect(result).toEqual(initialOpenApiValidationState)
	})

	it('returns an error for an invalid URL', async () => {
		const result = await analyzeMockResponseByOpenApi({
			specUrl: 'not-a-url',
			requestUrl: 'http://example.com/users',
			method: 'GET',
			status: 200,
			responseBody: '{}',
		})
		expect(result.status).toBe('error')
		expect(result.message).toContain('absolute URL')
	})

	it('returns an error for an unsupported protocol', async () => {
		const result = await analyzeMockResponseByOpenApi({
			specUrl: 'file:///path/to/spec.json',
			requestUrl: 'http://example.com/users',
			method: 'GET',
			status: 200,
			responseBody: '{}',
		})
		expect(result.status).toBe('error')
		expect(result.message).toContain('http/https')
	})

	it('returns an error when fetch fails', async () => {
		setMockResponse({
			ok: false,
			error: 'Network error',
		})

		const result = await analyzeMockResponseByOpenApi({
			specUrl: 'https://api.example.com/openapi.json',
			requestUrl: 'http://example.com/users',
			method: 'GET',
			status: 200,
			responseBody: '{}',
		})
		expect(result.status).toBe('error')
		expect(result.message).toBe('Network error')
	})

	it('returns an error for an invalid spec', async () => {
		setMockResponse({
			ok: true,
			sourceUrl: 'https://api.example.com/openapi.json',
			spec: { paths: {} },
		})

		const result = await analyzeMockResponseByOpenApi({
			specUrl: 'https://api.example.com/openapi.json',
			requestUrl: 'http://example.com/users',
			method: 'GET',
			status: 200,
			responseBody: '{}',
		})
		expect(result.status).toBe('error')
		expect(result.message).toContain('not a valid OpenAPI')
	})

	it('returns an error when the operation is not found', async () => {
		setMockResponse({
			ok: true,
			sourceUrl: 'https://api.example.com/openapi.json',
			spec: {
				openapi: '3.0.0',
				info: { title: 'Test', version: '1.0' },
				paths: {
					'/users': { get: { responses: { 200: { content: { 'application/json': { schema: { type: 'object' } } } } } } },
				},
			},
		})

		const result = await analyzeMockResponseByOpenApi({
			specUrl: 'https://api.example.com/openapi.json',
			requestUrl: 'http://example.com/posts',
			method: 'GET',
			status: 200,
			responseBody: '{}',
		})
		expect(result.status).toBe('error')
		expect(result.message).toContain('Operation was not found')
	})

	it('returns an error when there is no response schema', async () => {
		setMockResponse({
			ok: true,
			sourceUrl: 'https://api.example.com/openapi.json',
			spec: {
				openapi: '3.0.0',
				info: { title: 'Test', version: '1.0' },
				paths: {
					'/users': { get: { responses: {} } },
				},
			},
		})

		const result = await analyzeMockResponseByOpenApi({
			specUrl: 'https://api.example.com/openapi.json',
			requestUrl: 'http://example.com/users',
			method: 'GET',
			status: 200,
			responseBody: '{}',
		})
		expect(result.status).toBe('error')
		expect(result.message).toContain('Response schema')
	})

	it('returns an error for invalid JSON in the response body', async () => {
		setMockResponse({
			ok: true,
			sourceUrl: 'https://api.example.com/openapi.json',
			spec: {
				openapi: '3.0.0',
				info: { title: 'Test', version: '1.0' },
				paths: {
					'/users': {
						get: {
							responses: {
								200: { content: { 'application/json': { schema: { type: 'object' } } } },
							},
						},
					},
				},
			},
		})

		const result = await analyzeMockResponseByOpenApi({
			specUrl: 'https://api.example.com/openapi.json',
			requestUrl: 'http://example.com/users',
			method: 'GET',
			status: 200,
			responseBody: '{invalid json}',
		})
		expect(result.status).toBe('error')
		expect(result.message).toContain('Response JSON is invalid')
	})

	it('returns ready with issues for an invalid response', async () => {
		setMockResponse({
			ok: true,
			sourceUrl: 'https://api.example.com/openapi.json',
			spec: {
				openapi: '3.0.0',
				info: { title: 'Test', version: '1.0' },
				paths: {
					'/users': {
						get: {
							responses: {
								200: { content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' } } } } } },
							},
						},
					},
				},
			},
		})

		const result = await analyzeMockResponseByOpenApi({
			specUrl: 'https://api.example.com/openapi.json',
			requestUrl: 'http://example.com/users',
			method: 'GET',
			status: 200,
			responseBody: '{"name": 123}',
		})
		expect(result.status).toBe('ready')
		expect(result.issues.length).toBeGreaterThan(0)
	})

	it('returns ready without issues for a valid response', async () => {
		setMockResponse({
			ok: true,
			sourceUrl: 'https://api.example.com/openapi.json',
			spec: {
				openapi: '3.0.0',
				info: { title: 'Test', version: '1.0' },
				paths: {
					'/users': {
						get: {
							responses: {
								200: { content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' } } } } } },
							},
						},
					},
				},
			},
		})

		const result = await analyzeMockResponseByOpenApi({
			specUrl: 'https://api.example.com/openapi.json',
			requestUrl: 'http://example.com/users',
			method: 'GET',
			status: 200,
			responseBody: '{"name": "test"}',
		})
		expect(result.status).toBe('ready')
		expect(result.message).toBe('Response matches schema.')
		expect(result.issues).toHaveLength(0)
	})

	it('falls back to 2xx when there is no exact status', async () => {
		setMockResponse({
			ok: true,
			sourceUrl: 'https://api.example.com/openapi.json',
			spec: {
				openapi: '3.0.0',
				info: { title: 'Test', version: '1.0' },
				paths: {
					'/users': {
						get: {
							responses: {
								201: { content: { 'application/json': { schema: { type: 'object' } } } },
							},
						},
					},
				},
			},
		})

		const result = await analyzeMockResponseByOpenApi({
			specUrl: 'https://api.example.com/openapi.json',
			requestUrl: 'http://example.com/users',
			method: 'GET',
			status: 201,
			responseBody: '{}',
		})
		expect(result.status).toBe('ready')
	})

	it('falls back to default when there is no 2xx', async () => {
		setMockResponse({
			ok: true,
			sourceUrl: 'https://api.example.com/openapi.json',
			spec: {
				openapi: '3.0.0',
				info: { title: 'Test', version: '1.0' },
				paths: {
					'/users': {
						get: {
							responses: {
								default: { content: { 'application/json': { schema: { type: 'object' } } } },
							},
						},
					},
				},
			},
		})

		const result = await analyzeMockResponseByOpenApi({
			specUrl: 'https://api.example.com/openapi.json',
			requestUrl: 'http://example.com/users',
			method: 'GET',
			status: 404,
			responseBody: '{}',
		})
		expect(result.status).toBe('ready')
	})

	it('suggests fixes for required fields', async () => {
		setMockResponse({
			ok: true,
			sourceUrl: 'https://api.example.com/openapi.json',
			spec: {
				openapi: '3.0.0',
				info: { title: 'Test', version: '1.0' },
				paths: {
					'/users': {
						post: {
							responses: {
								200: {
									content: {
										'application/json': {
											schema: {
												type: 'object',
												required: ['name', 'email'],
												properties: {
													name: { type: 'string' },
													email: { type: 'string' },
													age: { type: 'integer' },
												},
											},
										},
									},
								},
							},
						},
					},
				},
			},
		})

		const result = await analyzeMockResponseByOpenApi({
			specUrl: 'https://api.example.com/openapi.json',
			requestUrl: 'http://example.com/users',
			method: 'POST',
			status: 200,
			responseBody: '{}',
		})
		expect(result.status).toBe('ready')
		expect(result.suggestions.length).toBeGreaterThan(0)
		const requiredSuggestions = result.suggestions.filter((s) => s.required)
		expect(requiredSuggestions.length).toBe(2)
	})

	it('suggests fixes for enum fields', async () => {
		setMockResponse({
			ok: true,
			sourceUrl: 'https://api.example.com/openapi.json',
			spec: {
				openapi: '3.0.0',
				info: { title: 'Test', version: '1.0' },
				paths: {
					'/users': {
						get: {
							responses: {
								200: {
									content: {
										'application/json': {
											schema: {
												type: 'object',
												properties: {
													status: { type: 'string', enum: ['active', 'inactive'] },
												},
											},
										},
									},
								},
							},
						},
					},
				},
			},
		})

		const result = await analyzeMockResponseByOpenApi({
			specUrl: 'https://api.example.com/openapi.json',
			requestUrl: 'http://example.com/users',
			method: 'GET',
			status: 200,
			responseBody: '{}',
		})
		expect(result.suggestions.some((s) => s.enumValues.length > 0)).toBe(true)
	})

	it('handles whitespace in responseBody', async () => {
		setMockResponse({
			ok: true,
			sourceUrl: 'https://api.example.com/openapi.json',
			spec: {
				openapi: '3.0.0',
				info: { title: 'Test', version: '1.0' },
				paths: {
					'/users': {
						get: {
							responses: {
								200: { content: { 'application/json': { schema: { type: 'object' } } } },
							},
						},
					},
				},
			},
		})

		const result = await analyzeMockResponseByOpenApi({
			specUrl: 'https://api.example.com/openapi.json',
			requestUrl: 'http://example.com/users',
			method: 'GET',
			status: 200,
			responseBody: '   ',
		})
		expect(result.status).toBe('ready')
		expect(result.issues).toHaveLength(0)
	})
})