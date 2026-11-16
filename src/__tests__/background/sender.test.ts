import { afterEach, describe, expect, it, vi } from 'vitest'

import { isExtensionPageSender, isMcpSettingsSender } from '@/background/sender'

/** In Firefox the page host is a per-install UUID, not the extension id. */
const stubRuntime = (id: string | undefined, base = `chrome-extension://${id}/`): void => {
	vi.stubGlobal('chrome', { runtime: { id, getURL: (path: string) => new URL(path, base).href } })
}

const sender = (fields: Partial<chrome.runtime.MessageSender>) => fields as chrome.runtime.MessageSender

describe('isExtensionPageSender', () => {
	afterEach(() => vi.unstubAllGlobals())

	it('accepts the DevTools panel', () => {
		stubRuntime('abc')
		expect(isExtensionPageSender(sender({ id: 'abc', url: 'chrome-extension://abc/public/html/panel.html' }))).toBe(true)
	})

	it('accepts the Firefox panel, whose host is not the extension id', () => {
		stubRuntime('{gecko-id}', 'moz-extension://3f2a-uuid/')
		expect(isExtensionPageSender(sender({ id: '{gecko-id}', url: 'moz-extension://3f2a-uuid/public/html/panel.html' }))).toBe(true)
	})

	it('rejects an extension page that is not on the privileged list', () => {
		stubRuntime('abc')
		expect(isExtensionPageSender(sender({ id: 'abc', url: 'chrome-extension://abc/public/html/popup.html' }))).toBe(false)
		expect(isExtensionPageSender(sender({ id: 'abc', url: 'chrome-extension://abc/js/inject.js' }))).toBe(false)
	})

	it('rejects a page of another origin with our id', () => {
		stubRuntime('abc')
		expect(isExtensionPageSender(sender({ id: 'abc', url: 'chrome-extension://other/public/html/panel.html' }))).toBe(false)
		expect(isExtensionPageSender(sender({ id: 'abc', url: 'https://abc/public/html/panel.html' }))).toBe(false)
	})

	it('accepts our packaged panel opened in a browser tab', () => {
		stubRuntime('abc')
		expect(isExtensionPageSender(sender({
			id: 'abc',
			url: 'chrome-extension://abc/public/html/panel.html',
			tab: { id: 7 } as chrome.tabs.Tab,
		}))).toBe(true)
	})

	it('rejects content scripts even with our runtime id and a panel-like path', () => {
		stubRuntime('abc')
		expect(isExtensionPageSender(sender({
			id: 'abc', url: 'https://app.example.com/public/html/panel.html',
			tab: { id: 7 } as chrome.tabs.Tab,
		}))).toBe(false)
	})

	it('rejects another extension', () => {
		stubRuntime('abc')
		expect(isExtensionPageSender(sender({ id: 'other', url: 'chrome-extension://other/public/html/panel.html' }))).toBe(false)
	})

	it('rejects a sender without an id', () => {
		stubRuntime('abc')
		expect(isExtensionPageSender(sender({ url: 'chrome-extension://abc/public/html/panel.html' }))).toBe(false)
	})

	it('rejects everything when the runtime id is unknown', () => {
		stubRuntime(undefined, 'chrome-extension://abc/')
		expect(isExtensionPageSender(sender({ url: 'chrome-extension://abc/public/html/panel.html' }))).toBe(false)
	})

	it('rejects an empty sender', () => {
		stubRuntime('abc')
		expect(isExtensionPageSender(undefined)).toBe(false)
		expect(isExtensionPageSender({} as chrome.runtime.MessageSender)).toBe(false)
	})
})


describe('isMcpSettingsSender', () => {
 afterEach(() => vi.unstubAllGlobals())
 it('allows only the dedicated extension page, including a browser tab', () => {
  stubRuntime('abc')
  const setup = sender({ id: 'abc', url: 'chrome-extension://abc/public/html/mcp.html', tab: { id: 7 } as chrome.tabs.Tab })
  expect(isMcpSettingsSender(setup)).toBe(true)
  expect(isExtensionPageSender(setup)).toBe(false)
  expect(isMcpSettingsSender(sender({ ...setup, url: 'https://app.example.test/public/html/mcp.html' }))).toBe(false)
  expect(isMcpSettingsSender(sender({ ...setup, id: 'other' }))).toBe(false)
  expect(isMcpSettingsSender(sender({ ...setup, url: 'chrome-extension://abc/public/html/popup.html' }))).toBe(false)
 })
 it('supports Firefox extension UUID without trusting the addon id as origin', () => {
  stubRuntime('{gecko-id}', 'moz-extension://installation-uuid/')
  expect(isMcpSettingsSender(sender({ id: '{gecko-id}', url: 'moz-extension://installation-uuid/public/html/mcp.html' }))).toBe(true)
 })
})
