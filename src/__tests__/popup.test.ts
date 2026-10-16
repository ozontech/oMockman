import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { applyStoredTheme, initPopup, setMockingActive } from '@/popup'
import type { PopupDeps } from '@/popup'
import { DOCS_URL } from '@/services/docs'

const STORE_KEY = 'mockman.extension.main.db'

const storageWith = (theme: string | null) => ({ getItem: () => theme })

describe('popup theme', () => {
	afterEach(() => {
		delete document.documentElement.dataset.theme
	})

	it.each(['light', 'dark'])('follows the %s theme picked in the panel', (theme) => {
		applyStoredTheme(document.documentElement, storageWith(theme))

		expect(document.documentElement.dataset.theme).toBe(theme)
	})

	it.each([null, 'system', 'nonsense'])('leaves %s to the system theme', (theme) => {
		document.documentElement.dataset.theme = 'dark'

		applyStoredTheme(document.documentElement, storageWith(theme))

		expect(document.documentElement.dataset.theme).toBeUndefined()
	})

	it('survives storage that throws', () => {
		const throwing = { getItem: () => { throw new Error('blocked') } }

		expect(() => applyStoredTheme(document.documentElement, throwing)).not.toThrow()
	})
})

describe('popup controls', () => {
	let items: Record<string, unknown>
	let changeListener: (() => void) | undefined

	const deps = (overrides: Partial<PopupDeps> = {}): PopupDeps => ({
		storage: {
			get: (keys, cb) => cb(Object.fromEntries(keys.filter((key) => key in items).map((key) => [key, items[key]]))),
			set: (next, cb) => {
				Object.assign(items, next)
				cb()
			},
		},
		onStoreChanged: (listener) => {
			changeListener = listener
		},
		version: '2.4.0',
		lang: 'ru',
		...overrides,
	})

	const toggle = () => document.getElementById('mocking-toggle') as HTMLInputElement
	const label = () => document.getElementById('mocking-label')?.textContent
	const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

	beforeEach(() => {
		items = {}
		changeListener = undefined
		document.body.innerHTML = `
			<label id="mocking-row"><span id="mocking-label"></span><input type="checkbox" id="mocking-toggle" disabled /></label>
			<p id="hint"></p>
			<span id="version"></span>
			<a id="docs"></a>`
	})

	it('shows whether mocking is on, the version and the docs link', async () => {
		items[STORE_KEY] = { active: true, mocks: [] }

		await initPopup(document, deps())

		expect(toggle().checked).toBe(true)
		expect(toggle().disabled).toBe(false)
		expect(label()).toBe('Моки включены')
		expect(document.getElementById('version')?.textContent).toBe('v2.4.0')
		expect((document.getElementById('docs') as HTMLAnchorElement).href).toBe(DOCS_URL)
		expect(document.getElementById('hint')?.textContent).toBe('Панель: F12 → вкладка Mockman')
	})

	it('turns all mocks off and keeps the rest of the store', async () => {
		items[STORE_KEY] = { active: true, mocks: [{ id: 'm1' }] }
		await initPopup(document, deps())

		toggle().checked = false
		toggle().dispatchEvent(new Event('change'))
		await settle()

		expect(items[STORE_KEY]).toEqual({ active: false, mocks: [{ id: 'm1' }] })
		expect(label()).toBe('Моки выключены')
	})

	it('writes over the store as it is now, not as the popup first saw it', async () => {
		items[STORE_KEY] = { active: false, mocks: [] }
		await initPopup(document, deps())
		// The panel added a mock while the popup was open.
		items[STORE_KEY] = { active: false, mocks: [{ id: 'new' }] }

		expect(await setMockingActive(deps(), true)).toBe(true)
		expect(items[STORE_KEY]).toEqual({ active: true, mocks: [{ id: 'new' }] })
	})

	it('waits for the panel when there is no store yet', async () => {
		await initPopup(document, deps({ lang: 'en' }))

		expect(toggle().disabled).toBe(true)
		expect(label()).toBe('Open the panel to start')
		expect(await setMockingActive(deps(), true)).toBe(false)
		expect(items[STORE_KEY]).toBeUndefined()
	})

	it('shows what is stored when the write fails', async () => {
		items[STORE_KEY] = { active: true }
		await initPopup(document, deps({ lastError: () => ({ message: 'quota' }), storage: {
			get: (keys, cb) => cb({ [STORE_KEY]: items[STORE_KEY] }),
			set: (_next, cb) => cb(),
		} }))

		toggle().checked = false
		toggle().dispatchEvent(new Event('change'))
		await settle()

		expect(toggle().checked).toBe(true)
		expect(label()).toBe('Моки включены')
	})

	it('follows a change made in the panel while open', async () => {
		items[STORE_KEY] = { active: true }
		await initPopup(document, deps())

		items[STORE_KEY] = { active: false }
		changeListener?.()
		await settle()

		expect(toggle().checked).toBe(false)
	})
})
