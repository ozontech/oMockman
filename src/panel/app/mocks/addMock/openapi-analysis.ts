import { Validator } from 'jsonschema'

import { fetchOpenApiSpecByRuntime } from './openapi-spec-gateway'

import type {
	IOpenApiFetchResult,
	OpenApiSuggestionCollectContext,
	OpenApiValidationEnumHint,
	OpenApiValidationIssue,
	OpenApiValidationState,
	OpenApiValidationSuggestion,
	RecordLike,
} from '@/interface/openapi'
import { normalizeUrl } from '@/services/url'

const SUGGESTIONS_MAX_DURATION_MS = 60

export const initialOpenApiValidationState: OpenApiValidationState = {
	status: 'idle',
	message: '',
	issues: [],
	suggestions: [],
	enumHints: [],
	suggestionsTruncated: false,
}

export function isRecord(value: unknown): value is RecordLike {
	return typeof value === 'object' && value !== null
}

export function getByPointer(root: unknown, pointer: string): unknown {
	if (!pointer.startsWith('#/')) return undefined
	const segments = pointer.slice(2).split('/').map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'))
	let current: unknown = root
	for (const segment of segments) {
		if (!isRecord(current) && !Array.isArray(current)) return undefined
		current = (current as Record<string, unknown>)[segment]
	}
	return current
}

export function normalizePathTemplate(rawPath: string): string {
	const clean = String(rawPath || '').split('?')[0].split('#')[0].trim()
	if (!clean) return '/'
	const startsWithSlash = clean.startsWith('/')
	const normalized = startsWithSlash ? clean : `/${clean}`
	return normalized.length > 1 ? normalized.replace(/\/+$/, '') : normalized
}

export function toPathRegex(pathTemplate: string): { regex: RegExp; dynamicCount: number } {
	const escaped = pathTemplate.replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&')
	const withParams = escaped.replace(/\\\{[^}]+\\\}/g, '[^/]+')
	const dynamicCount = (pathTemplate.match(/\{[^}]+\}/g) || []).length
	return {
		regex: new RegExp(`^${withParams}$`),
		dynamicCount,
	}
}

export function extractRequestPath(requestUrl: string): string {
	const raw = String(requestUrl ?? '').trim()
	if (!raw) return '/'
	const replacedTemplates = raw.replace(/\{\{[^}]+\}\}/g, 'mockman')
	try {
		const parsed = new URL(replacedTemplates)
		return normalizePathTemplate(parsed.pathname)
	} catch {
		const stripped = replacedTemplates.replace(/^[a-zA-Z][a-zA-Z\d+.-]*:\/\/[^/]+/, '')
		return normalizePathTemplate(stripped)
	}
}

export function findOperation(spec: RecordLike, method: string, requestUrl: string): RecordLike | undefined {
	const paths = spec.paths
	if (!isRecord(paths)) return undefined

	const methodLower = String(method || 'get').toLowerCase()
	const requestPath = extractRequestPath(normalizeUrl(requestUrl))

	let exactHit: RecordLike | undefined
	let templateHit: { op: RecordLike; dynamicCount: number } | undefined

	for (const [pathTemplateRaw, pathItemRaw] of Object.entries(paths)) {
		if (!isRecord(pathItemRaw)) continue
		const operation = pathItemRaw[methodLower]
		if (!isRecord(operation)) continue

		const pathTemplate = normalizePathTemplate(pathTemplateRaw)
		if (pathTemplate === requestPath) {
			exactHit = operation
			break
		}

		const { regex, dynamicCount } = toPathRegex(pathTemplate)
		if (regex.test(requestPath)) {
			if (!templateHit || dynamicCount < templateHit.dynamicCount) {
				templateHit = { op: operation, dynamicCount }
			}
		}
	}

	return exactHit ?? templateHit?.op
}

export function getResponseSchema(operation: RecordLike, desiredStatus: number): unknown {
	const responses = operation.responses
	if (!isRecord(responses)) return undefined

	const statusKey = String(Number.isFinite(desiredStatus) ? desiredStatus : 200)
	const exact = responses[statusKey]
	const fallback2xxKey = Object.keys(responses).find((key) => /^2\d\d$/.test(key))
	const fallback2xx = fallback2xxKey ? responses[fallback2xxKey] : undefined
	const fallbackDefault = responses.default
	const responseObj = (exact ?? fallback2xx ?? fallbackDefault) as unknown
	if (!isRecord(responseObj)) return undefined

	if (isRecord(responseObj.content)) {
		const content = responseObj.content
		const jsonEntry =
			content['application/json']
			?? Object.entries(content).find(([mime]) => mime.endsWith('+json'))?.[1]
			?? Object.values(content)[0]
		if (isRecord(jsonEntry)) return jsonEntry.schema
	}

	if (responseObj.schema) return responseObj.schema

	return undefined
}

export function resolveSchemaRefs(
	schema: unknown,
	spec: RecordLike,
	stack: Set<string> = new Set<string>(),
): unknown {
	if (Array.isArray(schema)) {
		return schema.map((item) => resolveSchemaRefs(item, spec, stack))
	}
	if (!isRecord(schema)) return schema

	if (typeof schema.$ref === 'string') {
		const pointer = schema.$ref
		if (!pointer.startsWith('#/')) return schema
		if (stack.has(pointer)) return schema
		stack.add(pointer)
		const resolved = getByPointer(spec, pointer)
		const rest: RecordLike = { ...schema }
		delete rest.$ref
		const resolvedNode = resolveSchemaRefs(resolved, spec, stack)
		stack.delete(pointer)
		if (isRecord(resolvedNode)) {
			return {
				...resolvedNode,
				...rest,
			}
		}
		return resolvedNode
	}

	const next: RecordLike = {}
	for (const [key, value] of Object.entries(schema)) {
		next[key] = resolveSchemaRefs(value, spec, stack)
	}

	if (next.nullable === true) {
		if (typeof next.type === 'string') {
			next.type = [next.type, 'null']
		} else if (Array.isArray(next.type) && !next.type.includes('null')) {
			next.type = [...next.type, 'null']
		}
		// `nullable` states that the value may be null. Generators emit it next to an enum without
		// repeating null in the list, and a strict reading would reject every such null.
		if (Array.isArray(next.enum) && !next.enum.includes(null)) {
			next.enum = [...next.enum, null]
		}
		delete next.nullable
	}

	return next
}

export function detectType(value: unknown): string {
	if (value === null) return 'null'
	if (Array.isArray(value)) return 'array'
	if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number'
	return typeof value
}

export function schemaTypeLabel(schema: unknown): string {
	if (!isRecord(schema)) return 'unknown'
	if (typeof schema.type === 'string') return schema.type
	if (Array.isArray(schema.type)) return schema.type.join(' | ')
	if (Array.isArray(schema.enum) && schema.enum.length > 0) return 'enum'
	if (isRecord(schema.properties)) return 'object'
	if (schema.items) return 'array'
	return 'unknown'
}

export function toText(value: unknown): string {
	if (typeof value === 'string') return value
	if (value == null) return String(value)
	if (typeof value === 'number' || typeof value === 'boolean') return String(value)
	try {
		return JSON.stringify(value)
	} catch {
		return String(value)
	}
}

interface JsonSchemaErrorLike {
	name?: unknown
	argument?: unknown
	property?: unknown
	message?: unknown
	stack?: unknown
	schema?: unknown
	instance?: unknown
	subErrors?: unknown[]
}

export function propertyToIssuePath(property: unknown): string {
	if (typeof property !== 'string' || !property.trim()) return '$'
	const normalized = property.startsWith('instance') ? property.replace(/^instance/, '$') : property
	return normalized || '$'
}

export function flattenJsonSchemaErrors(errors: unknown[] | undefined, out: JsonSchemaErrorLike[]): void {
	if (!Array.isArray(errors)) return
	for (const error of errors) {
		if (!isRecord(error)) continue
		const item = error as JsonSchemaErrorLike
		out.push(item)
		if (Array.isArray(item.subErrors) && item.subErrors.length > 0) {
			flattenJsonSchemaErrors(item.subErrors, out)
		}
	}
}

export function schemaErrorToIssue(error: JsonSchemaErrorLike): OpenApiValidationIssue {
	const path = propertyToIssuePath(error.property)
	const keyword = typeof error.name === 'string' ? error.name : ''
	const keywordValue = error.argument
	const actualValue = error.instance

	if (keyword === 'required') {
		if (typeof keywordValue === 'string') {
			return { path: `${path}.${keywordValue}`, message: 'required property is missing' }
		}
		return { path, message: 'required property is missing' }
	}
	if (keyword === 'additionalProperties') {
		if (typeof keywordValue === 'string') {
			return { path: `${path}.${keywordValue}`, message: 'property is not declared in schema' }
		}
		return { path, message: 'property is not declared in schema' }
	}

	if (keyword === 'type') {
		const expected = Array.isArray(keywordValue)
			? keywordValue.map((item) => String(item)).join(' | ')
			: String(keywordValue ?? 'unknown')
		const actual = detectType(actualValue)
		return { path, message: `type mismatch: expected ${expected}, got ${actual}` }
	}

	if (keyword === 'enum') {
		const enumRawValues = Array.isArray(keywordValue)
			? keywordValue
			: (isRecord(error.schema) && Array.isArray(error.schema.enum) ? error.schema.enum : undefined)
		const schemaNode = isRecord(error.schema) ? error.schema : undefined
		const schemaType = isRecord(schemaNode) && (typeof schemaNode.type === 'string' || Array.isArray(schemaNode.type))
			? (schemaNode.type as string | string[])
			: undefined
		const allowed = enumRawValues ? enumRawValues.map((item) => toText(item)).join(', ') : ''
		return {
			path,
			message: allowed ? `value is not in enum [${allowed}]` : 'value is not in enum',
			enumRawValues,
			schemaType,
		}
	}

	if (keyword === 'const') return { path, message: `value must be ${toText(keywordValue)}` }
	if (keyword === 'oneOf') return { path, message: 'value does not match exactly one allowed schema (oneOf)' }
	if (keyword === 'anyOf') return { path, message: 'value does not match any allowed schema (anyOf)' }

	const fallback = typeof error.message === 'string' && error.message.trim()
		? error.message
		: (typeof error.stack === 'string' ? error.stack : '')
	return { path, message: fallback || `schema validation failed: ${keyword || 'unknown'}` }
}

async function validateWithJsonSchema(schema: unknown, data: unknown): Promise<OpenApiValidationIssue[]> {
	if (!isRecord(schema)) {
		return [{ path: '$', message: 'response schema is not valid JSON schema object' }]
	}

	try {
		const schemaDoc: RecordLike = {
			$schema: typeof schema.$schema === 'string' ? schema.$schema : 'https://json-schema.org/draft/2020-12/schema',
			...schema,
		}

		const validator = new Validator()
		const result = validator.validate(data, schemaDoc)
		if (result.valid) return []

		const flat: JsonSchemaErrorLike[] = []
		flattenJsonSchemaErrors(result.errors as unknown[], flat)

		const unique = new Set<string>()
		const issues: OpenApiValidationIssue[] = []
		const noisyKeywords = new Set(['properties'])
		for (const item of flat) {
			const keyword = typeof item.name === 'string' ? item.name : ''
			if (noisyKeywords.has(keyword)) continue
			const issue = schemaErrorToIssue(item)
			const key = `${issue.path}|${issue.message}`
			if (unique.has(key)) continue
			unique.add(key)
			issues.push(issue)
		}
		return issues
	} catch (error) {
		return [{ path: '$', message: `Schema validator failed: ${(error as Error)?.message ?? 'unknown error'}` }]
	}
}

function collectSuggestions(
	schema: unknown,
	data: unknown,
	path: string,
	suggestions: OpenApiValidationSuggestion[],
	enumHints: OpenApiValidationEnumHint[],
	context: OpenApiSuggestionCollectContext,
): void {
	if (context.truncated) return
	if (Date.now() > context.deadlineTs) {
		context.truncated = true
		return
	}
	if (!isRecord(schema)) return

	if (path !== '$' && Array.isArray(schema.enum) && schema.enum.length > 0 && data !== undefined) {
		enumHints.push({
			path,
			enumRawValues: schema.enum,
		})
	}

	const itemsSchema = schema.items
	if (Array.isArray(data) && itemsSchema) {
		for (let index = 0; index < data.length; index += 1) {
			if (context.truncated) return
			if (Date.now() > context.deadlineTs) {
				context.truncated = true
				return
			}
			const itemSchema = Array.isArray(itemsSchema)
				? itemsSchema[Math.min(index, itemsSchema.length - 1)]
				: itemsSchema
			collectSuggestions(itemSchema, data[index], `${path}[${index}]`, suggestions, enumHints, context)
		}
	}

	const properties = isRecord(schema.properties) ? schema.properties : undefined
	if (!properties) return

	const required = Array.isArray(schema.required)
		? new Set(schema.required.filter((name): name is string => typeof name === 'string'))
		: new Set<string>()
	const dataObject = isRecord(data) ? data : {}

	const buildSampleValue = (schemaNode: unknown, depth = 0): unknown => {
		if (depth > 3 || !isRecord(schemaNode)) return null
		if (Array.isArray(schemaNode.enum) && schemaNode.enum.length > 0) return schemaNode.enum[0]

		if (typeof schemaNode.type === 'string') {
			if (schemaNode.type === 'string') return 'string'
			if (schemaNode.type === 'integer' || schemaNode.type === 'number') return 0
			if (schemaNode.type === 'boolean') return false
			if (schemaNode.type === 'null') return null
			if (schemaNode.type === 'array') {
				const itemSample = buildSampleValue(schemaNode.items, depth + 1)
				return itemSample == null ? [] : [itemSample]
			}
		}

		if (Array.isArray(schemaNode.type) && schemaNode.type.length > 0) {
			const first = schemaNode.type.find((item): item is string => typeof item === 'string' && item !== 'null')
			if (first) return buildSampleValue({ ...schemaNode, type: first }, depth + 1)
		}

		const properties = isRecord(schemaNode.properties) ? schemaNode.properties : undefined
		if (properties) {
			const out: RecordLike = {}
			for (const [propKey, propSchema] of Object.entries(properties)) {
				const sample = buildSampleValue(propSchema, depth + 1)
				if (sample !== undefined) {
					out[propKey] = sample
				}
			}
			return out
		}

		return null
	}

	const addSuggestion = (key: string, childSchema: unknown, isRequired: boolean): void => {
		const childPath = `${path}.${key}`
		const child = isRecord(childSchema) ? childSchema : {}
		const enumRawValues = Array.isArray(child.enum) ? child.enum : undefined
		suggestions.push({
			path: childPath,
			type: schemaTypeLabel(child),
			required: isRequired,
			enumValues: enumRawValues ? enumRawValues.map((item) => String(item)) : [],
			enumRawValues,
			sampleValue: buildSampleValue(child),
		})
	}

	// First pass: required properties (missing → suggest, present → recurse)
	for (const [key, childSchema] of Object.entries(properties)) {
		if (context.truncated) return
		if (Date.now() > context.deadlineTs) {
			context.truncated = true
			return
		}
		if (!required.has(key)) continue
		const childPath = `${path}.${key}`
		const hasKey = key in dataObject
		if (!hasKey) {
			addSuggestion(key, childSchema, true)
			continue
		}
		collectSuggestions(childSchema, dataObject[key], childPath, suggestions, enumHints, context)
	}

	// Second pass: optional properties
	for (const [key, childSchema] of Object.entries(properties)) {
		if (context.truncated) return
		if (Date.now() > context.deadlineTs) {
			context.truncated = true
			return
		}
		if (required.has(key)) continue
		const childPath = `${path}.${key}`
		const hasKey = key in dataObject
		if (!hasKey) {
			addSuggestion(key, childSchema, false)
			continue
		}
		collectSuggestions(childSchema, dataObject[key], childPath, suggestions, enumHints, context)
	}
}

export function parseResponseJson(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
	const clean = String(text ?? '').trim()
	if (!clean) return { ok: true, value: undefined }
	try {
		return { ok: true, value: JSON.parse(clean) }
	} catch (error) {
		return { ok: false, error: (error as Error).message }
	}
}

async function fetchOpenApiSpec(specUrl: string): Promise<IOpenApiFetchResult> {
	return fetchOpenApiSpecByRuntime(specUrl)
}

export function isOpenApiSpec(spec: unknown): spec is RecordLike {
	if (!isRecord(spec)) return false
	if (!isRecord(spec.paths)) return false
	return typeof spec.openapi === 'string' || typeof spec.swagger === 'string' || isRecord(spec.info)
}

export async function analyzeMockResponseByOpenApi(input: {
	specUrl: string
	requestUrl: string
	method: string
	status: number
	responseBody: string
}): Promise<OpenApiValidationState> {
	const specUrl = String(input.specUrl ?? '').trim()
	if (!specUrl) return initialOpenApiValidationState

	let parsedSpecUrl: URL
	try {
		parsedSpecUrl = new URL(specUrl)
	} catch {
		return {
			status: 'error',
			message: 'OpenAPI URL must be an absolute URL.',
			issues: [],
			suggestions: [],
			enumHints: [],
			suggestionsTruncated: false,
		}
	}

	if (!/^https?:$/i.test(parsedSpecUrl.protocol)) {
		return {
			status: 'error',
			message: 'Only http/https OpenAPI URLs are supported.',
			issues: [],
			suggestions: [],
			enumHints: [],
			suggestionsTruncated: false,
		}
	}

	const specResult = await fetchOpenApiSpec(specUrl)
	if (!specResult.ok) {
		return {
			status: 'error',
			message: specResult.error,
			issues: [],
			suggestions: [],
			enumHints: [],
			suggestionsTruncated: false,
		}
	}

	if (!isOpenApiSpec(specResult.spec)) {
		return {
			status: 'error',
			message: 'Loaded document is not a valid OpenAPI/Swagger spec.',
			sourceUrl: specResult.sourceUrl,
			issues: [],
			suggestions: [],
			enumHints: [],
			suggestionsTruncated: false,
		}
	}

	const operation = findOperation(specResult.spec, input.method, input.requestUrl)
	if (!operation) {
		return {
			status: 'error',
			message: 'Operation was not found in OpenAPI paths for current method + URL.',
			sourceUrl: specResult.sourceUrl,
			issues: [],
			suggestions: [],
			enumHints: [],
			suggestionsTruncated: false,
		}
	}

	const responseSchemaRaw = getResponseSchema(operation, input.status)
	if (!responseSchemaRaw) {
		return {
			status: 'error',
			message: `Response schema for status ${input.status} is not defined in OpenAPI.`,
			sourceUrl: specResult.sourceUrl,
			issues: [],
			suggestions: [],
			enumHints: [],
			suggestionsTruncated: false,
		}
	}

	const resolvedSchema = resolveSchemaRefs(responseSchemaRaw, specResult.spec)
	const parsedBody = parseResponseJson(input.responseBody)
	if (!parsedBody.ok) {
		return {
			status: 'error',
			message: `Response JSON is invalid: ${parsedBody.error}`,
			sourceUrl: specResult.sourceUrl,
			issues: [],
			suggestions: [],
			enumHints: [],
			suggestionsTruncated: false,
		}
	}

	const suggestions: OpenApiValidationSuggestion[] = []
	const enumHints: OpenApiValidationEnumHint[] = []
	const bodyValue = parsedBody.value
	const issues: OpenApiValidationIssue[] = []

	if (String(input.responseBody ?? '').trim()) {
		issues.push(...(await validateWithJsonSchema(resolvedSchema, bodyValue)))
	}

	const suggestionContext: OpenApiSuggestionCollectContext = {
		deadlineTs: Date.now() + SUGGESTIONS_MAX_DURATION_MS,
		truncated: false,
	}

	collectSuggestions(resolvedSchema, bodyValue, '$', suggestions, enumHints, suggestionContext)

	const enumHintsMap = new Map<string, OpenApiValidationEnumHint>()
	for (const hint of enumHints) {
		if (!hint.path || hint.path === '$' || !hint.enumRawValues.length) continue
		enumHintsMap.set(hint.path, hint)
	}

	return {
		status: 'ready',
		message: issues.length > 0 ? 'Schema mismatches found.' : 'Response matches schema.',
		sourceUrl: specResult.sourceUrl,
		issues,
		suggestions,
		enumHints: Array.from(enumHintsMap.values()),
		suggestionsTruncated: suggestionContext.truncated,
		responseSchema: isRecord(resolvedSchema) ? resolvedSchema : undefined,
	}
}
