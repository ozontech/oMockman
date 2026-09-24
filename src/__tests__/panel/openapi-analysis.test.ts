import { describe, it, expect } from 'vitest'

import {
	detectType,
	extractRequestPath,
	findOperation,
	flattenJsonSchemaErrors,
	getByPointer,
	getResponseSchema,
	isOpenApiSpec,
	isRecord,
	normalizePathTemplate,
	parseResponseJson,
	propertyToIssuePath,
	resolveSchemaRefs,
	schemaErrorToIssue,
	schemaTypeLabel,
	toPathRegex,
	toText,
} from '../../panel/app/mocks/addMock/openapi-analysis'

import type { RecordLike } from '@/interface/openapi'

describe('getByPointer', () => {
	it('extracts by pointer', () => {
		const spec = { paths: { users: { get: { summary: 'Get users' } } } }
		expect(getByPointer(spec, '#/paths/users/get/summary')).toBe('Get users')
	})

	it('handles an invalid pointer', () => {
		const spec = { foo: 'bar' }
		expect(getByPointer(spec, 'not-a-pointer')).toBeUndefined()
	})

	it('unescapes ~1 to /', () => {
		const spec = { paths: { users: { name: 'test' } } }
		expect(getByPointer(spec, '#/paths/users/name')).toBe('test')
	})

	it('unescapes ~0 to ~', () => {
		const spec = { paths: { 'user~name': { get: {} } } }
		expect(getByPointer(spec, '#/paths/user~0name')).toEqual({ get: {} })
	})

	it('returns undefined for a missing path', () => {
		const spec = { foo: 'bar' }
		expect(getByPointer(spec, '#/not/exists')).toBeUndefined()
	})

	it('handles arrays', () => {
		const spec = { items: [{ name: 'first' }, { name: 'second' }] }
		expect(getByPointer(spec, '#/items/0/name')).toBe('first')
		expect(getByPointer(spec, '#/items/1/name')).toBe('second')
	})
})

describe('normalizePathTemplate', () => {
	it('adds a leading slash', () => {
		expect(normalizePathTemplate('users')).toBe('/users')
	})

	it('removes a trailing slash', () => {
		expect(normalizePathTemplate('/users/')).toBe('/users')
	})

	it('returns / for an empty string', () => {
		expect(normalizePathTemplate('')).toBe('/')
		expect(normalizePathTemplate('   ')).toBe('/')
	})

	it('ignores query params', () => {
		expect(normalizePathTemplate('/users?id=1')).toBe('/users')
	})

	it('ignores the hash', () => {
		expect(normalizePathTemplate('/users#section')).toBe('/users')
	})

	it('keeps the slash for the root', () => {
		expect(normalizePathTemplate('/')).toBe('/')
	})
})

describe('toPathRegex', () => {
	it('converts a static path', () => {
		const result = toPathRegex('/users')
		expect(result.regex.test('/users')).toBe(true)
		expect(result.dynamicCount).toBe(0)
	})

	it('converts a path with parameters', () => {
		const result = toPathRegex('/users/{id}')
		expect(result.regex.test('/users/123')).toBe(true)
		expect(result.dynamicCount).toBe(1)
	})

	it('handles several parameters', () => {
		const result = toPathRegex('/users/{userId}/posts/{postId}')
		expect(result.regex.test('/users/1/posts/2')).toBe(true)
		expect(result.dynamicCount).toBe(2)
	})

	it('escapes special characters', () => {
		const result = toPathRegex('/api/v1.0/users')
		expect(result.regex.test('/api/v1.0/users')).toBe(true)
	})
})

describe('extractRequestPath', () => {
	it('extracts the path from a URL', () => {
		expect(extractRequestPath('https://api.example.com/users/123')).toBe('/users/123')
	})

	it('replaces templates', () => {
		expect(extractRequestPath('https://api.example.com/users/{{userId}}')).toBe('/users/mockman')
	})

	it('handles an empty URL', () => {
		expect(extractRequestPath('')).toBe('/')
	})

	it('normalises the path', () => {
		expect(extractRequestPath('http://example.com/api/v1/users/')).toBe('/api/v1/users')
	})

	it('works without a protocol', () => {
		expect(extractRequestPath('/api/users')).toBe('/api/users')
	})
})

describe('detectType', () => {
	it('detects null', () => {
		expect(detectType(null)).toBe('null')
	})

	it('detects an array', () => {
		expect(detectType([1, 2, 3])).toBe('array')
	})

	it('detects integer', () => {
		expect(detectType(42)).toBe('integer')
	})

	it('detects number (float)', () => {
		expect(detectType(3.14)).toBe('number')
	})

	it('detects string', () => {
		expect(detectType('hello')).toBe('string')
	})

	it('detects boolean', () => {
		expect(detectType(true)).toBe('boolean')
		expect(detectType(false)).toBe('boolean')
	})

	it('detects object', () => {
		expect(detectType({ foo: 'bar' })).toBe('object')
	})
})

describe('schemaTypeLabel', () => {
	it('string type', () => {
		expect(schemaTypeLabel({ type: 'string' })).toBe('string')
	})

	it('numeric type', () => {
		expect(schemaTypeLabel({ type: 'number' })).toBe('number')
	})

	it('array of types', () => {
		expect(schemaTypeLabel({ type: ['string', 'null'] })).toBe('string | null')
	})

	it('enum', () => {
		expect(schemaTypeLabel({ enum: ['a', 'b', 'c'] })).toBe('enum')
	})

	it('object with properties', () => {
		expect(schemaTypeLabel({ properties: { name: { type: 'string' } } })).toBe('object')
	})

	it('array with items', () => {
		expect(schemaTypeLabel({ items: { type: 'string' } })).toBe('array')
	})

	it('invalid schema', () => {
		expect(schemaTypeLabel('invalid')).toBe('unknown')
		expect(schemaTypeLabel(null)).toBe('unknown')
	})
})

describe('toText', () => {
	it('string', () => {
		expect(toText('hello')).toBe('hello')
	})

	it('null/undefined', () => {
		expect(toText(null)).toBe('null')
		expect(toText(undefined)).toBe('undefined')
	})

	it('number', () => {
		expect(toText(42)).toBe('42')
	})

	it('boolean', () => {
		expect(toText(true)).toBe('true')
		expect(toText(false)).toBe('false')
	})

	it('object', () => {
		expect(toText({ a: 1 })).toBe('{"a":1}')
	})

	it('array', () => {
		expect(toText([1, 2, 3])).toBe('[1,2,3]')
	})
})

describe('propertyToIssuePath', () => {
	it('normalises the path', () => {
		expect(propertyToIssuePath('instance.foo.bar')).toBe('$.foo.bar')
	})

	it('returns $ for an empty string', () => {
		expect(propertyToIssuePath('')).toBe('$')
		expect(propertyToIssuePath('   ')).toBe('$')
	})

	it('returns $ for a non-string value', () => {
		expect(propertyToIssuePath(null)).toBe('$')
		expect(propertyToIssuePath(123)).toBe('$')
	})

	it('keeps the path without instance', () => {
		expect(propertyToIssuePath('foo.bar')).toBe('foo.bar')
	})
})

describe('flattenJsonSchemaErrors', () => {
	it('flattens simple errors', () => {
		const errors = [
			{ name: 'required', property: 'instance.foo', message: 'required' },
			{ name: 'type', property: 'instance.bar', message: 'wrong type' },
		]
		const result: { name?: unknown; property?: unknown }[] = []
		flattenJsonSchemaErrors(errors, result)
		expect(result).toHaveLength(2)
	})

	it('flattens nested errors', () => {
		const errors = [
			{
				name: 'required',
				property: 'instance',
				subErrors: [
					{ name: 'type', property: 'instance.foo' },
				],
			},
		]
		const result: { name?: unknown; property?: unknown }[] = []
		flattenJsonSchemaErrors(errors, result)
		expect(result).toHaveLength(2)
	})

	it('handles undefined errors', () => {
		const result: { name?: unknown }[] = []
		flattenJsonSchemaErrors(undefined, result)
		expect(result).toHaveLength(0)
	})

	it('handles invalid errors', () => {
		const result: { name?: unknown }[] = []
		flattenJsonSchemaErrors([null, 'string', 123], result)
		expect(result).toHaveLength(0)
	})
})

describe('parseResponseJson', () => {
	it('parses valid JSON', () => {
		const result = parseResponseJson('{"foo":"bar"}')
		expect(result.ok).toBe(true)
		expect((result as { ok: true; value: unknown }).value).toEqual({ foo: 'bar' })
	})

	it('handles an empty string', () => {
		const result = parseResponseJson('')
		expect(result.ok).toBe(true)
		expect((result as { ok: true; value: unknown }).value).toBeUndefined()
	})

	it('handles whitespace', () => {
		const result = parseResponseJson('   ')
		expect(result.ok).toBe(true)
		expect((result as { ok: true; value: unknown }).value).toBeUndefined()
	})

	it('handles invalid JSON', () => {
		const result = parseResponseJson('{invalid}')
		expect(result.ok).toBe(false)
		expect((result as { ok: false; error: string }).error).toBeDefined()
	})

	it('handles null input', () => {
		const result = parseResponseJson(null as unknown as string)
		expect(result.ok).toBe(true)
		expect((result as { ok: true; value: unknown }).value).toBeUndefined()
	})
})

describe('isOpenApiSpec', () => {
	it('spec with an openapi version', () => {
		const spec = { openapi: '3.0.0', info: { title: 'Test', version: '1.0' }, paths: {} }
		expect(isOpenApiSpec(spec)).toBe(true)
	})

	it('spec with a swagger version', () => {
		const spec = { swagger: '2.0', info: { title: 'Test', version: '1.0' }, paths: {} }
		expect(isOpenApiSpec(spec)).toBe(true)
	})

	it('invalid spec without paths', () => {
		const spec = { openapi: '3.0.0', info: { title: 'Test', version: '1.0' } }
		expect(isOpenApiSpec(spec)).toBe(false)
	})

	it('spec without info', () => {
		const spec = { openapi: '3.0.0', paths: {} }
		expect(isOpenApiSpec(spec)).toBe(true)
	})

	it('invalid spec: a string', () => {
		expect(isOpenApiSpec('invalid')).toBe(false)
	})

	it('invalid spec: null', () => {
		expect(isOpenApiSpec(null)).toBe(false)
	})
})

describe('resolveSchemaRefs', () => {
	it('resolves a simple $ref', () => {
		const spec: RecordLike = {
			definitions: {
				User: { type: 'object', properties: { name: { type: 'string' } } },
			},
		}
		const schema: RecordLike = { $ref: '#/definitions/User' }
		const resolved = resolveSchemaRefs(schema, spec)
		expect(resolved).toEqual({ type: 'object', properties: { name: { type: 'string' } } })
	})

	it('keeps extra fields next to $ref', () => {
		const spec: RecordLike = {
			definitions: { User: { type: 'string' } },
		}
		const schema: RecordLike = { $ref: '#/definitions/User', description: 'test' }
		const resolved = resolveSchemaRefs(schema, spec)
		expect(resolved).toEqual({ type: 'string', description: 'test' })
	})

	it('handles nullable', () => {
		const schema: RecordLike = { type: 'string', nullable: true }
		const resolved = resolveSchemaRefs(schema, {})
		expect(resolved).toEqual({ type: ['string', 'null'] })
	})

	it('handles an array', () => {
		const schema: RecordLike = { items: { type: 'string' } }
		const resolved = resolveSchemaRefs(schema, {})
		expect(resolved).toEqual({ items: { type: 'string' } })
	})

	it('handles external refs', () => {
		const schema: RecordLike = { $ref: 'external/schema' }
		const resolved = resolveSchemaRefs(schema, {})
		expect(resolved).toEqual({ $ref: 'external/schema' })
	})
})

describe('getResponseSchema', () => {
	const createOperation = (responses: RecordLike): RecordLike => ({
		responses,
	})

	it('matches the status exactly', () => {
		const operation = createOperation({
			200: { content: { 'application/json': { schema: { type: 'object' } } } },
			404: { content: { 'application/json': { schema: { type: 'string' } } } },
		})
		const schema = getResponseSchema(operation, 200)
		expect(schema).toEqual({ type: 'object' })
	})

	it('falls back to 2xx', () => {
		const operation = createOperation({
			201: { content: { 'application/json': { schema: { type: 'object' } } } },
		})
		const schema = getResponseSchema(operation, 201)
		expect(schema).toEqual({ type: 'object' })
	})

	it('falls back to default', () => {
		const operation = createOperation({
			default: { content: { 'application/json': { schema: { type: 'string' } } } },
		})
		const schema = getResponseSchema(operation, 404)
		expect(schema).toEqual({ type: 'string' })
	})

	it('returns undefined when there are no responses', () => {
		const schema = getResponseSchema({}, 200)
		expect(schema).toBeUndefined()
	})

	it('handles a +json mime type', () => {
		const operation = createOperation({
			200: { content: { 'application/vnd.api+json': { schema: { type: 'object' } } } },
		})
		const schema = getResponseSchema(operation, 200)
		expect(schema).toEqual({ type: 'object' })
	})
})

describe('findOperation', () => {
	const createSpec = (paths: RecordLike): RecordLike => ({ paths })

	it('matches path and method exactly', () => {
		const spec = createSpec({
			'/users': { get: { operationId: 'getUsers' } },
		})
		const result = findOperation(spec, 'get', 'http://example.com/users')
		expect(result?.operationId).toBe('getUsers')
	})

	it('matches by template', () => {
		const spec = createSpec({
			'/users/{id}': { get: { operationId: 'getUser' } },
		})
		const result = findOperation(spec, 'get', 'http://example.com/users/123')
		expect(result?.operationId).toBe('getUser')
	})

	it('prefers the more specific template', () => {
		const spec = createSpec({
			'/users/{id}': { get: { operationId: 'getUser' } },
			'/users/{id}/posts/{postId}': { get: { operationId: 'getPost' } },
		})
		const result = findOperation(spec, 'get', 'http://example.com/users/123/posts/456')
		expect(result?.operationId).toBe('getPost')
	})

	it('returns undefined for a missing path', () => {
		const spec = createSpec({
			'/users': { get: {} },
		})
		const result = findOperation(spec, 'get', 'http://example.com/posts')
		expect(result).toBeUndefined()
	})

	it('matches the method case-insensitively', () => {
		const spec = createSpec({
			'/users': { get: { operationId: 'getUsers' } },
		})
		const result = findOperation(spec, 'GET', 'http://example.com/users')
		expect(result?.operationId).toBe('getUsers')
	})
})

describe('schemaErrorToIssue', () => {
	it('required error', () => {
		const error = { name: 'required', property: 'instance.foo', argument: 'bar' }
		const issue = schemaErrorToIssue(error as never)
		expect(issue.path).toBe('$.foo.bar')
		expect(issue.message).toBe('required property is missing')
	})

	it('additionalProperties error', () => {
		const error = { name: 'additionalProperties', property: 'instance', argument: 'unknown' }
		const issue = schemaErrorToIssue(error as never)
		expect(issue.path).toBe('$.unknown')
		expect(issue.message).toBe('property is not declared in schema')
	})

	it('type error', () => {
		const error = { name: 'type', property: 'instance', argument: 'string', instance: 123 }
		const issue = schemaErrorToIssue(error as never)
		expect(issue.message).toBe('type mismatch: expected string, got integer')
	})

	it('enum error', () => {
		const error = { name: 'enum', property: 'instance.status', argument: ['active', 'inactive'], instance: 'unknown' }
		const issue = schemaErrorToIssue(error as never)
		expect(issue.message).toContain('value is not in enum')
		expect(issue.enumRawValues).toEqual(['active', 'inactive'])
	})

	it('const error', () => {
		const error = { name: 'const', property: 'instance', argument: 'value', instance: 'other' }
		const issue = schemaErrorToIssue(error as never)
		expect(issue.message).toBe('value must be value')
	})

	it('fallback error', () => {
		const error = { name: 'unknown', property: 'instance', message: 'some error' }
		const issue = schemaErrorToIssue(error as never)
		expect(issue.message).toBe('some error')
	})

	it('oneOf error', () => {
		const error = { name: 'oneOf', property: 'instance' }
		const issue = schemaErrorToIssue(error as never)
		expect(issue.message).toContain('oneOf')
	})

	it('anyOf error', () => {
		const error = { name: 'anyOf', property: 'instance' }
		const issue = schemaErrorToIssue(error as never)
		expect(issue.message).toContain('anyOf')
	})

	it('fallback without message', () => {
		const error = { name: 'unknown', property: 'instance', stack: 'error stack' }
		const issue = schemaErrorToIssue(error as never)
		expect(issue.message).toBe('error stack')
	})
})

describe('isRecord', () => {
	it('true for an object', () => {
		expect(isRecord({})).toBe(true)
		expect(isRecord({ foo: 'bar' })).toBe(true)
	})

	it('false for null', () => {
		expect(isRecord(null)).toBe(false)
	})

	it('false for primitives', () => {
		expect(isRecord('string')).toBe(false)
		expect(isRecord(123)).toBe(false)
		expect(isRecord(true)).toBe(false)
		expect(isRecord(undefined)).toBe(false)
	})

	it('for an array', () => {
		expect(isRecord([])).toBe(true)
	})
})
