import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { attachFakeContentSide, flushMicrotasks } from '../helpers/bridge-harness'

import { installBridge, resetBridgeForTests } from '@/inject/bridge'
import { applyFetchWrapper } from '@/inject/fetch-wrapper'
import { registerNativeFetch, resetSenderForTests, sendFromPage } from '@/inject/sender'
import type { ISendRequest } from '@/interface/bridge'

const request: ISendRequest = {
	method: 'post',
	url: 'https://api.example.com/orders?page=2',
	headers: [{ name: 'authorization', value: 'Bearer t' }],
	body: '{"qty":1}',
	withCredentials: true,
}

describe('inject/sender', () => {
	let nativeFetch: ReturnType<typeof vi.fn>

	beforeEach(() => {
		resetSenderForTests()
		nativeFetch = vi.fn().mockResolvedValue(new Response('{"ok":true}', {
			status: 201,
			statusText: 'Created',
			headers: { 'content-type': 'application/json', 'x-trace': 'abc' },
		}))
	})

	afterEach(() => {
		resetSenderForTests()
	})

	it('sends with the page cookies, the headers and the body, and returns the answer', async () => {
		registerNativeFetch(nativeFetch as unknown as typeof fetch)

		const result = await sendFromPage(request)

		const [url, init] = nativeFetch.mock.calls[0] as [string, RequestInit]
		expect(url).toBe('https://api.example.com/orders?page=2')
		expect(init.method).toBe('POST')
		expect(init.credentials).toBe('include')
		expect(init.body).toBe('{"qty":1}')
		expect(new Headers(init.headers).get('authorization')).toBe('Bearer t')
		expect(result).toMatchObject({ ok: true, status: 201, statusText: 'Created', body: '{"ok":true}' })
		expect(result.ok && result.headers).toContainEqual({ name: 'x-trace', value: 'abc' })
	})

	it('keeps the cookies home when asked, and sends no body with GET', async () => {
		registerNativeFetch(nativeFetch as unknown as typeof fetch)

		await sendFromPage({ ...request, method: 'GET', withCredentials: false })

		const [, init] = nativeFetch.mock.calls[0] as [string, RequestInit]
		expect(init.credentials).toBe('same-origin')
		expect(init.body).toBeUndefined()
	})

	it('reports a network failure, a bad URL and a missing native fetch', async () => {
		expect(await sendFromPage(request)).toMatchObject({ ok: false, reason: 'unavailable' })

		registerNativeFetch(vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) as unknown as typeof fetch)
		expect(await sendFromPage(request)).toEqual({ ok: false, reason: 'network', error: 'Failed to fetch' })
		expect(await sendFromPage({ ...request, url: 'ftp://files.example.com/a' })).toMatchObject({ ok: false, reason: 'invalid' })
	})

	it('does not read a binary body', async () => {
		registerNativeFetch(vi.fn().mockResolvedValue(new Response('PDF', {
			headers: { 'content-type': 'application/pdf', 'content-length': '3' },
		})) as unknown as typeof fetch)

		expect(await sendFromPage(request)).toMatchObject({ ok: true, body: '', binary: true, size: 3 })
	})

	describe('over the bridge', () => {
		let realFetch: ReturnType<typeof vi.fn>
		let originalFetch: typeof fetch

		beforeEach(() => {
			originalFetch = globalThis.fetch
			realFetch = vi.fn().mockResolvedValue(new Response('{"real":true}', { status: 200 }))
			globalThis.fetch = realFetch as unknown as typeof fetch
			;(globalThis as { __MOCKMAN_FETCH_WRAPPED__?: boolean }).__MOCKMAN_FETCH_WRAPPED__ = false
			resetBridgeForTests()
			installBridge()
		})

		afterEach(() => {
			globalThis.fetch = originalFetch
			;(globalThis as { __MOCKMAN_FETCH_WRAPPED__?: boolean }).__MOCKMAN_FETCH_WRAPPED__ = false
			resetBridgeForTests()
		})

		it('goes to the network even when a mock matches the URL', async () => {
			const harness = attachFakeContentSide(() => ({ status: 200, response: '{"mocked":true}', headers: [] }))
			await harness.ready
			applyFetchWrapper()

			harness.post({ k: 'send', id: 7, request })
			await flushMicrotasks(10)

			expect(realFetch).toHaveBeenCalledTimes(1)
			const answer = harness.received.find((message) => message.k === 'send:res') as { id: number; result: { body: string } }
			expect(answer.id).toBe(7)
			expect(answer.result.body).toBe('{"real":true}')
			expect(harness.received.some((message) => message.k === 'match')).toBe(false)
		})
	})
})
