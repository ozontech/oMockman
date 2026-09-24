import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { chatCompletion } from '../ai-client'
import type { IAIProviderConfig } from '../../../interface/ai'

function makeProvider(overrides: Partial<IAIProviderConfig> = {}): IAIProviderConfig {
	return {
		id: 'p-1',
		name: 'Test',
		baseURL: 'https://api.example.com/v1',
		apiKey: 'sk-test',
		model: 'gpt-4o-mini',
		createdOn: 1,
		...overrides,
	}
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { 'Content-Type': 'application/json' },
		...init,
	})
}

function textResponse(body: string, init: ResponseInit = {}): Response {
	return new Response(body, {
		status: 200,
		headers: { 'Content-Type': 'text/plain' },
		...init,
	})
}

describe('chatCompletion: success path', () => {
	beforeEach(() => {
		vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse({
			model: 'gpt-4o-mini',
			choices: [{ message: { content: '{"hello":"world"}' } }],
			usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
		}, {
			headers: {
				'Content-Type': 'application/json',
				'x-o3-trace-id': 'trace-abc',
			},
		}))
	})

	afterEach(() => vi.restoreAllMocks())

	it('returns a successful response with content, usage and trace id', async () => {
		const result = await chatCompletion(makeProvider(), [{ role: 'user', content: 'hi' }])

		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect(result.content).toBe('{"hello":"world"}')
		expect(result.model).toBe('gpt-4o-mini')
		expect(result.traceId).toBe('trace-abc')
		expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 5, totalTokens: 15 })
	})

	it('appends /chat/completions to baseURL', async () => {
		const spy = vi.spyOn(globalThis, 'fetch')
		await chatCompletion(makeProvider(), [{ role: 'user', content: 'hi' }])
		expect(spy).toHaveBeenCalledWith('https://api.example.com/v1/chat/completions', expect.any(Object))
	})

	it('strips trailing slashes from baseURL', async () => {
		const spy = vi.spyOn(globalThis, 'fetch')
		await chatCompletion(makeProvider({ baseURL: 'https://api.example.com/v1///' }), [
			{ role: 'user', content: 'hi' },
		])
		expect(spy).toHaveBeenCalledWith(
			'https://api.example.com/v1/chat/completions',
			expect.any(Object),
		)
	})

	it('uses Authorization: Bearer by default', async () => {
		const spy = vi.spyOn(globalThis, 'fetch')
		await chatCompletion(makeProvider(), [{ role: 'user', content: 'hi' }])
		const init = spy.mock.calls[0][1] as RequestInit
		expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test')
	})

	it('supports a custom auth header and prefix', async () => {
		const spy = vi.spyOn(globalThis, 'fetch')
		await chatCompletion(
			makeProvider({ authHeader: 'x-api-key', authPrefix: '' }),
			[{ role: 'user', content: 'hi' }],
		)
		const init = spy.mock.calls[0][1] as RequestInit
		const headers = init.headers as Record<string, string>
		expect(headers['x-api-key']).toBe('sk-test')
		expect(headers.Authorization).toBeUndefined()
	})

	it('forwards extra headers', async () => {
		const spy = vi.spyOn(globalThis, 'fetch')
		await chatCompletion(
			makeProvider({
				extraHeaders: [{ name: 'X-Org', value: 'wms' }, { name: '', value: 'skip' }],
			}),
			[{ role: 'user', content: 'hi' }],
		)
		const init = spy.mock.calls[0][1] as RequestInit
		const headers = init.headers as Record<string, string>
		expect(headers['X-Org']).toBe('wms')
		expect(Object.values(headers)).not.toContain('skip')
	})

	it('includes response_format when jsonMode is requested and supported', async () => {
		const spy = vi.spyOn(globalThis, 'fetch')
		await chatCompletion(
			makeProvider({ supportsJsonMode: true }),
			[{ role: 'user', content: 'hi' }],
			{ jsonMode: true },
		)
		const init = spy.mock.calls[0][1] as RequestInit
		const body = JSON.parse(init.body as string)
		expect(body.response_format).toEqual({ type: 'json_object' })
	})

	it('omits response_format when the provider disabled it', async () => {
		const spy = vi.spyOn(globalThis, 'fetch')
		await chatCompletion(
			makeProvider({ supportsJsonMode: false }),
			[{ role: 'user', content: 'hi' }],
			{ jsonMode: true },
		)
		const init = spy.mock.calls[0][1] as RequestInit
		const body = JSON.parse(init.body as string)
		expect(body.response_format).toBeUndefined()
	})

	it('honours a per-call model override', async () => {
		const spy = vi.spyOn(globalThis, 'fetch')
		await chatCompletion(makeProvider(), [{ role: 'user', content: 'hi' }], { model: 'gpt-4o' })
		const body = JSON.parse(spy.mock.calls[0][1]?.body as string)
		expect(body.model).toBe('gpt-4o')
	})

	it('keeps the default max_tokens under the 8192 gateway ceiling', async () => {
		const spy = vi.spyOn(globalThis, 'fetch')
		await chatCompletion(makeProvider(), [{ role: 'user', content: 'hi' }])
		const body = JSON.parse(spy.mock.calls[0][1]?.body as string)
		expect(body.max_tokens).toBeLessThanOrEqual(8192)
	})
})

describe('chatCompletion: invalid configuration', () => {
	beforeEach(() => {
		vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
			throw new Error('fetch should not be called for misconfig')
		})
	})

	afterEach(() => vi.restoreAllMocks())

	it('rejects an empty baseURL', async () => {
		const result = await chatCompletion(makeProvider({ baseURL: '' }), [{ role: 'user', content: 'hi' }])
		expect(result.ok).toBe(false)
		if (result.ok) return
		expect(result.error.code).toBe('provider_misconfigured')
	})

	it('rejects an empty apiKey', async () => {
		const result = await chatCompletion(makeProvider({ apiKey: '' }), [{ role: 'user', content: 'hi' }])
		expect(result.ok).toBe(false)
		if (result.ok) return
		expect(result.error.code).toBe('provider_misconfigured')
	})

	it('rejects an empty model', async () => {
		const result = await chatCompletion(makeProvider({ model: '' }), [{ role: 'user', content: 'hi' }])
		expect(result.ok).toBe(false)
		if (result.ok) return
		expect(result.error.code).toBe('provider_misconfigured')
	})

	it('rejects non-Latin-1 characters in apiKey before fetch', async () => {
		const result = await chatCompletion(
			makeProvider({ apiKey: 'key-€' }),
			[{ role: 'user', content: 'hi' }],
		)
		expect(result.ok).toBe(false)
		if (result.ok) return
		expect(result.error.code).toBe('provider_misconfigured')
		expect(result.error.message).toMatch(/non-Latin-1/i)
	})

	it('rejects non-Latin-1 characters in an extraHeaders value', async () => {
		const result = await chatCompletion(
			makeProvider({ extraHeaders: [{ name: 'X-Org', value: 'org-€' }] }),
			[{ role: 'user', content: 'hi' }],
		)
		expect(result.ok).toBe(false)
		if (result.ok) return
		expect(result.error.code).toBe('provider_misconfigured')
		expect(result.error.message).toContain('X-Org')
	})

	it('rejects a non-http baseURL', async () => {
		const result = await chatCompletion(
			makeProvider({ baseURL: 'ftp://api.example.com' }),
			[{ role: 'user', content: 'hi' }],
		)
		expect(result.ok).toBe(false)
		if (result.ok) return
		expect(result.error.code).toBe('provider_misconfigured')
	})
})

describe('chatCompletion: HTTP errors', () => {
	afterEach(() => vi.restoreAllMocks())

	it('classifies 401 as token_invalid', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(textResponse('Unauthorized. Check token.', {
			status: 401,
			headers: { 'Content-Type': 'text/plain', 'x-o3-trace-id': 'trace-401' },
		}))

		const result = await chatCompletion(makeProvider(), [{ role: 'user', content: 'hi' }])
		expect(result.ok).toBe(false)
		if (result.ok) return
		expect(result.error.code).toBe('token_invalid')
		expect(result.error.status).toBe(401)
		expect(result.error.traceId).toBe('trace-401')
	})

	it('classifies 429 as rate_limited', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(textResponse('slow down', { status: 429 }))
		const result = await chatCompletion(makeProvider(), [{ role: 'user', content: 'hi' }])
		expect(result.ok).toBe(false)
		if (result.ok) return
		expect(result.error.code).toBe('rate_limited')
	})

	it('classifies 500 as bad_response', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(textResponse('boom', { status: 500 }))
		const result = await chatCompletion(makeProvider(), [{ role: 'user', content: 'hi' }])
		expect(result.ok).toBe(false)
		if (result.ok) return
		expect(result.error.code).toBe('bad_response')
	})

	it('does not buffer a huge error body', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(textResponse('x'.repeat(1024 * 1024), { status: 500 }))
		const result = await chatCompletion(makeProvider(), [{ role: 'user', content: 'hi' }])
		expect(result.ok).toBe(false)
		if (result.ok) return
		expect(result.error.message).toBe('HTTP 500')
	})
})

describe('chatCompletion: response body problems', () => {
	afterEach(() => vi.restoreAllMocks())

	it('returns bad_response for malformed JSON', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('not json', {
			status: 200,
			headers: { 'Content-Type': 'application/json' },
		}))

		const result = await chatCompletion(makeProvider(), [{ role: 'user', content: 'hi' }])
		expect(result.ok).toBe(false)
		if (result.ok) return
		expect(result.error.code).toBe('bad_response')
	})

	it('returns bad_response when content is empty', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
			model: 'gpt-4o-mini',
			choices: [{ message: { content: '' } }],
		}))

		const result = await chatCompletion(makeProvider(), [{ role: 'user', content: 'hi' }])
		expect(result.ok).toBe(false)
		if (result.ok) return
		expect(result.error.code).toBe('bad_response')
	})
})

describe('chatCompletion: network and cancellation', () => {
	afterEach(() => vi.restoreAllMocks())

	it('classifies a thrown network error', async () => {
		vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
		const result = await chatCompletion(makeProvider(), [{ role: 'user', content: 'hi' }])
		expect(result.ok).toBe(false)
		if (result.ok) return
		expect(result.error.code).toBe('network')
	})

	it('classifies cancellation as aborted, not as a failure', async () => {
		vi.spyOn(globalThis, 'fetch').mockRejectedValue(new DOMException('aborted', 'AbortError'))
		const result = await chatCompletion(makeProvider(), [{ role: 'user', content: 'hi' }])
		expect(result.ok).toBe(false)
		if (result.ok) return
		expect(result.error.code).toBe('aborted')
	})

	it('passes the caller\'s cancellation through to fetch', async () => {
		const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
			choices: [{ message: { content: '{}' } }],
		}))
		const controller = new AbortController()
		await chatCompletion(makeProvider(), [{ role: 'user', content: 'hi' }], { signal: controller.signal })

		const init = spy.mock.calls[0][1] as RequestInit
		expect(init.signal).toBeInstanceOf(AbortSignal)
		expect(init.signal?.aborted).toBe(false)
		controller.abort()
		expect(init.signal?.aborted).toBe(true)
	})

	it('forbids redirects and sends no cookies', async () => {
		const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
			choices: [{ message: { content: '{}' } }],
		}))
		await chatCompletion(makeProvider(), [{ role: 'user', content: 'hi' }])

		const init = spy.mock.calls[0][1] as RequestInit
		expect(init.redirect).toBe('error')
		expect(init.credentials).toBe('omit')
	})

	it('sets its own timeout even without one from the caller', async () => {
		vi.useFakeTimers()
		vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => new Promise((_resolve, reject) => {
			init?.signal?.addEventListener('abort', () => reject(new DOMException('timeout', 'AbortError')))
		}))

		const promise = chatCompletion(makeProvider(), [{ role: 'user', content: 'hi' }])
		await vi.advanceTimersByTimeAsync(61_000)
		const result = await promise

		expect(result.ok).toBe(false)
		if (result.ok) return
		expect(result.error.code).toBe('aborted')
		expect(result.error.message).toBe('Request timed out')
		vi.useRealTimers()
	})

	it('keeps the timeout armed while the body is still arriving', async () => {
		vi.useFakeTimers()
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => new Response(
			new ReadableStream({
				start(controller) {
					// Headers arrived, the body never does. A real fetch errors the stream on abort.
					init?.signal?.addEventListener('abort', () => controller.error(new DOMException('timeout', 'AbortError')))
				},
			}),
			{ status: 200 },
		))

		const promise = chatCompletion(makeProvider(), [{ role: 'user', content: 'hi' }])
		await vi.advanceTimersByTimeAsync(61_000)
		const result = await promise

		expect(result.ok).toBe(false)
		if (result.ok) return
		expect(result.error.message).toBe('Request timed out')
		vi.useRealTimers()
	})
})

describe('chatCompletion: network restrictions', () => {
	afterEach(() => vi.restoreAllMocks())

	it('refuses an http endpoint without explicit permission', async () => {
		const spy = vi.spyOn(globalThis, 'fetch')
		const result = await chatCompletion(
			makeProvider({ baseURL: 'http://api.example.com/v1' }),
			[{ role: 'user', content: 'hi' }],
		)

		expect(result.ok).toBe(false)
		if (result.ok) return
		expect(result.error.code).toBe('provider_misconfigured')
		expect(result.error.message).toMatch(/https/)
		expect(spy).not.toHaveBeenCalled()
	})

	it('refuses a private address without explicit permission', async () => {
		const spy = vi.spyOn(globalThis, 'fetch')
		const result = await chatCompletion(
			makeProvider({ baseURL: 'https://10.1.2.3/v1' }),
			[{ role: 'user', content: 'hi' }],
		)

		expect(result.ok).toBe(false)
		expect(spy).not.toHaveBeenCalled()
	})

	it('allows http on loopback when the user enabled it', async () => {
		const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
			choices: [{ message: { content: '{"ok":1}' } }],
		}))
		const result = await chatCompletion(
			makeProvider({ baseURL: 'http://127.0.0.1:11434/v1', allowLocalHttp: true }),
			[{ role: 'user', content: 'hi' }],
		)

		expect(result.ok).toBe(true)
		expect(spy).toHaveBeenCalledTimes(1)
	})

	it('does not allow http to an external host even with the flag', async () => {
		const result = await chatCompletion(
			makeProvider({ baseURL: 'http://api.example.com/v1', allowLocalHttp: true }),
			[{ role: 'user', content: 'hi' }],
		)

		expect(result.ok).toBe(false)
		if (result.ok) return
		expect(result.error.message).toMatch(/localhost/)
	})

	it('rejects a response over the size limit', async () => {
		const huge = JSON.stringify({ choices: [{ message: { content: 'x'.repeat(6 * 1024 * 1024) } }] })
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(textResponse(huge))

		const result = await chatCompletion(makeProvider(), [{ role: 'user', content: 'hi' }])

		expect(result.ok).toBe(false)
		if (result.ok) return
		expect(result.error.code).toBe('bad_response')
		expect(result.error.message).toMatch(/exceeds/)
	})
})

describe('chatCompletion: token limit cut-off', () => {
	afterEach(() => vi.restoreAllMocks())

	it('returns response_truncated for finish_reason "length"', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
			choices: [{ message: { content: '{"data": [{"id": 1' }, finish_reason: 'length' }],
		}))
		const result = await chatCompletion(makeProvider(), [{ role: 'user', content: 'hi' }])
		expect(result.ok).toBe(false)
		if (result.ok) return
		expect(result.error.code).toBe('response_truncated')
	})

	it('does not treat a normal finish (finish_reason "stop") as a cut-off', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
			choices: [{ message: { content: '{"ok": true}' }, finish_reason: 'stop' }],
		}))
		const result = await chatCompletion(makeProvider(), [{ role: 'user', content: 'hi' }])
		expect(result.ok).toBe(true)
	})
})
