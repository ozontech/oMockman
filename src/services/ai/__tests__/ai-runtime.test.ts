import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { aiChat, aiTestConnection } from '../ai-runtime'
import { AI_MESSAGE_TYPE } from '../../../interface/message'
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

type ChromeWithRuntime = {
	runtime?: {
		sendMessage?: (request: unknown, callback?: (resp: unknown) => void) => unknown
		lastError?: { message?: string }
	}
}

function stubChromeRuntime(impl: (request: unknown) => unknown): ChromeWithRuntime {
	const original = (globalThis as unknown as { chrome?: ChromeWithRuntime }).chrome
	const sendMessage = (request: unknown, callback?: (resp: unknown) => void) => {
		const value = impl(request)
		callback?.(value)
	}
	const next: ChromeWithRuntime = { runtime: { sendMessage } }
	;(globalThis as unknown as { chrome: ChromeWithRuntime }).chrome = next
	;(globalThis as unknown as { __chromeBackup__?: ChromeWithRuntime }).__chromeBackup__ = original
	return next
}

function restoreChrome(): void {
	const backup = (globalThis as unknown as { __chromeBackup__?: ChromeWithRuntime }).__chromeBackup__
	if (backup) {
		(globalThis as unknown as { chrome: ChromeWithRuntime }).chrome = backup
	} else {
		delete (globalThis as unknown as { chrome?: ChromeWithRuntime }).chrome
	}
	delete (globalThis as unknown as { __chromeBackup__?: ChromeWithRuntime }).__chromeBackup__
}

afterEach(() => {
	restoreChrome()
})

describe('aiChat', () => {
	it('sends a chat request and forwards the arguments', async () => {
		const calls: unknown[] = []
		stubChromeRuntime((request) => {
			calls.push(request)
			return { ok: true, content: '{}', model: 'gpt-4o-mini' }
		})

		const result = await aiChat({
			providerId: 'p-1',
			messages: [{ role: 'user', content: 'hi' }],
			options: { jsonMode: true },
		})

		expect(calls).toHaveLength(1)
		expect(calls[0]).toMatchObject({
			type: AI_MESSAGE_TYPE.chat,
			providerId: 'p-1',
			messages: [{ role: 'user', content: 'hi' }],
			options: { jsonMode: true },
		})
		expect(result.ok).toBe(true)
	})

	it('passes structured errors through unchanged', async () => {
		stubChromeRuntime(() => ({
			ok: false,
			error: { code: 'token_invalid', message: 'Unauthorized', status: 401 },
		}))

		const result = await aiChat({
			providerId: 'p-1',
			messages: [{ role: 'user', content: 'hi' }],
		})

		expect(result.ok).toBe(false)
		if (result.ok) return
		expect(result.error.code).toBe('token_invalid')
	})

	it('returns bad_response when the background returns garbage', async () => {
		stubChromeRuntime(() => 'not an object')

		const result = await aiChat({
			providerId: 'p-1',
			messages: [{ role: 'user', content: 'hi' }],
		})

		expect(result.ok).toBe(false)
		if (result.ok) return
		expect(result.error.code).toBe('bad_response')
	})

	it('returns unknown when sendMessage throws', async () => {
		stubChromeRuntime(() => {
			throw new Error('Receiving end does not exist')
		})

		const result = await aiChat({
			providerId: 'p-1',
			messages: [{ role: 'user', content: 'hi' }],
		})

		expect(result.ok).toBe(false)
		if (result.ok) return
		expect(result.error.code).toBe('unknown')
		expect(result.error.message).toMatch(/Receiving end/)
	})

	it('returns unknown when chrome.runtime is unavailable', async () => {
		const previous = (globalThis as unknown as { chrome?: ChromeWithRuntime }).chrome
		delete (globalThis as unknown as { chrome?: ChromeWithRuntime }).chrome

		try {
			const result = await aiChat({
				providerId: 'p-1',
				messages: [{ role: 'user', content: 'hi' }],
			})
			expect(result.ok).toBe(false)
			if (result.ok) return
			expect(result.error.code).toBe('unknown')
			expect(result.error.message).toMatch(/sendMessage is unavailable/)
		} finally {
			if (previous) (globalThis as unknown as { chrome: ChromeWithRuntime }).chrome = previous
		}
	})
})

describe('aiTestConnection', () => {
	let stub: ReturnType<typeof vi.fn>

	beforeEach(() => {
		stub = vi.fn(() => ({ ok: true, content: 'pong', model: 'gpt-4o-mini' }))
		stubChromeRuntime((request) => stub(request))
	})

	it('sends a test-connection request with the provider', async () => {
		const provider = makeProvider()
		const result = await aiTestConnection({ provider })

		expect(stub).toHaveBeenCalledOnce()
		expect(stub.mock.calls[0][0]).toMatchObject({
			type: AI_MESSAGE_TYPE.testConnection,
			provider: { id: 'p-1' },
		})
		expect(result.ok).toBe(true)
	})
})
