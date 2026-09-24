import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { attachFakeContentSide, flushMicrotasks } from '../helpers/bridge-harness'

import { installBridge, resetBridgeForTests } from '@/inject/bridge'
import { RequestIdManager } from '@/inject/id-map'
import { applyXhrWrapper } from '@/inject/xhr-wrapper'

type WrapFlags = { __MOCKMAN_XHR_WRAPPED__?: boolean }

const MOCKED_URL = 'https://example.com/api/users'

const originalOpen = XMLHttpRequest.prototype.open
const originalSend = XMLHttpRequest.prototype.send
const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader

describe('applyXhrWrapper', () => {
	let ids: RequestIdManager
	let sendSpy: ReturnType<typeof vi.fn>

	beforeEach(() => {
		ids = new RequestIdManager()
		sendSpy = vi.fn()
		XMLHttpRequest.prototype.open = vi.fn()
		XMLHttpRequest.prototype.send = sendSpy as unknown as typeof XMLHttpRequest.prototype.send
		XMLHttpRequest.prototype.setRequestHeader = vi.fn()
		;(globalThis as WrapFlags).__MOCKMAN_XHR_WRAPPED__ = false
		resetBridgeForTests()
		installBridge()
	})

	afterEach(() => {
		XMLHttpRequest.prototype.open = originalOpen
		XMLHttpRequest.prototype.send = originalSend
		XMLHttpRequest.prototype.setRequestHeader = originalSetRequestHeader
		;(globalThis as WrapFlags).__MOCKMAN_XHR_WRAPPED__ = false
		resetBridgeForTests()
		vi.clearAllMocks()
	})

	it('does not wrap twice', () => {
		applyXhrWrapper(ids)
		const wrappedSend = XMLHttpRequest.prototype.send
		applyXhrWrapper(ids)
		expect(XMLHttpRequest.prototype.send).toBe(wrappedSend)
	})

	it('sets the wrapped flag', () => {
		applyXhrWrapper(ids)
		expect((globalThis as WrapFlags).__MOCKMAN_XHR_WRAPPED__).toBe(true)
	})

	it('serves a mocked response and dispatches the native events', async () => {
		await attachFakeContentSide((method, url) =>
			method === 'GET' && url === MOCKED_URL
				? { status: 201, response: '{"mocked":true}', headers: [{ name: 'x-mock', value: '1' }] }
				: null).ready
		applyXhrWrapper(ids)

		const xhr = new XMLHttpRequest()
		const events: string[] = []
		xhr.addEventListener('readystatechange', () => events.push('readystatechange'))
		xhr.addEventListener('load', () => events.push('load'))
		xhr.addEventListener('loadend', () => events.push('loadend'))

		xhr.open('GET', MOCKED_URL)
		xhr.send()
		await flushMicrotasks()

		expect(xhr.status).toBe(201)
		expect(xhr.responseText).toBe('{"mocked":true}')
		expect(xhr.getResponseHeader('X-Mock')).toBe('1')
		expect(events).toEqual(['readystatechange', 'load', 'loadend'])
		expect(sendSpy).not.toHaveBeenCalled()
	})

	it('passes unmocked requests to the network', async () => {
		await attachFakeContentSide(() => null).ready
		applyXhrWrapper(ids)

		const xhr = new XMLHttpRequest()
		xhr.open('GET', 'https://example.com/api/other')
		xhr.send('payload')
		await flushMicrotasks()

		expect(sendSpy).toHaveBeenCalledTimes(1)
	})

	it('reaches the network at most once when serving the mock fails', async () => {
		// A throw on the success path used to fall into .catch, which sent the request again.
		await attachFakeContentSide(() => ({ status: 200, response: '{}', headers: [] })).ready
		applyXhrWrapper(ids)

		const xhr = new XMLHttpRequest()
		xhr.open('GET', MOCKED_URL)
		Object.defineProperty(xhr, 'dispatchEvent', {
			value: () => {
				throw new Error('page handler exploded')
			},
		})
		xhr.send()
		await flushMicrotasks()

		expect(sendSpy.mock.calls.length).toBeLessThanOrEqual(1)
	})

	it('never mocks synchronous requests', async () => {
		await attachFakeContentSide(() => ({ status: 200, response: '{"mocked":true}', headers: [] })).ready
		applyXhrWrapper(ids)

		const xhr = new XMLHttpRequest()
		xhr.open('GET', MOCKED_URL, false)
		xhr.send()
		await flushMicrotasks()

		expect(sendSpy).toHaveBeenCalledTimes(1)
	})

	it('goes to the network when the bridge is unavailable', async () => {
		applyXhrWrapper(ids)
		resetBridgeForTests()

		const xhr = new XMLHttpRequest()
		xhr.open('GET', MOCKED_URL)
		xhr.send()
		await flushMicrotasks()

		expect(sendSpy).toHaveBeenCalledTimes(1)
	})
})
