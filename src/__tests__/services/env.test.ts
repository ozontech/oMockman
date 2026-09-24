import { describe, it, expect } from 'vitest'

import { extractTemplateVars, getActiveEnv, getActiveEnvVars, normalizeEnv, resolveTemplate } from '../../services'

describe('normalizeEnv', () => {
	it('creates a default profile when env is empty', () => {
		const store = { env: undefined }
		const result = normalizeEnv(store as never)
		expect(result.env).toEqual({
			activeId: 'default',
			profiles: [{ id: 'default', name: 'default', vars: { BASE_URL: '' } }],
		})
	})

	it('creates a default profile when profiles is not an array', () => {
		const store = { env: { profiles: 'not-array' } }
		const result = normalizeEnv(store as never)
		expect(result.env).toEqual({
			activeId: 'default',
			profiles: [{ id: 'default', name: 'default', vars: { BASE_URL: '' } }],
		})
	})

	it('creates a default profile when profiles is an empty array', () => {
		const store = { env: { profiles: [] } }
		const result = normalizeEnv(store as never)
		expect(result.env).toEqual({
			activeId: 'default',
			profiles: [{ id: 'default', name: 'default', vars: { BASE_URL: '' } }],
		})
	})

	it('normalises valid profiles', () => {
		const store = {
			env: {
				activeId: 'prod',
				profiles: [
					{ id: 1, name: 'dev', vars: { URL: 'http://localhost' } },
					{ id: 'prod', name: 'production', vars: { URL: 'http://prod' } },
				],
			},
		}
		const result = normalizeEnv(store as never)
		expect(result.env?.profiles).toEqual([
			{ id: '1', name: 'dev', vars: { URL: 'http://localhost' } },
			{ id: 'prod', name: 'production', vars: { URL: 'http://prod' } },
		])
		expect(result.env?.activeId).toBe('prod')
	})

	it('normalises invalid profile field types', () => {
		const store = {
			env: {
				activeId: 'test',
				profiles: [
					{ id: null, name: 123, vars: 'invalid' },
				],
			},
		}
		const result = normalizeEnv(store as never)
		expect(result.env?.profiles[0].id).toBe('default')
		expect(result.env?.profiles[0].name).toBe('123')
		expect(result.env?.profiles[0].vars).toEqual({})
	})

	it('uses the first profile when activeId is not found', () => {
		const store = {
			env: {
				activeId: 'not-exist',
				profiles: [
					{ id: 'first', name: 'First' },
					{ id: 'second', name: 'Second' },
				],
			},
		}
		const result = normalizeEnv(store as never)
		expect(result.env?.activeId).toBe('first')
	})

	it('keeps the other store fields', () => {
		const store = { env: undefined, mocks: [{ id: '1' }] }
		const result = normalizeEnv(store as never)
		expect(result.mocks).toEqual([{ id: '1' }])
	})
})

describe('getActiveEnv', () => {
	it('returns the active profile', () => {
		const store = {
			env: {
				activeId: 'prod',
				profiles: [
					{ id: 'dev', name: 'Dev', vars: {} },
					{ id: 'prod', name: 'Prod', vars: { URL: 'http://prod' } },
				],
			},
		}
		expect(getActiveEnv(store as never)).toEqual({ id: 'prod', name: 'Prod', vars: { URL: 'http://prod' } })
	})

	it('returns the first profile when activeId is not found', () => {
		const store = {
			env: {
				activeId: 'not-exist',
				profiles: [
					{ id: 'first', name: 'First', vars: { A: '1' } },
				],
			},
		}
		expect(getActiveEnv(store as never)).toEqual({ id: 'first', name: 'First', vars: { A: '1' } })
	})

	it('works with the default profile', () => {
		const store = { env: undefined }
		expect(getActiveEnv(store as never)).toEqual({ id: 'default', name: 'default', vars: { BASE_URL: '' } })
	})
})

describe('getActiveEnvVars', () => {
	it('returns the variables of the active profile', () => {
		const store = {
			env: {
				activeId: 'prod',
				profiles: [
					{ id: 'dev', name: 'Dev', vars: { URL: 'http://localhost' } },
					{ id: 'prod', name: 'Prod', vars: { URL: 'http://prod', TOKEN: 'secret' } },
				],
			},
		}
		expect(getActiveEnvVars(store as never)).toEqual({ URL: 'http://prod', TOKEN: 'secret' })
	})

	it('returns an empty object when vars is missing', () => {
		const store = {
			env: {
				activeId: 'prod',
				profiles: [{ id: 'prod', name: 'Prod' }],
			},
		}
		expect(getActiveEnvVars(store as never)).toEqual({})
	})
})

describe('resolveTemplate', () => {
	it('substitutes variables', () => {
		expect(resolveTemplate('http://{BASE_URL}/api', { BASE_URL: 'example.com' })).toBe('http://example.com/api')
	})

	it('substitutes several variables', () => {
		expect(resolveTemplate('{scheme}://{host}:{port}', { scheme: 'https', host: 'localhost', port: '8080' })).toBe('https://localhost:8080')
	})

	it('leaves the input unchanged when there are no variables', () => {
		expect(resolveTemplate('http://example.com/api', {})).toBe('http://example.com/api')
	})

	it('returns an empty string for a missing variable', () => {
		expect(resolveTemplate('http://{BASE_URL}/api', {})).toBe('http:///api')
	})

	it('handles null vars', () => {
		expect(resolveTemplate('http://{BASE_URL}/api', null as never)).toBe('http:///api')
	})

	it('handles undefined input', () => {
		expect(resolveTemplate(undefined as never, { BASE_URL: 'test' })).toBe('')
	})

	it('handles null input', () => {
		expect(resolveTemplate(null as never, { BASE_URL: 'test' })).toBe('')
	})

	it('trims variable values', () => {
		expect(resolveTemplate('{VAR}', { VAR: '  test  ' })).toBe('test')
	})

	it('handles variables with spaces in their names', () => {
		expect(resolveTemplate('{ VAR }', { VAR: 'value' })).toBe('value')
	})

	it('handles non-numeric values', () => {
		expect(resolveTemplate('{VAR}', { VAR: '123' })).toBe('123')
	})
})

describe('extractTemplateVars', () => {
	it('extracts one variable', () => {
		expect(extractTemplateVars('http://{BASE_URL}/api')).toEqual(['BASE_URL'])
	})

	it('extracts several variables', () => {
		expect(extractTemplateVars('{scheme}://{host}:{port}')).toEqual(['scheme', 'host', 'port'])
	})

	it('returns an empty array when there are no variables', () => {
		expect(extractTemplateVars('http://example.com/api')).toEqual([])
	})

	it('returns unique variables', () => {
		expect(extractTemplateVars('{VAR} and {VAR} again')).toEqual(['VAR'])
	})

	it('handles undefined input', () => {
		expect(extractTemplateVars(undefined as never)).toEqual([])
	})

	it('handles null input', () => {
		expect(extractTemplateVars(null as never)).toEqual([])
	})

	it('handles variables with spaces', () => {
		expect(extractTemplateVars('{ VAR1 } and { VAR2 }')).toEqual(['VAR1', 'VAR2'])
	})

	it('extracts from a string containing 数字', () => {
		expect(extractTemplateVars('{var1} and {var2_3}')).toEqual(['var1', 'var2_3'])
	})
})