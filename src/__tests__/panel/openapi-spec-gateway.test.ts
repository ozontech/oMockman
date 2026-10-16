import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearOpenApiSpecCache, fetchOpenApiSpecByRuntime } from '@/panel/app/mocks/addMock/openapi-spec-gateway'

const SPEC_URL = 'https://example.com/openapi.json'

describe('fetchOpenApiSpecByRuntime', () => {
	let sendMessage: ReturnType<typeof vi.fn>

	const answer = (result: unknown) => {
		sendMessage.mockImplementation((_message: unknown, cb: (response: unknown) => void) => cb(result))
	}

	beforeEach(() => {
		clearOpenApiSpecCache()
		sendMessage = vi.fn()
		// The setup file stubs Firefox's `browser`, which the gateway prefers.
		vi.stubGlobal('browser', undefined)
		vi.stubGlobal('chrome', { runtime: { sendMessage, lastError: undefined } })
	})

	afterEach(() => {
		vi.unstubAllGlobals()
		vi.useRealTimers()
	})

	it('fetches a spec once for repeated validations', async () => {
		answer({ ok: true, sourceUrl: SPEC_URL, spec: { openapi: '3.0.0', paths: {} } })

		await fetchOpenApiSpecByRuntime(SPEC_URL)
		await fetchOpenApiSpecByRuntime(SPEC_URL)
		await fetchOpenApiSpecByRuntime(SPEC_URL)

		expect(sendMessage).toHaveBeenCalledTimes(1)
	})

	it('fetches again once the cached spec is a minute old', async () => {
		vi.useFakeTimers()
		answer({ ok: true, sourceUrl: SPEC_URL, spec: { openapi: '3.0.0', paths: {} } })

		await fetchOpenApiSpecByRuntime(SPEC_URL)
		vi.advanceTimersByTime(60_000)
		await fetchOpenApiSpecByRuntime(SPEC_URL)

		expect(sendMessage).toHaveBeenCalledTimes(2)
	})

	it('does not keep a failure', async () => {
		answer({ ok: false, error: 'Failed to load OpenAPI schema.' })

		await fetchOpenApiSpecByRuntime(SPEC_URL)
		await fetchOpenApiSpecByRuntime(SPEC_URL)

		expect(sendMessage).toHaveBeenCalledTimes(2)
	})
})
