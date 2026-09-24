import { describe, it, expect } from 'vitest'

import { toVarRows, rowsToVars } from '../../panel/app/header/env-button.utils'

describe('toVarRows', () => {
	it('builds rows with BASE_URL (a regular variable, not locked)', () => {
		const result = toVarRows({ BASE_URL: 'http://localhost' })
		expect(result).toHaveLength(1)
		expect(result[0]).toEqual({
			id: 'BASE_URL',
			key: 'BASE_URL',
			value: 'http://localhost',
		})
	})

	it('adds extra variables', () => {
		const result = toVarRows({ BASE_URL: 'http://localhost', API_KEY: 'secret', OTHER: 'value' })
		expect(result).toHaveLength(3)
		expect(result[0].key).toBe('BASE_URL')

		const otherKeys = result.filter((r) => r.key !== 'BASE_URL')
		expect(otherKeys).toHaveLength(2)
		expect(otherKeys[0].id).not.toBe('BASE_URL')
		expect(otherKeys[0].key).toBeDefined()
	})

	it('handles undefined (BASE_URL is not forced)', () => {
		const result = toVarRows(undefined as unknown as Record<string, string>)
		expect(result).toHaveLength(0)
	})

	it('handles null', () => {
		const result = toVarRows(null as unknown as Record<string, string>)
		expect(result).toHaveLength(0)
	})

	it('handles an empty object (BASE_URL is not forced)', () => {
		const result = toVarRows({})
		expect(result).toHaveLength(0)
	})

	it('converts values to strings', () => {
		const result = toVarRows({ BASE_URL: 123, NUMBER_VAR: 456 } as unknown as Record<string, string>)
		expect(result[0].value).toBe('123')
		expect(result[1].value).toBe('456')
	})

	it('handles undefined variable values', () => {
		const result = toVarRows({ BASE_URL: 'http://test.com', EMPTY_VAR: undefined } as unknown as Record<string, string>)
		expect(result).toHaveLength(2)
		expect(result[1].value).toBe('')
	})
})

describe('rowsToVars', () => {
	it('converts rows back to vars', () => {
		const rows = [
			{ id: 'BASE_URL', key: 'BASE_URL', value: 'http://localhost' },
			{ id: '123', key: 'API_KEY', value: 'secret' },
		]
		const result = rowsToVars(rows)
		expect(result).toEqual({
			BASE_URL: 'http://localhost',
			API_KEY: 'secret',
		})
	})

	it('does not force BASE_URL when it is missing', () => {
		const rows = [{ id: '123', key: 'API_KEY', value: 'secret' }]
		const result = rowsToVars(rows)
		expect(result.BASE_URL).toBeUndefined()
		expect(result.API_KEY).toBe('secret')
	})

	it('ignores empty keys', () => {
		const rows = [
			{ id: '1', key: '', value: 'value1' },
			{ id: '2', key: '   ', value: 'value2' },
			{ id: '3', key: 'VALID', value: 'value3' },
		]
		const result = rowsToVars(rows)
		expect(result).toEqual({ VALID: 'value3' })
	})

	it('trims keys and values', () => {
		const rows = [{ id: '1', key: '  KEY  ', value: '  VALUE  ' }]
		const result = rowsToVars(rows)
		expect(result).toEqual({ KEY: 'VALUE' })
	})

	it('handles an empty array', () => {
		const result = rowsToVars([])
		expect(result).toEqual({})
	})

	it('overrides an existing BASE_URL', () => {
		const rows = [
			{ id: 'BASE_URL', key: 'BASE_URL', value: 'http://new.url' },
		]
		const result = rowsToVars(rows)
		expect(result.BASE_URL).toBe('http://new.url')
	})
})
