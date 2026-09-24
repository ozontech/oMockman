import { safeNumberInt } from '@/services/number'
import type { AIGenerationMode, IAIMessage, IBuildPromptInput } from '@/interface/ai'
import type { IMockResponseRaw } from '@/interface/mock'
import type { RecordLike } from '@/interface/openapi'

// Character limits.
// Without them a large schema easily eats the whole model context.
const MAX_OPENAPI_FRAGMENT_CHARS = 6000

const REUSE_IMAGE_LINKS_RULE = 'IMPORTANT: do NOT invent or alter image links (.jpg, .jpeg, .png, .webp, .gif, .svg) — find the first real image link in the source data and copy it VERBATIM, UNCHANGED, into every other element. Do not change the domain, path or file name in the URL.'

// Output rule shared by every mode.
const JSON_OUTPUT_RULE = 'Output a single valid JSON document — no markdown fences (```), no comments.'

// Array rules. The lead array size depends on the mode, so they are assembled
// in buildArrayRules rather than kept as one list.
const LEAD_ARRAY_RULE = 'PICK ONE "lead" array of objects and fill EXACTLY THAT ONE with several elements. The lead array is the topmost array of objects in the response, counting from the root; if the root is an object (not an array), go inside until you reach the FIRST array of objects (for example data.cargoes) — that one is the lead array. The response must ALWAYS have at least one array with several elements — do not leave every array with a single element.'

const HAPPY_ARRAY_SIZE_RULE = 'Pick the number of elements in the lead array by the size of one element (including all its nesting): small (up to ~12 lines of JSON) — 15 elements; medium (~12-24 lines) — 10; large (~24-60 lines) — 5; huge (more than ~60 lines) — 1-2. Elements differ in values but share the same structure.'

const CORNER_ARRAY_SIZE_RULE = 'No more than 8 elements in the lead array: a corner set must stay compact while covering as much as possible. If there are more mutation types than elements, combine several mutations in one element (pairwise) instead of adding elements.'

const NESTED_ARRAYS_RULE = 'Do NOT multiply the other arrays (nested inside lead elements, or siblings) — keep 1-2 elements in them, just enough to show the structure. Otherwise the data volume grows exponentially and the response gets cut off.'

const COUNTER_FIELDS_RULE = 'If an object has a counter field (total, count, accepted_quantity etc.), keep it consistent with the actual number of elements in the matching array.'

// Retry after the token limit cut the answer off: ask for less.
const COMPACT_RETRY_RULE = 'The PREVIOUS attempt was cut off by the response length limit. Reduce the volume: half as many elements in the lead array, long strings no longer than ~120 characters. All other rules still apply.'

// Data mode 1: JSON only, no schema - keep the structure 1:1.
const ENRICH_ONLY_RULES = [
	'You are given an existing JSON response. Fill it with data WITHOUT changing the structure.',
	'Keep every key name exactly as in the original — do not add new keys and do not remove existing ones.',
	'Keep the type of every value: use the existing value as the type reference.',
	REUSE_IMAGE_LINKS_RULE,
]

// Data mode 2: schema only, no JSON - generate from the schema.
const SCHEMA_ONLY_RULES = [
	'Generate JSON strictly by the provided JSON Schema — all required fields, correct types.',
	'Use varied values: go through different enum options, do not repeat the same one.',
]

// Data mode 3: both schema and JSON - hybrid.
const HYBRID_RULES = [
	'You are given an existing JSON response and a JSON Schema. Use the JSON values as a reference, but make them conform to the schema.',
	'The schema is the source of truth: if a value type in the JSON contradicts the schema (a backend bug), fix the type to match the schema.',
	'Take key names from the schema; use the existing values as a sample of the data style.',
	'Use varied values from the schema: go through different enum options.',
	REUSE_IMAGE_LINKS_RULE,
]

// Positive scenario shared by happy and corner: a SUCCESSFUL response, not an error.
const POSITIVE_RULE = 'This is a SUCCESSFUL response, NOT an error. Handle error fields and blocks (error, errors, error_message, error code/text) by checking in the schema whether the field is required: IF the error field is NOT in the required list (optional) — do NOT output this key AT ALL, do not even write error: null or error: {}, just leave it out entirely. IF the error field is in required (mandatory) — output it EMPTY according to its schema type (empty object {}, null or a default) so that validation passes, but with no error code or text inside. No invented error content. Empty is not an error.'

// Enum variety: shared by every mode that has a schema.
const ENUM_VARIETY_RULE = 'ENUM VARIETY MATTERS MORE than everyday plausibility: for every enum field use ALL allowed values, spreading them across array elements without repeats until the whole list is used (repeat only if there are more elements). Do not stick to 1-2 "common" values, even if the others are rare in real life — the goal is to show every option. The full list of values for each enum is given below in the "Allowed enum values" block.'

// Value mode happy: clean, plausible data.
const HAPPY_RULES = [
	'Generate a successful (positive) response with clean, plausible data.',
	'Make values plausible (real barcodes, IDs, names, dates), not placeholders like "string" or 0.',
	POSITIVE_RULE,
]

// Value mode corner: valid structure, boundary values. Uses test design techniques
// (boundary values + pairwise) to cover the most fields and problem types
// with the fewest elements.
const CORNER_RULES = [
	'Corner-case data mode: the structure and keys stay valid, but fill the values with problematic variants to test layout and validation.',
	'Apply test design techniques (boundary value analysis + pairwise testing) rather than "one field per element". The goal is the fewest elements with the widest coverage.',
	'Use a long string (300+ characters) in ONLY ONE string field per element, not in all of them at once — otherwise the response bloats and gets cut off. Mutate the other string fields of the same element with other, short types (empty, spaces, special characters, emoji).',
	'List of problematic value types: empty string; a string of spaces only; leading/trailing spaces; a very long string (300+ characters); special characters (!@#$%^&* etc.); emoji; unicode (你好); line breaks and tabs inside; for numbers — 0, negative, very large; for dates — invalid format and boundary dates.',
	'FIRST build elements "by mutation type": one element applies ONE problematic value type TO ALL matching fields AT ONCE (for example an "empty" element — all string fields empty; a "long" element — all string fields long). This way every problem type reaches every field.',
	'THEN add 2-3 combined (pairwise) elements in which different fields of one object carry different mutation types at the same time.',
	'Keep the first array element as one fully valid object for reference.',
	'Do NOT use null and do not skip data fields — the point is problematic values of the right type, not missing values (this does not apply to error fields, see below).',
	'Numeric and required fields that physically cannot take a string (id etc.) are mutated within their own bounds (0, negative, huge numbers), not with strings.',
	POSITIVE_RULE,
]

// Corner addition when there is a schema: cover everything WITHOUT breaking types.
const CORNER_WITH_SCHEMA_RULES = [
	'ROOT STRUCTURE strictly by the schema: if the schema says a field is an object, it MUST be an object, not an array; if it is an array — an array. Do NOT turn an object into an array to multiply it — instead find the nearest type: array field inside (for example data.cargoes) and fill THAT with elements as the lead array.',
	'Fill ALL fields described in the schema (except error branches) — skip none.',
	'STRICTLY follow the schema types — the resulting JSON must pass schema validation. Do NOT put a string into number/integer, junk into format fields, or a value outside the enum.',
	'Free string fields (type: string WITHOUT a strict format) are the main place for edge cases: be SURE to run the whole "List of problematic value types" from the rule above through them. Respect minLength/maxLength if set.',
	'Numeric fields (number/integer) get boundary NUMBERS: 0, negative, very large (within minimum/maximum if set). Do not turn them into strings.',
	'Fields with a format (date-time, date, email, uuid etc.) are always VALID for that format, but use boundary variants: for dates — the distant past or future, the end of a month, a leap year; never break the format itself.',
]

// Short meaning of common HTTP statuses: a hint for the error text.
const HTTP_STATUS_HINTS: Record<number, string> = {
	400: 'bad request / input validation error',
	401: 'unauthorized / token missing or invalid',
	403: 'forbidden / no permission',
	404: 'resource not found',
	405: 'method not allowed',
	409: 'state conflict (for example the resource already exists or was changed)',
	410: 'resource is no longer available',
	422: 'data failed business validation',
	429: 'too many requests / rate limit exceeded',
	500: 'internal server error',
	502: 'upstream service error',
	503: 'service temporarily unavailable',
	504: 'upstream service timeout',
}

// Value mode error: an error response from the error branch of the schema.
function buildErrorRules(status: number): string[] {
	const hint = HTTP_STATUS_HINTS[status]
	const semantics = hint
		? `Status ${status} means: ${hint}. The error text and code must match that meaning.`
		: `The error text and code must match the meaning of HTTP status ${status}.`
	return [
		'Generate an error response (negative scenario) strictly by the error branch of the schema for the current HTTP status.',
		'Fill ONLY the error fields (error/errors) with plausible data: an error code and a human-readable message.',
		semantics,
		'If the schema defines specific error codes or values (enum, examples), take them from there: the schema wins over the status meaning.',
		'Use the message language from the schema or nearby examples; if it cannot be determined, use English.',
		'Do NOT add payload data (data, items, result etc.). If such a field is NOT required by the schema — leave it out of the output entirely (do not write data: null). If it is required — keep it empty per the schema (null/empty object/empty array), with no invented content.',
	]
}

function tryParseJson(raw: string | undefined): unknown {
	const text = String(raw ?? '').trim()
	if (!text) return undefined
	try {
		return JSON.parse(text)
	} catch {
		return undefined
	}
}

function pickModeValueRules(mode: AIGenerationMode, hasSchema: boolean, status: number): string[] {
	if (mode === 'corner') return hasSchema ? [...CORNER_RULES, ...CORNER_WITH_SCHEMA_RULES] : CORNER_RULES
	if (mode === 'error') return buildErrorRules(status)
	return HAPPY_RULES
}

// Array rules depend on the mode: happy uses an adaptive scale, corner a compact
// ceiling. Error has nothing to multiply, only the error block.
function buildArrayRules(mode: AIGenerationMode): string[] {
	if (mode === 'error') return []
	return [
		LEAD_ARRAY_RULE,
		mode === 'corner' ? CORNER_ARRAY_SIZE_RULE : HAPPY_ARRAY_SIZE_RULE,
		NESTED_ARRAYS_RULE,
		COUNTER_FIELDS_RULE,
	]
}

function truncate(value: string, max: number): string {
	if (value.length <= max) return value
	return `${value.slice(0, max - 20)}\n…[truncated]`
}

// Schema fields that are useless for generating structure: they often take half
// the volume, so the tail of the schema gets cut at the character limit.
const SCHEMA_NOISE_KEYS = new Set(['description', 'example', 'examples'])

function pruneSchemaNoise(node: unknown, insidePropertiesMap = false, depth = 0): unknown {
	if (!node || typeof node !== 'object' || depth > 20) return node
	if (Array.isArray(node)) return node.map((item) => pruneSchemaNoise(item, false, depth + 1))
	const result: RecordLike = {}
	for (const [key, value] of Object.entries(node as RecordLike)) {
		if (!insidePropertiesMap && SCHEMA_NOISE_KEYS.has(key)) continue
		result[key] = pruneSchemaNoise(value, !insidePropertiesMap && key === 'properties', depth + 1)
	}
	return result
}

function stringifyOperation(operation: RecordLike): string {
	try {
		const text = JSON.stringify(pruneSchemaNoise(operation), null, 2)
		return truncate(text, MAX_OPENAPI_FRAGMENT_CHARS)
	} catch {
		return ''
	}
}

const MAX_ENUM_PATHS = 40
const MAX_ENUM_VALUES = 50

/**
 * Recursively collects enum fields from the resolved schema: field name -> values.
 * Keeps the full enum lists reaching the model compactly even when the schema
 * itself is cut at the character limit.
 */
function collectEnums(node: unknown, key: string, acc: Map<string, unknown[]>, depth = 0): void {
	if (!node || typeof node !== 'object' || depth > 12 || acc.size >= MAX_ENUM_PATHS) return
	const record = node as RecordLike

	if (Array.isArray(record.enum) && record.enum.length > 0 && key && !acc.has(key)) {
		acc.set(key, record.enum.slice(0, MAX_ENUM_VALUES))
	}

	const properties = record.properties
	if (properties && typeof properties === 'object') {
		for (const [propName, propSchema] of Object.entries(properties as RecordLike)) {
			collectEnums(propSchema, propName, acc, depth + 1)
		}
	}
	if (record.items) collectEnums(record.items, key, acc, depth + 1)
	for (const composite of ['allOf', 'anyOf', 'oneOf'] as const) {
		const branch = record[composite]
		if (Array.isArray(branch)) branch.forEach((sub) => collectEnums(sub, key, acc, depth + 1))
	}
}

function buildEnumCatalog(operation: RecordLike): string {
	const enums = new Map<string, unknown[]>()
	collectEnums(operation, '', enums)
	if (enums.size === 0) return ''
	const lines = Array.from(enums.entries()).map(
		([field, values]) => `- ${field}: ${values.map((v) => JSON.stringify(v)).join(', ')}`,
	)
	return lines.join('\n')
}

function describeMockHeader(mock: IMockResponseRaw): string {
	const method = String(mock.method ?? '').toUpperCase() || 'GET'
	const url = mock.url ?? ''
	const status = mock.status ?? 200
	return `${method} ${url} → HTTP ${status}`
}

function pickModeRules(hasJson: boolean, hasSchema: boolean): string[] {
	if (hasJson && hasSchema) return HYBRID_RULES
	if (hasJson) return ENRICH_ONLY_RULES
	if (hasSchema) return SCHEMA_ONLY_RULES
	return ['Generate a realistic JSON response that fits the endpoint context.']
}

function buildSystemMessage(
	input: IBuildPromptInput,
	hasJson: boolean,
	hasSchema: boolean,
	mode: AIGenerationMode,
	hasEnumCatalog: boolean,
): IAIMessage {
	const lines: string[] = []
	const status = safeNumberInt(String(input.mock.status ?? 200)) ?? 200
	const rules = [
		...pickModeRules(hasJson, hasSchema),
		...pickModeValueRules(mode, hasSchema, status),
		...(hasEnumCatalog && mode !== 'error' ? [ENUM_VARIETY_RULE] : []),
		JSON_OUTPUT_RULE,
		...buildArrayRules(mode),
		...(input.compactRetry ? [COMPACT_RETRY_RULE] : []),
	]
	// A numbered list: the model follows separate items noticeably better than the
	// same rules glued into one paragraph.
	lines.push('Generation rules (follow EACH one):')
	lines.push(rules.map((rule, index) => `${index + 1}. ${rule}`).join('\n'))

	const customPrompt = input.globalSystemPrompt?.trim()
	if (customPrompt) {
		lines.push('')
		lines.push('Additional instructions:')
		lines.push(customPrompt)
	}

	const collectionPrompt = input.collection?.aiPrompt?.trim()
	if (collectionPrompt) {
		lines.push('')
		lines.push('Collection instructions:')
		lines.push(collectionPrompt)
	}

	return { role: 'system', content: lines.join('\n') }
}

function buildUserMessage(input: IBuildPromptInput, currentResponse: unknown, enumCatalog: string): IAIMessage {
	const sections: string[] = []
	sections.push(`Target endpoint: ${describeMockHeader(input.mock)}`)

	const mockName = input.mock.name?.trim()
	if (mockName) sections.push(`Mock name: ${mockName}`)
	const mockDescription = input.mock.description?.trim()
	if (mockDescription) sections.push(`Mock description: ${mockDescription}`)

	if (currentResponse !== undefined) {
		sections.push('')
		sections.push('Existing JSON response — fill it with data, keeping the structure and keys:')
		sections.push('```json')
		sections.push(truncate(JSON.stringify(currentResponse, null, 2), MAX_OPENAPI_FRAGMENT_CHARS))
		sections.push('```')
	}

	if (input.openApiOperation) {
		if (enumCatalog) {
			sections.push('')
			sections.push('Allowed enum values (use ALL options for the matching fields):')
			sections.push(enumCatalog)
		}

		const fragment = stringifyOperation(input.openApiOperation)
		if (fragment) {
			sections.push('')
			sections.push('Response JSON Schema from OpenAPI (source of truth for keys, types and enum):')
			sections.push('```json')
			sections.push(fragment)
			sections.push('```')
		}
	}

	const hasJson = currentResponse !== undefined
	const hasSchema = Boolean(input.openApiOperation)

	sections.push('')
	if (hasJson && hasSchema) {
		sections.push('Return JSON by the rules above: values from the existing response as a reference, types and keys from the schema.')
	} else if (hasJson) {
		sections.push('Return the same JSON filled with data by the rules above. Do not change the structure or keys.')
	} else {
		sections.push('Answer with a single valid JSON document for the target endpoint.')
	}

	return { role: 'user', content: sections.join('\n') }
}

/**
 * Builds the prompt for mock generation.
 */
export function buildMockGenerationMessages(input: IBuildPromptInput): IAIMessage[] {
	const currentResponse = tryParseJson(input.mock.response)
	const hasJson = currentResponse !== undefined
	const hasSchema = Boolean(input.openApiOperation)
	const mode: AIGenerationMode = input.mode ?? 'happy'
	const enumCatalog = input.openApiOperation ? buildEnumCatalog(input.openApiOperation) : ''
	return [
		buildSystemMessage(input, hasJson, hasSchema, mode, enumCatalog !== ''),
		buildUserMessage(input, currentResponse, enumCatalog),
	]
}
