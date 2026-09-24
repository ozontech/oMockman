import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** No message a page can post may change extension storage. */

const storageSet = vi.fn((_items: unknown, cb?: () => void) => cb?.())
const runtimeSendMessage = vi.fn()
const contentPort = {
	postMessage: vi.fn(),
	disconnect: vi.fn(),
	onMessage: { addListener: vi.fn() },
	onDisconnect: { addListener: vi.fn() },
}

const STORE_KEY = 'mockman.extension.main.db'

const storedStore = {
	active: true,
	mocks: [
		{
			id: 'mock-1',
			name: 'existing',
			method: 'GET',
			url: 'https://example.com/api',
			status: 200,
			response: '{"ok":true}',
			active: true,
			createdOn: 1,
		},
	],
}

const importPayload = JSON.stringify([
	{
		name: 'injected-by-page',
		method: 'GET',
		url: 'https://evil.example.com/api',
		status: 200,
		response: '{"evil":true}',
	},
])

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

describe('page cannot write to extension storage', () => {
	beforeEach(() => {
		vi.resetModules()
		storageSet.mockClear()
		runtimeSendMessage.mockClear()
		contentPort.postMessage.mockClear()

		vi.stubGlobal('chrome', {
			runtime: {
				id: 'test-extension-id',
				sendMessage: runtimeSendMessage,
				connect: vi.fn(() => contentPort),
				onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
				lastError: undefined,
			},
			storage: {
				local: {
					get: vi.fn((_keys: unknown, cb: (res: Record<string, unknown>) => void) =>
						cb({ [STORE_KEY]: storedStore })),
					set: storageSet,
				},
				onChanged: { addListener: vi.fn() },
			},
		})
	})

	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it('ignores import, apply and notification messages sent by the page', async () => {
		// Answer the readiness ping so the content script finishes booting.
		window.addEventListener('message', (evt) => {
			if ((evt.data as { type?: string })?.type === 'MOCKMAN_CHECK_READY') {
				window.postMessage({ type: 'MOCKMAN_INJECT_READY' }, '*')
			}
		})

		await import('@/content-script')
		await flush()
		await flush()

		window.postMessage({ type: 'MOCKMAN_IMPORT_MOCK', payload: importPayload }, '*')
		window.postMessage({ type: 'MOCKMAN_APPLY_MOCKS', mocks: [{ url: 'https://evil.example.com' }] }, '*')
		window.postMessage(
			{ to: 'CONTENT', from: 'PANEL', type: 'NOTIFICATION', message: 'UPDATE_STORE', extensionName: 'MOCKMAN' },
			'*',
		)
		await flush()
		await flush()

		expect(storageSet).not.toHaveBeenCalled()
	})
})
