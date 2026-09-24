import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { attachFakeContentSide, flushMicrotasks } from '../helpers/bridge-harness'

import { RequestIdManager } from '@/inject/id-map'
import { installBridge, resetBridgeForTests } from '@/inject/bridge'
import { applyFetchWrapper } from '@/inject/fetch-wrapper'
import { MAX_LOGGED_BODY_BYTES } from '@/inject/limits'

type WrapFlags = {
	__MOCKMAN_FETCH_WRAPPED__?: boolean
	fetch?: typeof fetch
}

const MOCKED_URL = 'https://example.com/api/users'

describe('applyFetchWrapper', () => {
	let ids: RequestIdManager
	let realFetch: ReturnType<typeof vi.fn>
	let originalFetch: typeof fetch

	beforeEach(() => {
		ids = new RequestIdManager()
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
		applyFetchWrapper(ids)
		const wrapped = globalThis.fetch
		applyFetchWrapper(ids)
		expect(globalThis.fetch).toBe(wrapped)
	})

	it('sets the wrapped flag', () => {
		applyFetchWrapper(ids)
		expect((globalThis as WrapFlags).__MOCKMAN_FETCH_WRAPPED__).toBe(true)
	})

	it('serves a mocked response without touching the network', async () => {
		await attachFakeContentSide((method, url) =>
			method === 'GET' && url === MOCKED_URL
				? { status: 418, response: '{"mocked":true}', headers: [{ name: 'x-mock', value: '1' }] }
				: null).ready
		applyFetchWrapper(ids)

		const response = await globalThis.fetch(MOCKED_URL)

		expect(response.status).toBe(418)
		expect(await response.text()).toBe('{"mocked":true}')
		expect(response.headers.get('x-mock')).toBe('1')
		expect(realFetch).not.toHaveBeenCalled()
	})

	it('passes unmocked requests through to the network', async () => {
		await attachFakeContentSide(() => null).ready
		applyFetchWrapper(ids)

		const response = await globalThis.fetch('https://example.com/api/other')

		expect(await response.text()).toBe('{"real":true}')
		expect(realFetch).toHaveBeenCalledTimes(1)
	})

	it('logs over the bridge once a panel asks for logs', async () => {
		const harness = attachFakeContentSide(() => null)
		applyFetchWrapper(ids)
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
		applyFetchWrapper(ids)
		harness.setLogging(true)
		await flushMicrotasks()

		const response = await globalThis.fetch('https://example.com/api/huge')
		await flushMicrotasks()

		// The page still gets the whole body; only the log leaves it out.
		expect((await response.text()).length).toBe(huge.length)
		const log = harness.logs[0].message as { response?: { response?: string; tooLarge?: boolean; size?: number } }
		expect(log.response?.response).toBe('')
		expect(log.response?.tooLarge).toBe(true)
		expect(log.response?.size).toBe(huge.length)
	})

	it('keeps a body under the limit intact, with no marker in it', async () => {
		realFetch.mockResolvedValue(new Response('{"a":1}', { status: 200 }))
		const harness = attachFakeContentSide(() => null)
		applyFetchWrapper(ids)
		harness.setLogging(true)
		await flushMicrotasks()

		await globalThis.fetch('https://example.com/api/small')
		await flushMicrotasks()

		const log = harness.logs[0].message as { response?: { response?: string; tooLarge?: boolean } }
		expect(log.response?.response).toBe('{"a":1}')
		expect(log.response?.tooLarge).toBeUndefined()
	})

	it('falls back to the original fetch when the bridge is gone', async () => {
		applyFetchWrapper(ids)
		resetBridgeForTests()

		const response = await globalThis.fetch(MOCKED_URL)

		expect(await response.text()).toBe('{"real":true}')
		expect(realFetch).toHaveBeenCalledTimes(1)
	})
})
