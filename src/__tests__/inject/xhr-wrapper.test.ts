import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { attachFakeContentSide, flushMicrotasks } from '../helpers/bridge-harness'

import { installBridge, resetBridgeForTests } from '@/inject/bridge'
import { applyXhrWrapper } from '@/inject/xhr-wrapper'

type WrapFlags = { __MOCKMAN_XHR_WRAPPED__?: boolean }

const MOCKED_URL = 'https://example.com/api/users'

const originalOpen = XMLHttpRequest.prototype.open
const originalSend = XMLHttpRequest.prototype.send
const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader

describe('applyXhrWrapper', () => {
	let sendSpy: ReturnType<typeof vi.fn>

	beforeEach(() => {
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
		applyXhrWrapper()
		const wrappedSend = XMLHttpRequest.prototype.send
		applyXhrWrapper()
		expect(XMLHttpRequest.prototype.send).toBe(wrappedSend)
	})

	it('sets the wrapped flag', () => {
		applyXhrWrapper()
		expect((globalThis as WrapFlags).__MOCKMAN_XHR_WRAPPED__).toBe(true)
	})

	it('serves a mocked response and dispatches the native events', async () => {
		await attachFakeContentSide((method, url) =>
			method === 'GET' && url === MOCKED_URL
				? { status: 201, response: '{"mocked":true}', headers: [{ name: 'x-mock', value: '1' }] }
				: null).ready
		applyXhrWrapper()

		const xhr = new XMLHttpRequest()
		const events: string[] = []
		xhr.addEventListener('readystatechange', () => events.push('readystatechange'))
		xhr.addEventListener('load', () => events.push('load'))
		xhr.addEventListener('loadend', () => events.push('loadend'))

		xhr.open('GET', MOCKED_URL)
		xhr.send()
		await flushMicrotasks()

		expect(xhr.status).toBe(201)
		expect(xhr.statusText).toBe('Created')
		expect(xhr.readyState).toBe(4)
		expect(xhr.responseText).toBe('{"mocked":true}')
		expect(xhr.response).toBe('{"mocked":true}')
		expect(xhr.getResponseHeader('X-Mock')).toBe('1')
		expect(events).toEqual(['readystatechange', 'readystatechange', 'readystatechange', 'load', 'loadend'])
		expect(sendSpy).not.toHaveBeenCalled()
	})

	it('reports readyState DONE to readystatechange handlers that wait for it', async () => {
		// Older axios resolves from onreadystatechange only when readyState is 4.
		await attachFakeContentSide(() => ({ status: 200, response: '{}', headers: [] })).ready
		applyXhrWrapper()

		const xhr = new XMLHttpRequest()
		const states: number[] = []
		xhr.onreadystatechange = () => states.push(xhr.readyState)
		xhr.open('GET', MOCKED_URL)
		xhr.send()
		await flushMicrotasks()

		expect(states).toEqual([2, 3, 4])
	})

	it.each([
		['json', (value: unknown) => expect(value).toEqual({ mocked: true })],
		['text', (value: unknown) => expect(value).toBe('{"mocked":true}')],
		['arraybuffer', (value: unknown) => expect(new TextDecoder().decode(value as ArrayBuffer)).toBe('{"mocked":true}')],
	] as const)('serves the mock as responseType %s', async (responseType, check) => {
		await attachFakeContentSide(() => ({ status: 200, response: '{"mocked":true}', headers: [] })).ready
		applyXhrWrapper()

		const xhr = new XMLHttpRequest()
		xhr.open('GET', MOCKED_URL)
		xhr.responseType = responseType
		xhr.send()
		await flushMicrotasks()

		check(xhr.response)
	})

	it('serves the mock as a Blob with the mocked content type', async () => {
		await attachFakeContentSide(() => ({
			status: 200,
			response: 'a,b',
			headers: [{ name: 'Content-Type', value: 'text/csv' }],
		})).ready
		applyXhrWrapper()

		const xhr = new XMLHttpRequest()
		xhr.open('GET', MOCKED_URL)
		xhr.responseType = 'blob'
		xhr.send()
		await flushMicrotasks()

		const blob = xhr.response as Blob
		expect(blob).toBeInstanceOf(Blob)
		expect(blob.type).toBe('text/csv')
		expect(blob.size).toBe(3)
	})

	it('mocks a request opened with a lowercase method', async () => {
		const matched: string[] = []
		await attachFakeContentSide((method) => {
			matched.push(method)
			return method === 'GET' ? { status: 200, response: '{}', headers: [] } : null
		}).ready
		applyXhrWrapper()

		const xhr = new XMLHttpRequest()
		xhr.open('get', MOCKED_URL)
		xhr.send()
		await flushMicrotasks()

		expect(matched).toEqual(['GET'])
		expect(sendSpy).not.toHaveBeenCalled()
	})

	it('never sends a request aborted while the bridge is still answering', async () => {
		await attachFakeContentSide(() => null).ready
		applyXhrWrapper()

		const xhr = new XMLHttpRequest()
		const events: string[] = []
		xhr.addEventListener('abort', () => events.push('abort'))
		xhr.addEventListener('loadend', () => events.push('loadend'))
		xhr.open('GET', 'https://example.com/api/search?q=a')
		xhr.send()
		xhr.abort()
		await flushMicrotasks()

		expect(sendSpy).not.toHaveBeenCalled()
		expect(events).toEqual(['abort', 'loadend'])
		expect(xhr.status).toBe(0)
	})

	it('does not finish a delayed mock that was aborted', async () => {
		await attachFakeContentSide(() => ({ status: 200, response: '{}', headers: [], delay: 30 })).ready
		applyXhrWrapper()

		const xhr = new XMLHttpRequest()
		const events: string[] = []
		xhr.addEventListener('load', () => events.push('load'))
		xhr.addEventListener('abort', () => events.push('abort'))
		xhr.open('GET', MOCKED_URL)
		xhr.send()
		await flushMicrotasks()
		xhr.abort()
		await new Promise((resolve) => setTimeout(resolve, 60))

		expect(events).toEqual(['abort'])
	})

	it('gives a reused XHR its native state back on open', async () => {
		await attachFakeContentSide(() => ({ status: 201, response: '{}', headers: [] })).ready
		applyXhrWrapper()

		const xhr = new XMLHttpRequest()
		xhr.open('GET', MOCKED_URL)
		xhr.send()
		await flushMicrotasks()
		expect(xhr.status).toBe(201)

		xhr.open('GET', 'https://example.com/api/other')
		expect(Object.prototype.hasOwnProperty.call(xhr, 'status')).toBe(false)
		expect(Object.prototype.hasOwnProperty.call(xhr, 'getResponseHeader')).toBe(false)
	})

	it('passes unmocked requests to the network', async () => {
		await attachFakeContentSide(() => null).ready
		applyXhrWrapper()

		const xhr = new XMLHttpRequest()
		xhr.open('GET', 'https://example.com/api/other')
		xhr.send('payload')
		await flushMicrotasks()

		expect(sendSpy).toHaveBeenCalledTimes(1)
	})

	it('reaches the network at most once when serving the mock fails', async () => {
		// A throw on the success path used to fall into .catch, which sent the request again.
		await attachFakeContentSide(() => ({ status: 200, response: '{}', headers: [] })).ready
		applyXhrWrapper()

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
		applyXhrWrapper()

		const xhr = new XMLHttpRequest()
		xhr.open('GET', MOCKED_URL, false)
		xhr.send()
		await flushMicrotasks()

		expect(sendSpy).toHaveBeenCalledTimes(1)
	})

	describe('logging a real response', () => {
		const finishNatively = (xhr: XMLHttpRequest, response: unknown, status = 200): void => {
			Object.defineProperty(xhr, 'status', { configurable: true, get: () => status })
			Object.defineProperty(xhr, 'response', { configurable: true, get: () => response })
			xhr.dispatchEvent(new Event('load'))
			xhr.dispatchEvent(new Event('loadend'))
		}

		it('logs a blob download without touching responseText', async () => {
			// responseText throws for a blob, and the throw used to reach the page's window.onerror.
			const harness = attachFakeContentSide(() => null)
			await harness.ready
			harness.setLogging(true)
			await flushMicrotasks()
			applyXhrWrapper()
			const pageErrors: unknown[] = []
			const onError = (event: ErrorEvent) => pageErrors.push(event.error)
			window.addEventListener('error', onError)

			try {
				const xhr = new XMLHttpRequest()
				xhr.responseType = 'blob'
				xhr.open('GET', 'https://example.com/report.xlsx')
				xhr.send()
				await flushMicrotasks()
				finishNatively(xhr, new Blob(['12345']))
				await flushMicrotasks()

				expect(pageErrors).toEqual([])
				const log = harness.logs.at(-1)?.message as { response?: Record<string, unknown> }
				expect(log.response).toMatchObject({ status: 200, response: '', binary: true, size: 5 })
			} finally {
				window.removeEventListener('error', onError)
			}
		})

		it('logs a json response from the parsed value', async () => {
			const harness = attachFakeContentSide(() => null)
			await harness.ready
			harness.setLogging(true)
			await flushMicrotasks()
			applyXhrWrapper()

			const xhr = new XMLHttpRequest()
			xhr.responseType = 'json'
			xhr.open('GET', 'https://example.com/api/other')
			xhr.send()
			await flushMicrotasks()
			finishNatively(xhr, { real: true })
			await flushMicrotasks()

			const log = harness.logs.at(-1)?.message as { response?: Record<string, unknown> }
			expect(log.response).toMatchObject({ status: 200, response: '{"real":true}' })
		})

		it('adds no listeners while logging is off', async () => {
			await attachFakeContentSide(() => null).ready
			applyXhrWrapper()

			const xhr = new XMLHttpRequest()
			const addListener = vi.spyOn(xhr, 'addEventListener')
			xhr.open('GET', 'https://example.com/api/other')
			xhr.send()
			await flushMicrotasks()

			expect(sendSpy).toHaveBeenCalledTimes(1)
			expect(addListener).not.toHaveBeenCalled()
		})
	})

	it('goes to the network when the bridge is unavailable', async () => {
		applyXhrWrapper()
		resetBridgeForTests()

		const xhr = new XMLHttpRequest()
		xhr.open('GET', MOCKED_URL)
		xhr.send()
		await flushMicrotasks()

		expect(sendSpy).toHaveBeenCalledTimes(1)
	})

	describe('request patch', () => {
		const PATCH_URL = 'https://example.com/api/orders'
		const patchAnswer = (requestPatch: { mode: 'merge' | 'replace'; body: string }, delay?: number) => () => ({
			status: 0,
			response: '',
			headers: [],
			delay,
			network: { requestPatch },
		})

		it('sends the merged body to the network instead of serving the mock', async () => {
			await attachFakeContentSide(patchAnswer({ mode: 'merge', body: '{"qty":999}' })).ready
			applyXhrWrapper()

			const xhr = new XMLHttpRequest()
			xhr.open('POST', PATCH_URL)
			xhr.send('{"qty":1,"sku":"A"}')
			await flushMicrotasks()

			expect(sendSpy).toHaveBeenCalledTimes(1)
			expect(JSON.parse(sendSpy.mock.calls[0][0] as string)).toEqual({ qty: 999, sku: 'A' })
			expect(xhr.responseText).not.toBe('{"mocked":true}')
		})

		it('replaces a body that is not a string', async () => {
			await attachFakeContentSide(patchAnswer({ mode: 'replace', body: 'replaced' })).ready
			applyXhrWrapper()

			const xhr = new XMLHttpRequest()
			xhr.open('POST', PATCH_URL)
			xhr.send(new URLSearchParams({ a: '1' }))
			await flushMicrotasks()

			expect(sendSpy.mock.calls[0][0]).toBe('replaced')
		})

		it('sends a body it cannot merge into unchanged', async () => {
			await attachFakeContentSide(patchAnswer({ mode: 'merge', body: '{"a":2}' })).ready
			applyXhrWrapper()

			const params = new URLSearchParams({ a: '1' })
			const xhr = new XMLHttpRequest()
			xhr.open('POST', PATCH_URL)
			xhr.send(params)
			await flushMicrotasks()

			expect(sendSpy).toHaveBeenCalledTimes(1)
			expect(sendSpy.mock.calls[0][0]).toBe(params)
		})

		it('sets mock headers on the real response once it has arrived', async () => {
			await attachFakeContentSide(() => ({
				status: 0,
				response: '',
				headers: [],
				network: { responseHeaders: [{ name: 'X-Env', value: 'mock' }] },
			})).ready
			const { getAllResponseHeaders, getResponseHeader } = XMLHttpRequest.prototype
			XMLHttpRequest.prototype.getAllResponseHeaders = vi.fn(() => 'content-type: application/json\r\nx-env: stg\r\n')
			XMLHttpRequest.prototype.getResponseHeader = vi.fn((name: string) => (name === 'content-type' ? 'application/json' : null))
			try {
				applyXhrWrapper()
				let readyState = 0

				const xhr = new XMLHttpRequest()
				Object.defineProperty(xhr, 'readyState', { configurable: true, get: () => readyState })
				xhr.open('GET', PATCH_URL)
				xhr.send()
				await flushMicrotasks()
				expect(sendSpy).toHaveBeenCalledTimes(1)
				expect(xhr.getResponseHeader('x-env')).toBeNull()

				readyState = 4
				expect(xhr.getResponseHeader('x-env')).toBe('mock')
				expect(xhr.getResponseHeader('content-type')).toBe('application/json')
				expect(xhr.getAllResponseHeaders()).toBe('content-type: application/json\r\nX-Env: mock\r\n')
			} finally {
				XMLHttpRequest.prototype.getAllResponseHeaders = getAllResponseHeaders
				XMLHttpRequest.prototype.getResponseHeader = getResponseHeader
			}
		})

		it('never sends a delayed patched request that was aborted', async () => {
			await attachFakeContentSide(patchAnswer({ mode: 'replace', body: 'x' }, 30)).ready
			applyXhrWrapper()

			const xhr = new XMLHttpRequest()
			xhr.open('POST', PATCH_URL)
			xhr.send('{}')
			await flushMicrotasks()
			xhr.abort()
			await new Promise((resolve) => setTimeout(resolve, 60))

			expect(sendSpy).not.toHaveBeenCalled()
		})
	})
})
