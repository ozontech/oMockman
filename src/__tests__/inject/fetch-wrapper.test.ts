import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { attachFakeContentSide, flushMicrotasks } from '../helpers/bridge-harness'

import { installBridge, resetBridgeForTests } from '@/inject/bridge'
import { applyFetchWrapper } from '@/inject/fetch-wrapper'
import { MAX_LOGGED_BODY_BYTES } from '@/inject/limits'

type WrapFlags = {
	__MOCKMAN_FETCH_WRAPPED__?: boolean
	fetch?: typeof fetch
}

const MOCKED_URL = 'https://example.com/api/users'

describe('applyFetchWrapper', () => {
	let realFetch: ReturnType<typeof vi.fn>
	let originalFetch: typeof fetch

	beforeEach(() => {
		originalFetch = globalThis.fetch
		realFetch = vi.fn().mockResolvedValue(new Response('{"real":true}', { status: 200 }))
		globalThis.fetch = realFetch as unknown as typeof fetch
		;(globalThis as WrapFlags).__MOCKMAN_FETCH_WRAPPED__ = false
		resetBridgeForTests()
		installBridge()
	})

	afterEach(() => {
		globalThis.fetch = originalFetch
		;(globalThis as WrapFlags).__MOCKMAN_FETCH_WRAPPED__ = false
		resetBridgeForTests()
		vi.clearAllMocks()
	})

	it('does not wrap twice', () => {
		applyFetchWrapper()
		const wrapped = globalThis.fetch
		applyFetchWrapper()
		expect(globalThis.fetch).toBe(wrapped)
	})

	it('sets the wrapped flag', () => {
		applyFetchWrapper()
		expect((globalThis as WrapFlags).__MOCKMAN_FETCH_WRAPPED__).toBe(true)
	})

	it('serves a mocked response without touching the network', async () => {
		await attachFakeContentSide((method, url) =>
			method === 'GET' && url === MOCKED_URL
				? { status: 418, response: '{"mocked":true}', headers: [{ name: 'x-mock', value: '1' }] }
				: null).ready
		applyFetchWrapper()

		const response = await globalThis.fetch(MOCKED_URL)

		expect(response.status).toBe(418)
		expect(await response.text()).toBe('{"mocked":true}')
		expect(response.headers.get('x-mock')).toBe('1')
		expect(realFetch).not.toHaveBeenCalled()
	})

	it('passes unmocked requests through to the network', async () => {
		await attachFakeContentSide(() => null).ready
		applyFetchWrapper()

		const response = await globalThis.fetch('https://example.com/api/other')

		expect(await response.text()).toBe('{"real":true}')
		expect(realFetch).toHaveBeenCalledTimes(1)
	})

	it('logs over the bridge once a panel asks for logs', async () => {
		const harness = attachFakeContentSide(() => null)
		applyFetchWrapper()
		harness.setLogging(true)
		await flushMicrotasks()

		await globalThis.fetch('https://example.com/api/other')
		await flushMicrotasks()

		expect(harness.logs).toHaveLength(1)
		const log = harness.logs[0].message as { request?: { url?: string } }
		expect(log.request?.url).toBe('https://example.com/api/other')
	})

	it('drops a response body over the limit and flags the log instead', async () => {
		const huge = 'x'.repeat(MAX_LOGGED_BODY_BYTES + 100)
		realFetch.mockResolvedValue(new Response(huge, { status: 200 }))
		const harness = attachFakeContentSide(() => null)
		applyFetchWrapper()
		harness.setLogging(true)
		await flushMicrotasks()

		const response = await globalThis.fetch('https://example.com/api/huge')
		await flushMicrotasks()

		// The page still gets the whole body; only the log leaves it out.
		expect((await response.text()).length).toBe(huge.length)
		const log = harness.logs[0].message as { response?: { response?: string; tooLarge?: boolean; size?: number } }
		expect(log.response?.response).toBe('')
		expect(log.response?.tooLarge).toBe(true)
		// Reading stopped at the limit, and no Content-Length told the full size.
		expect(log.response?.size).toBeUndefined()
	})

	it('does not read a body whose Content-Length is over the limit', async () => {
		const declared = MAX_LOGGED_BODY_BYTES + 1
		const real = new Response('{}', { status: 200, headers: { 'content-length': String(declared) } })
		const clone = vi.spyOn(real, 'clone')
		realFetch.mockResolvedValue(real)
		const harness = attachFakeContentSide(() => null)
		applyFetchWrapper()
		harness.setLogging(true)
		await flushMicrotasks()

		await globalThis.fetch('https://example.com/api/huge')
		await flushMicrotasks()

		expect(clone).not.toHaveBeenCalled()
		const log = harness.logs[0].message as { response?: { tooLarge?: boolean; size?: number } }
		expect(log.response).toMatchObject({ tooLarge: true, size: declared })
	})

	it('stops reading an endless body at the limit', async () => {
		const chunk = new Uint8Array(1024 * 1024).fill(120)
		let pulled = 0
		const endless = new ReadableStream<Uint8Array>({
			pull(controller) {
				pulled += 1
				controller.enqueue(chunk)
			},
		})
		realFetch.mockResolvedValue(new Response(endless, { status: 200 }))
		const harness = attachFakeContentSide(() => null)
		applyFetchWrapper()
		harness.setLogging(true)
		await flushMicrotasks()

		await globalThis.fetch('https://example.com/api/stream')
		await vi.waitFor(() => expect(harness.logs).toHaveLength(1))

		const log = harness.logs[0].message as { response?: { tooLarge?: boolean } }
		expect(log.response?.tooLarge).toBe(true)
		expect(pulled).toBeLessThan(MAX_LOGGED_BODY_BYTES / chunk.byteLength + 5)
	})

	it('returns a streaming response before its body ends', async () => {
		// Awaiting the body for the log used to hold every fetch until the download finished.
		const neverEnds = new ReadableStream<Uint8Array>({ start() { /* never closes */ } })
		realFetch.mockResolvedValue(new Response(neverEnds, { status: 200, headers: { 'content-type': 'text/event-stream' } }))
		const harness = attachFakeContentSide(() => null)
		applyFetchWrapper()
		harness.setLogging(true)
		await flushMicrotasks()

		const response = await globalThis.fetch('https://example.com/api/events')

		expect(response.status).toBe(200)
		await flushMicrotasks()
		expect(harness.logs).toHaveLength(1)
	})

	it('logs a file download by size without reading it', async () => {
		const real = new Response('PK', {
			status: 200,
			headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-length': '2048' },
		})
		const clone = vi.spyOn(real, 'clone')
		realFetch.mockResolvedValue(real)
		const harness = attachFakeContentSide(() => null)
		applyFetchWrapper()
		harness.setLogging(true)
		await flushMicrotasks()

		await globalThis.fetch('https://example.com/report.xlsx')
		await flushMicrotasks()

		expect(clone).not.toHaveBeenCalled()
		const log = harness.logs[0].message as { response?: Record<string, unknown> }
		expect(log.response).toMatchObject({ status: 200, response: '', binary: true, size: 2048 })
	})

	it('reads no body while logging is off', async () => {
		const real = new Response('{"real":true}', { status: 200 })
		const clone = vi.spyOn(real, 'clone')
		realFetch.mockResolvedValue(real)
		await attachFakeContentSide(() => null).ready
		applyFetchWrapper()

		await globalThis.fetch('https://example.com/api/other', { method: 'POST', body: '{"a":1}' })
		await flushMicrotasks()

		expect(clone).not.toHaveBeenCalled()
	})

	it('passes a network error to the page without sending the request again', async () => {
		realFetch.mockRejectedValue(new TypeError('Failed to fetch'))
		await attachFakeContentSide(() => null).ready
		applyFetchWrapper()

		await expect(globalThis.fetch('https://example.com/api/pay', { method: 'POST', body: '{}' })).rejects.toThrow('Failed to fetch')
		expect(realFetch).toHaveBeenCalledTimes(1)
	})

	it.each([204, 205, 304])('serves a mock with the null-body status %i', async (status) => {
		await attachFakeContentSide(() => ({ status, response: 'ignored', headers: [] })).ready
		applyFetchWrapper()

		const response = await globalThis.fetch(MOCKED_URL, { method: 'DELETE' })

		expect(response.status).toBe(status)
		expect(response.body).toBeNull()
		expect(realFetch).not.toHaveBeenCalled()
	})

	it('serves a delayed 204 mock instead of hanging', async () => {
		await attachFakeContentSide(() => ({ status: 204, response: '', headers: [], delay: 20 })).ready
		applyFetchWrapper()

		const response = await globalThis.fetch(MOCKED_URL, { method: 'DELETE' })

		expect(response.status).toBe(204)
	})

	it('serves a mock with a status outside 200-599', async () => {
		await attachFakeContentSide(() => ({ status: 0, response: '', headers: [] })).ready
		applyFetchWrapper()

		const response = await globalThis.fetch(MOCKED_URL)

		expect(response.status).toBe(0)
		expect(response.ok).toBe(false)
		expect(realFetch).not.toHaveBeenCalled()
	})

	it('drops an invalid mock header and serves the rest', async () => {
		await attachFakeContentSide(() => ({
			status: 200,
			response: '{}',
			headers: [{ name: 'bad header', value: '1' }, { name: 'x-ok', value: '1' }],
		})).ready
		applyFetchWrapper()

		const response = await globalThis.fetch(MOCKED_URL)

		expect(response.headers.get('x-ok')).toBe('1')
		expect(realFetch).not.toHaveBeenCalled()
	})

	it('rejects a delayed mock when the request is aborted', async () => {
		// Node's Request refuses jsdom's AbortSignal, which a browser never does: leave the signal out of it.
		const NativeRequest = globalThis.Request
		globalThis.Request = class extends NativeRequest {
			constructor(input: RequestInfo | URL, init?: RequestInit) {
				super(input, init && { ...init, signal: undefined })
			}
		}
		try {
			await attachFakeContentSide(() => ({ status: 200, response: '{}', headers: [], delay: 1000 })).ready
			applyFetchWrapper()
			const controller = new AbortController()

			const pending = globalThis.fetch(MOCKED_URL, { signal: controller.signal })
			await flushMicrotasks()
			controller.abort()

			await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
			expect(realFetch).not.toHaveBeenCalled()
		} finally {
			globalThis.Request = NativeRequest
		}
	})

	it('keeps a body under the limit intact, with no marker in it', async () => {
		realFetch.mockResolvedValue(new Response('{"a":1}', { status: 200 }))
		const harness = attachFakeContentSide(() => null)
		applyFetchWrapper()
		harness.setLogging(true)
		await flushMicrotasks()

		await globalThis.fetch('https://example.com/api/small')
		await flushMicrotasks()

		const log = harness.logs[0].message as { response?: { response?: string; tooLarge?: boolean } }
		expect(log.response?.response).toBe('{"a":1}')
		expect(log.response?.tooLarge).toBeUndefined()
	})

	it('falls back to the original fetch when the bridge is gone', async () => {
		applyFetchWrapper()
		resetBridgeForTests()

		const response = await globalThis.fetch(MOCKED_URL)

		expect(await response.text()).toBe('{"real":true}')
		expect(realFetch).toHaveBeenCalledTimes(1)
	})

	describe('request patch', () => {
		const PATCH_URL = 'https://example.com/api/orders'
		const sentBody = async (): Promise<string> => {
			const sent = realFetch.mock.calls[0][0] as Request
			return sent.text()
		}

		it('sends the request with the merged body and returns the real response', async () => {
			await attachFakeContentSide(() => ({
				status: 200,
				response: '{"mocked":true}',
				headers: [],
				network: { requestPatch: { mode: 'merge', body: '{"qty":999,"note":null}' } },
			})).ready
			applyFetchWrapper()

			const response = await globalThis.fetch(PATCH_URL, {
				method: 'POST',
				headers: { 'content-type': 'application/json', 'x-page': '1' },
				body: '{"qty":1,"sku":"A","note":"x"}',
			})

			expect(await response.text()).toBe('{"real":true}')
			expect(realFetch).toHaveBeenCalledTimes(1)
			expect(JSON.parse(await sentBody())).toEqual({ qty: 999, sku: 'A' })
			const sent = realFetch.mock.calls[0][0] as Request
			expect(sent.method).toBe('POST')
			expect(sent.headers.get('x-page')).toBe('1')
			expect(sent.headers.get('content-type')).toBe('application/json')
		})

		it('replaces the body as written', async () => {
			await attachFakeContentSide(() => ({
				status: 200,
				response: '',
				headers: [],
				network: { requestPatch: { mode: 'replace', body: 'plain text' } },
			})).ready
			applyFetchWrapper()

			await globalThis.fetch(PATCH_URL, { method: 'PUT', body: '{"a":1}' })

			expect(await sentBody()).toBe('plain text')
		})

		it('sends the page body unchanged when a merge cannot apply', async () => {
			await attachFakeContentSide(() => ({
				status: 200,
				response: '{"mocked":true}',
				headers: [],
				network: { requestPatch: { mode: 'merge', body: '{"a":2}' } },
			})).ready
			applyFetchWrapper()

			const response = await globalThis.fetch(PATCH_URL, { method: 'POST', body: 'a=1&b=2' })

			expect(await response.text()).toBe('{"real":true}')
			expect(await sentBody()).toBe('a=1&b=2')
		})

		it('leaves a GET alone', async () => {
			await attachFakeContentSide(() => ({
				status: 200,
				response: '{"mocked":true}',
				headers: [],
				network: { requestPatch: { mode: 'replace', body: 'x' } },
			})).ready
			applyFetchWrapper()

			const response = await globalThis.fetch(PATCH_URL)

			expect(await response.text()).toBe('{"real":true}')
			expect(realFetch).toHaveBeenCalledTimes(1)
		})

		it('logs the sent body with the original next to it', async () => {
			const harness = attachFakeContentSide(() => ({
				status: 200,
				response: '',
				headers: [],
				network: { requestPatch: { mode: 'merge', body: '{"qty":999}' } },
			}))
			applyFetchWrapper()
			harness.setLogging(true)
			await flushMicrotasks()

			await globalThis.fetch(PATCH_URL, { method: 'POST', body: '{"qty":1}' })
			await flushMicrotasks()

			const log = harness.logs[0].message as {
				isMocked?: boolean
				isPatched?: boolean
				request?: { body?: string; originalBody?: string }
			}
			expect(log.isMocked).toBe(false)
			expect(log.isPatched).toBe(true)
			expect((log as { requestPatched?: boolean }).requestPatched).toBe(true)
			expect(log.request?.body).toBe('{"qty":999}')
			expect(log.request?.originalBody).toBe('{"qty":1}')
		})

		it('sets mock headers on the real response and keeps them on clones', async () => {
			realFetch.mockResolvedValue(new Response('{"real":true}', { status: 202, headers: { 'x-real': '1', 'x-env': 'stg' } }))
			await attachFakeContentSide(() => ({
				status: 0,
				response: '',
				headers: [],
				network: { responseHeaders: [{ name: 'x-env', value: 'mock' }, { name: 'x-added', value: 'yes' }] },
			})).ready
			applyFetchWrapper()

			const response = await globalThis.fetch(PATCH_URL)

			expect(response.status).toBe(202)
			expect(await response.clone().text()).toBe('{"real":true}')
			expect(response.headers.get('x-real')).toBe('1')
			expect(response.headers.get('x-env')).toBe('mock')
			expect(response.clone().headers.get('x-added')).toBe('yes')
		})

		it('logs headers set on the real response as a change', async () => {
			const harness = attachFakeContentSide(() => ({
				status: 0,
				response: '',
				headers: [],
				network: { responseHeaders: [{ name: 'x-added', value: 'yes' }] },
			}))
			applyFetchWrapper()
			harness.setLogging(true)
			await flushMicrotasks()

			await globalThis.fetch(PATCH_URL)
			await flushMicrotasks()

			const log = harness.logs[0].message as {
				isPatched?: boolean
				headersPatched?: boolean
				request?: { originalBody?: string }
				response?: { headers?: Array<{ name: string; value: string }> }
			}
			expect(log.isPatched).toBe(true)
			expect(log.headersPatched).toBe(true)
			expect((log as { requestPatched?: boolean }).requestPatched).toBeUndefined()
			expect(log.request?.originalBody).toBeUndefined()
			expect(log.response?.headers).toContainEqual({ name: 'x-added', value: 'yes' })
		})
	})
})
