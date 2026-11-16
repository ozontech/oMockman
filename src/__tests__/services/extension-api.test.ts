import { afterEach, expect, it, vi } from 'vitest'

import {
	getTab,
	sendExtensionMessage,
	storageGet,
	storageRemove,
	storageSet,
} from '@/services/extension-api'

afterEach(() => vi.unstubAllGlobals())
it('supports callback-only Firefox APIs and propagates lastError', async () => {
	const storage = {
		get: (_key: string, done: (value: unknown) => void) => {
			done({ key: 1 })
		},
		set: (_value: unknown, done: () => void) => {
			done()
		},
		remove: (_key: string, done: () => void) => {
			done()
		},
	} as chrome.storage.StorageArea
	vi.stubGlobal('chrome', {
		runtime: {
			sendMessage: (_message: unknown, done: (answer: unknown) => void) => {
				done({ ok: true })
			},
		},
		tabs: {
			get: (id: number, done: (tab: unknown) => void) => {
				done({ id })
			},
		},
	})
	expect(await storageGet(storage, 'key')).toEqual({ key: 1 })
	await storageSet(storage, { key: 2 })
	await storageRemove(storage, 'key')
	expect(await getTab(7)).toEqual({ id: 7 })
	expect(await sendExtensionMessage({})).toEqual({ ok: true })
	Object.defineProperty(chrome.runtime, 'lastError', {
		value: { message: 'synthetic error' },
		configurable: true,
	})
	await expect(storageGet(storage, 'key')).rejects.toThrow('synthetic error')
})
