import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchOpenApiSpec } from '@/background/openapi-fetch'

const SPEC = JSON.stringify({
	openapi: '3.0.0',
	info: { title: 'test', version: '1' },
	paths: { '/users': { get: { responses: {} } } },
})

const specResponse = (): Response =>
	new Response(SPEC, { status: 200, headers: { 'Content-Type': 'application/json' } })

const redirectResponse = (location: string): Response =>
	new Response(null, { status: 302, headers: { location } })

describe('fetchOpenApiSpec network guard', () => {
	afterEach(() => vi.restoreAllMocks())

	it('loads a public spec', async () => {
		const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(specResponse())

		const result = await fetchOpenApiSpec('https://api.example.com/openapi.json')

		expect(result.ok).toBe(true)
		expect(spy).toHaveBeenCalled()
		const init = spy.mock.calls[0][1] as RequestInit
		expect(init.redirect).toBe('manual')
		expect(init.credentials).toBe('omit')
	})

	it('refuses loopback by default', async () => {
		const spy = vi.spyOn(globalThis, 'fetch')

		const result = await fetchOpenApiSpec('http://localhost:8080/openapi.json')

		expect(result.ok).toBe(false)
		if (result.ok) return
		expect(result.error).toMatch(/local or private/)
		expect(spy).not.toHaveBeenCalled()
	})

	it.each([
		'http://127.0.0.1/openapi.json',
		'https://10.1.1.1/openapi.json',
		'https://192.168.0.1/openapi.json',
		'https://169.254.169.254/latest/meta-data',
		'https://[fd00::1]/openapi.json',
	])('refuses %s by default', async (url) => {
		const spy = vi.spyOn(globalThis, 'fetch')
		const result = await fetchOpenApiSpec(url)
		expect(result.ok).toBe(false)
		expect(spy).not.toHaveBeenCalled()
	})

	it('refuses non-http protocols', async () => {
		const result = await fetchOpenApiSpec('file:///etc/passwd')
		expect(result.ok).toBe(false)
		if (result.ok) return
		expect(result.error).toMatch(/http/)
	})

	it('loads a local spec when the user allowed local targets', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(specResponse())

		const result = await fetchOpenApiSpec('http://localhost:8080/openapi.json', { allowLocalTargets: true })

		expect(result.ok).toBe(true)
	})

	it('re-checks the target after a redirect', async () => {
		// A public URL that redirects to the cloud metadata endpoint must fail.
		const spy = vi.spyOn(globalThis, 'fetch')
			.mockResolvedValueOnce(redirectResponse('http://169.254.169.254/latest/meta-data'))
			.mockResolvedValue(specResponse())

		await fetchOpenApiSpec('https://api.example.com/openapi.json')

		expect(spy.mock.calls.map((call) => String(call[0]))).not.toContain('http://169.254.169.254/latest/meta-data')
	})

	it('follows a redirect to another public url', async () => {
		vi.spyOn(globalThis, 'fetch')
			.mockResolvedValueOnce(redirectResponse('https://cdn.example.com/openapi.json'))
			.mockResolvedValue(specResponse())

		const result = await fetchOpenApiSpec('https://api.example.com/openapi.json')

		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect(result.sourceUrl).toBe('https://api.example.com/openapi.json')
	})

	it('gives up after too many redirects', async () => {
		vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
			redirectResponse('https://api.example.com/loop.json'))

		const result = await fetchOpenApiSpec('https://api.example.com/openapi.json')

		expect(result.ok).toBe(false)
	})

	it('does not follow a redirect whose target the browser hides', async () => {
		// What a browser returns for redirect: 'manual': status 0 and no Location header.
		const opaque = { type: 'opaqueredirect', status: 0, ok: false, headers: new Headers(), body: null } as unknown as Response
		const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(opaque)

		const result = await fetchOpenApiSpec('https://api.example.com/openapi.json')

		expect(result.ok).toBe(false)
		expect(spy.mock.calls.every((call) => String(call[0]).startsWith('https://api.example.com/'))).toBe(true)
	})

	it('refuses an oversized spec', async () => {
		const huge = 'x'.repeat(11 * 1024 * 1024)
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(huge, { status: 200 }))

		const result = await fetchOpenApiSpec('https://api.example.com/openapi.json')

		expect(result.ok).toBe(false)
	})
})
