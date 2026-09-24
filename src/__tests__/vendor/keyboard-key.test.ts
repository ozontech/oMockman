import { describe, it, expect } from 'vitest'

import keyboardKey from '../../vendor/keyboard-key'

describe('keyboardKey.getCode', () => {
	it('returns Backspace for key "Backspace"', () => {
		expect(keyboardKey.getCode({ key: 'Backspace' })).toBe('Backspace')
	})

	it('returns Enter for key "Enter"', () => {
		expect(keyboardKey.getCode({ key: 'Enter' })).toBe('Enter')
	})

	it('returns Escape for key "Escape"', () => {
		expect(keyboardKey.getCode({ key: 'Escape' })).toBe('Escape')
	})

	it('returns Escape for key "Esc"', () => {
		expect(keyboardKey.getCode({ key: 'Esc' })).toBe('Escape')
	})

	it('returns ArrowDown for key "ArrowDown"', () => {
		expect(keyboardKey.getCode({ key: 'ArrowDown' })).toBe('ArrowDown')
	})

	it('returns ArrowUp for key "ArrowUp"', () => {
		expect(keyboardKey.getCode({ key: 'ArrowUp' })).toBe('ArrowUp')
	})

	it('returns Spacebar for key " "', () => {
		expect(keyboardKey.getCode({ key: ' ' })).toBe('Spacebar')
	})

	it('returns Spacebar for key "Space"', () => {
		expect(keyboardKey.getCode({ key: 'Space' })).toBe('Spacebar')
	})

	it('returns Backspace for keyCode 8', () => {
		expect(keyboardKey.getCode({ keyCode: 8 })).toBe('Backspace')
	})

	it('returns Enter for keyCode 13', () => {
		expect(keyboardKey.getCode({ keyCode: 13 })).toBe('Enter')
	})

	it('returns Escape for keyCode 27', () => {
		expect(keyboardKey.getCode({ keyCode: 27 })).toBe('Escape')
	})

	it('returns Spacebar for keyCode 32', () => {
		expect(keyboardKey.getCode({ keyCode: 32 })).toBe('Spacebar')
	})

	it('returns ArrowUp for keyCode 38', () => {
		expect(keyboardKey.getCode({ keyCode: 38 })).toBe('ArrowUp')
	})

	it('returns ArrowDown for keyCode 40', () => {
		expect(keyboardKey.getCode({ keyCode: 40 })).toBe('ArrowDown')
	})

	it('returns an empty string for an unknown keyCode', () => {
		expect(keyboardKey.getCode({ keyCode: 100 })).toBe('')
	})

	it('returns an empty string for undefined', () => {
		expect(keyboardKey.getCode({})).toBe('')
	})

	it('returns the value by keyCode when present', () => {
		expect(keyboardKey.getCode({ keyCode: 13, which: 8 })).toBe('Enter')
	})

	it('returns the value by which when keyCode is missing', () => {
		expect(keyboardKey.getCode({ which: 8 })).toBe('Backspace')
	})

	it('returns an empty string for invalid values', () => {
		expect(keyboardKey.getCode({ key: null })).toBe('')
		expect(keyboardKey.getCode({ keyCode: 'abc' as unknown as number })).toBe('')
	})
})