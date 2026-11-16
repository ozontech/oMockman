import { Validator } from 'jsonschema'

import bundleSchema from './schemas/bundle.json' with { type: 'json' }
import commandSchema from './schemas/command.json' with { type: 'json' }
import resultSchema from './schemas/result.json' with { type: 'json' }

export const PROTOCOL_VERSION = 1
export const LIMITS = Object.freeze({ commandBytes: 2 * 1024 * 1024, operationTtlMs: 300_000 })
export const schemas = { bundle: bundleSchema, command: commandSchema, result: resultSchema }
const validator = new Validator()
validator.addSchema(bundleSchema, bundleSchema.$id)

// Validation diagnostics describe the schema, never rejected values or arbitrary input keys.
const schemaFields = new Set()
function collectFields(schema) {
	if (!schema || typeof schema !== 'object') return
	for (const key of Object.keys(schema.properties ?? {})) schemaFields.add(key)
	for (const value of Object.values(schema)) {
		if (Array.isArray(value)) value.forEach(collectFields)
		else collectFields(value)
	}
}
collectFields(bundleSchema)
collectFields(commandSchema)
const errorsFor = (value, schema) => validator.validate(value, schema).errors.slice(0, 12)
	.map(error => ({
		path: error.path.map(part => typeof part === 'number' ? `[${part}]` : schemaFields.has(part) ? part : '[field]').join('.'),
		message: error.name === 'required' && schemaFields.has(error.argument)
			? `Required field: ${error.argument}`
			: ({ additionalProperties: 'Unknown field; consult the tool schema', type: 'Incorrect value type', enum: 'Value is not in the supported enum', pattern: 'Value does not match the required format', minimum: 'Value is below the minimum', maximum: 'Value exceeds the maximum', maxItems: 'Too many items', minItems: 'Too few items', format: 'Invalid format', maxLength: 'Value is too long', minLength: 'Value is too short' })[error.name] ?? `Schema constraint: ${error.name}`,
	}))

const validUrl = (value) => {
	try {
		const url = new URL(value)
		return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.hash
	} catch {
		return false
	}
}

/** Validate the external DTO and references without importing extension code. */
export function validateBundle(bundle) {
	const errors = errorsFor(bundle, bundleSchema)
	if (errors.length) return { valid: false, errors }
	for (const group of ['mocks', 'rules']) {
		const values = group === 'mocks' ? bundle.mocks : bundle.scenario.rules
		const seen = new Set()
		for (const [index, value] of values.entries()) {
			const path = `${group}[${index}]`
			if (seen.has(value.key)) errors.push({ path, message: 'Duplicate local key' })
			seen.add(value.key)
			if (!validUrl(value.url)) errors.push({ path, message: 'Expected HTTP(S) URL without credentials or fragment' })
		}
	}
	const mocks = new Map(bundle.mocks.map((mock) => [mock.key, mock]))
	for (const [index, rule] of bundle.scenario.rules.entries()) {
		if ('mockKey' in rule.respond && !mocks.has(rule.respond.mockKey)) {
			errors.push({ path: `rules[${index}].respond`, message: 'Unknown mock key' })
		}
	}
	for (const [index, mock] of bundle.mocks.entries()) {
		if ([204, 205, 304].includes(mock.response.status) && mock.response.body !== '') {
			errors.push({ path: `mocks[${index}].response.body`, message: 'Status requires an empty body' })
		}
	}
	return { valid: errors.length === 0, errors }
}

/** Validate a decoded JSON command; access and revision checks belong to background. */
export function validateCommand(command, now = Date.now()) {
	let encoded
	try {
		encoded = JSON.stringify(command)
	} catch {
		return { valid: false, errors: [{ path: '', message: 'Expected JSON data' }] }
	}
	if (encoded === undefined || new TextEncoder().encode(encoded).length > LIMITS.commandBytes) {
		return { valid: false, errors: [{ path: '', message: 'Command exceeds size limit or is not JSON' }] }
	}
	const errors = errorsFor(command, commandSchema.oneOf.find(entry => entry.properties.command.const === command?.command) ?? commandSchema)
	if (errors.length) return { valid: false, errors }
	if ('operationId' in command) {
		if (command.issuedAt > now || command.expiresAt <= now || command.expiresAt <= command.issuedAt
			|| command.expiresAt - command.issuedAt > LIMITS.operationTtlMs) {
			errors.push({ path: 'expiresAt', message: 'Invalid or expired operation window' })
		}
	}
	if ('bundle' in command.params) errors.push(...validateBundle(command.params.bundle).errors)
	if ('archive' in command.params) for (const bundle of command.params.archive.bundles) errors.push(...validateBundle(bundle).errors)
	return { valid: errors.length === 0, errors }
}

/** Validate a command result before sending it across the bridge. */
export function validateResult(result) {
	const errors = errorsFor(result, resultSchema)
	return { valid: errors.length === 0, errors }
}
