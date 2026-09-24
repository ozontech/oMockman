import { afterEach, describe, expect, it, vi } from 'vitest'

import { isExtensionPageSender } from '@/background/sender'

const stubRuntimeId = (id: string | undefined): void => {
	vi.stubGlobal('chrome', { runtime: { id } })
}

describe('isExtensionPageSender', () => {
	afterEach(() => vi.unstubAllGlobals())

	it('accepts the DevTools panel', () => {
		stubRuntimeId('abc')
		expect(isExtensionPageSender({
			id: 'abc',
			url: 'chrome-extension://abc/public/html/panel.html',
		} as chrome.runtime.MessageSender)).toBe(true)
	})

	it('accepts a Firefox extension page', () => {
		stubRuntimeId('abc')
		expect(isExtensionPageSender({
			id: 'abc',
			url: 'moz-extension://abc/panel.html',
		} as chrome.runtime.MessageSender)).toBe(true)
	})

	it('rejects a content script - it always carries a tab', () => {
		stubRuntimeId('abc')
		expect(isExtensionPageSender({
			id: 'abc',
			url: 'https://example.com/page',
			tab: { id: 7 } as chrome.tabs.Tab,
		} as chrome.runtime.MessageSender)).toBe(false)
	})

	it('rejects a web page url', () => {
		stubRuntimeId('abc')
		expect(isExtensionPageSender({
			id: 'abc',
			url: 'https://example.com/page',
		} as chrome.runtime.MessageSender)).toBe(false)
	})

	it('rejects another extension', () => {
		stubRuntimeId('abc')
		expect(isExtensionPageSender({
			id: 'other',
			url: 'chrome-extension://other/panel.html',
		} as chrome.runtime.MessageSender)).toBe(false)
	})

	it('rejects an empty sender', () => {
		stubRuntimeId('abc')
		expect(isExtensionPageSender(undefined)).toBe(false)
		expect(isExtensionPageSender({} as chrome.runtime.MessageSender)).toBe(false)
	})
})
