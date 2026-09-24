import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { genId, getHeaders, parsePositiveIntFromInput, downloadJsonFile, copyTextToClipboard, getByPath } from '../../services'

describe('getHeaders', () => {
	it('handles undefined', () => {
		expect(getHeaders(undefined)).toEqual({})
	})

	it('handles null', () => {
		expect(getHeaders(null as unknown as undefined)).toEqual({})
	})

	it('handles an object', () => {
		const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer token' }
		expect(getHeaders(headers)).toEqual(headers)
	})

	it('handles an empty object', () => {
		expect(getHeaders({})).toEqual({})
	})

	it('handles a Headers instance', () => {
		const headers = new Headers({ 'Content-Type': 'application/json', Authorization: 'Bearer token' })
		expect(getHeaders(headers)).toEqual({
			'content-type': 'application/json',
			authorization: 'Bearer token',
		})
	})

	it('handles an empty Headers', () => {
		const headers = new Headers()
		expect(getHeaders(headers)).toEqual({})
	})
})

describe('parsePositiveIntFromInput', () => {
	it('parses a valid number', () => {
		expect(parsePositiveIntFromInput('123')).toBe(123)
	})

	it('parses a number with spaces', () => {
		expect(parsePositiveIntFromInput('  456  ')).toBe(456)
	})

	it('handles a string with non-numeric characters', () => {
		expect(parsePositiveIntFromInput('12abc34')).toBe(1234)
	})

	it('handles a string with only non-numeric characters', () => {
		expect(parsePositiveIntFromInput('abc')).toBeUndefined()
	})

	it('handles an empty string', () => {
		expect(parsePositiveIntFromInput('')).toBeUndefined()
	})

	it('handles null', () => {
		expect(parsePositiveIntFromInput(null)).toBeUndefined()
	})

	it('handles undefined', () => {
		expect(parsePositiveIntFromInput(undefined)).toBeUndefined()
	})

	it('handles an object', () => {
		expect(parsePositiveIntFromInput({} as unknown as string)).toBeUndefined()
	})

	it('handles an array', () => {
		expect(parsePositiveIntFromInput([] as unknown as string)).toBeUndefined()
	})

	it('handles a negative number', () => {
		expect(parsePositiveIntFromInput('-123')).toBe(123)
	})

	it('handles a floating point number', () => {
		expect(parsePositiveIntFromInput('12.34')).toBe(1234)
	})
})

describe('genId', () => {
	it('generates an ID', () => {
		const id = genId()
		expect(typeof id).toBe('string')
		expect(id.length).toBeGreaterThan(0)
	})

	it('generates unique IDs', () => {
		const id1 = genId()
		const id2 = genId()
		expect(id1).not.toBe(id2)
	})

	it('the ID contains a hyphen', () => {
		const id = genId()
		expect(id).toContain('-')
	})
})

describe('downloadJsonFile', () => {
	beforeEach(() => {
		vi.stubGlobal('URL', {
			createObjectURL: vi.fn(() => 'blob:mock-url'),
			revokeObjectURL: vi.fn(),
		})
		document.body.innerHTML = ''
	})

	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it('creates a blob and downloads the file', () => {
		const mockCreateElement = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
			const el = document.createElement(tag)
			if (tag === 'a') {
				vi.spyOn(el, 'click').mockImplementation(vi.fn())
				vi.spyOn(el, 'appendChild').mockImplementation(() => el)
				vi.spyOn(el, 'removeChild').mockImplementation(() => el)
			}
			return el
		})

		downloadJsonFile('test.json', { foo: 'bar' })
		expect(mockCreateElement).toHaveBeenCalledWith('a')
	})

	it('handles errors without throwing', () => {
		vi.stubGlobal('Blob', undefined)
		expect(() => downloadJsonFile('test.json', { data: 1 })).not.toThrow()
	})
})

describe('copyTextToClipboard', () => {
	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it('returns false for an empty string', async () => {
		const result = await copyTextToClipboard('')
		expect(result).toBe(false)
	})

	it('returns false for null/undefined', async () => {
		const result = await copyTextToClipboard(undefined as unknown as string)
		expect(result).toBe(false)
	})

	it('uses navigator.clipboard when available', async () => {
		const mockWriteText = vi.fn().mockResolvedValue(undefined)
		vi.stubGlobal('navigator', {
			clipboard: { writeText: mockWriteText },
		})

		const result = await copyTextToClipboard('test text')
		expect(mockWriteText).toHaveBeenCalledWith('test text')
		expect(result).toBe(true)
	})

	it('returns false when the clipboard API throws and the fallback fails', async () => {
		vi.stubGlobal('navigator', {
			clipboard: { writeText: vi.fn().mockRejectedValue(new Error('Clipboard error')) },
		})

		vi.spyOn(document, 'createElement').mockImplementation((tag) => {
			const el = document.createElement(tag)
			if (tag === 'textarea') {
				const textarea = el as HTMLTextAreaElement
				textarea.value = 'test text'
				vi.spyOn(textarea, 'select').mockImplementation(() => {
					throw new Error('Select error')
				})
				vi.spyOn(textarea, 'setSelectionRange').mockImplementation(vi.fn())
			}
			return el
		})

		const result = await copyTextToClipboard('test text')
		expect(result).toBe(false)
	})
})

describe('getByPath', () => {
	const store = { mocks: [{ name: 'a' }, { name: 'b' }], nested: { deep: { value: 42 } } }

	it('reads a value by bracket path (like mocks[0])', () => {
		expect(getByPath(store, 'mocks[0]')).toEqual({ name: 'a' })
		expect(getByPath(store, 'mocks[1].name')).toBe('b')
	})

	it('reads a value by dot path', () => {
		expect(getByPath(store, 'nested.deep.value')).toBe(42)
	})

	it('returns defaultValue for a missing path', () => {
		expect(getByPath(store, 'mocks[5]', null)).toBeNull()
		expect(getByPath(store, 'nested.missing.value', 'fallback')).toBe('fallback')
	})

	it('returns defaultValue for a null/undefined object', () => {
		expect(getByPath(null, 'a.b', 'def')).toBe('def')
		expect(getByPath(undefined, 'a.b')).toBeUndefined()
	})
})