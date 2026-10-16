import { describe, expect, it } from 'vitest'

import { isFromExtensionPage } from '@/contentScript/sender-check'

const ID = 'abcdefghijklmnop'
const BASE = `chrome-extension://${ID}/`

describe('contentScript/sender-check', () => {
	it('accepts the DevTools panel, which Chrome reports with the inspected tab', () => {
		const sender = { id: ID, url: `${BASE}public/html/panel.html`, tab: { id: 7 } }
		expect(isFromExtensionPage(sender, ID, BASE)).toBe(true)
	})

	it('accepts a panel opened as a page', () => {
		expect(isFromExtensionPage({ id: ID, url: `${BASE}public/html/panel.html` }, ID, BASE)).toBe(true)
	})

	it('refuses a content script, whose page is the site', () => {
		expect(isFromExtensionPage({ id: ID, url: 'https://evil.example/', tab: { id: 7 } } as never, ID, BASE)).toBe(false)
	})

	it('refuses another extension', () => {
		expect(isFromExtensionPage({ id: 'other', url: 'chrome-extension://other/x.html' }, ID, BASE)).toBe(false)
	})

	it('refuses a page of another extension that claims our id', () => {
		expect(isFromExtensionPage({ id: ID, url: 'chrome-extension://other/x.html' }, ID, BASE)).toBe(false)
	})

	it('accepts a sender known only by its origin', () => {
		expect(isFromExtensionPage({ id: ID, origin: `chrome-extension://${ID}` }, ID, BASE)).toBe(true)
		expect(isFromExtensionPage({ id: ID, origin: `chrome-extension://${ID}x` }, ID, BASE)).toBe(false)
	})

	it('works with Firefox addresses', () => {
		const base = 'moz-extension://1234-uuid/'
		expect(isFromExtensionPage({ id: ID, url: `${base}public/html/panel.html` }, ID, base)).toBe(true)
	})
})
