import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
	deleteProviderKey,
	getProviderKey,
	maskKey,
	migrateLegacyKeys,
	SECRETS_KEY,
	setProviderKey,
} from '@/background/secrets'
import { STORE_KEY } from '@/background/store-access'

let storage: Record<string, unknown>

beforeEach(() => {
	storage = {}
	vi.stubGlobal('chrome', {
		runtime: { lastError: undefined },
		storage: {
			local: {
				get: (keys: string[], cb: (items: Record<string, unknown>) => void) =>
					cb(Object.fromEntries(keys.filter((key) => key in storage).map((key) => [key, structuredClone(storage[key])]))),
				set: (items: Record<string, unknown>, cb: () => void) => {
					Object.assign(storage, structuredClone(items))
					cb()
				},
			},
		},
	})
})

describe('maskKey', () => {
	it('keeps only the ends of a key', () => {
		expect(maskKey('sk-proj-1234567890abcd')).toBe('sk-…abcd')
	})

	it('hides a short key whole', () => {
		expect(maskKey('12345678')).toBe('••••')
	})
})

describe('provider keys', () => {
	it('gives a key back only for the origin it was saved for', async () => {
		await setProviderKey('p-1', ' sk-secret-value ', 'https://llm.example.com/v1')

		expect(await getProviderKey('p-1', 'https://llm.example.com/other/path')).toEqual({ ok: true, key: 'sk-secret-value' })
		expect(await getProviderKey('p-1', 'https://evil.example.com/v1')).toEqual({
			ok: false,
			reason: 'origin_mismatch',
			origin: 'https://llm.example.com',
		})
		expect(await getProviderKey('p-1', 'http://llm.example.com/v1')).toMatchObject({ ok: false })
	})

	it('answers a save with the mask, not the key', async () => {
		expect(await setProviderKey('p-1', 'sk-secret-value', 'https://llm.example.com')).toEqual({ ok: true, mask: 'sk-…alue' })
	})

	it('keeps keys out of the store the panel and content scripts read', async () => {
		await setProviderKey('p-1', 'sk-secret-value', 'https://llm.example.com')

		expect(storage[STORE_KEY]).toBeUndefined()
		expect(JSON.stringify(storage[SECRETS_KEY])).toContain('sk-secret-value')
	})

	it('refuses an empty key and a URL without an origin', async () => {
		expect(await setProviderKey('p-1', '  ', 'https://llm.example.com')).toMatchObject({ ok: false })
		expect(await setProviderKey('p-1', 'sk-secret-value', 'not a url')).toMatchObject({ ok: false })
	})

	it('deletes a key', async () => {
		await setProviderKey('p-1', 'sk-secret-value', 'https://llm.example.com')
		await deleteProviderKey('p-1')

		expect(await getProviderKey('p-1', 'https://llm.example.com')).toEqual({ ok: false, reason: 'missing' })
	})
})

describe('migrateLegacyKeys', () => {
	it('moves a key out of the store and leaves a mask in its place', async () => {
		storage[STORE_KEY] = {
			active: true,
			mocks: [],
			ai: {
				enabled: true,
				activeProviderId: 'p-1',
				providers: [{ id: 'p-1', name: 'gw', baseURL: 'https://llm.example.com/v1', apiKey: 'sk-legacy-value', model: 'm', createdOn: 1 }],
			},
		}

		await migrateLegacyKeys()

		const store = storage[STORE_KEY] as { ai: { providers: Array<Record<string, unknown>> } }
		expect(store.ai.providers[0]).not.toHaveProperty('apiKey')
		expect(store.ai.providers[0].apiKeyMask).toBe('sk-…alue')
		expect(await getProviderKey('p-1', 'https://llm.example.com')).toEqual({ ok: true, key: 'sk-legacy-value' })
	})

	it('does not overwrite a key saved since', async () => {
		await setProviderKey('p-1', 'sk-newer-value', 'https://llm.example.com')
		storage[STORE_KEY] = {
			ai: { providers: [{ id: 'p-1', name: 'gw', baseURL: 'https://llm.example.com', apiKey: 'sk-stale-value', model: 'm', createdOn: 1 }] },
		}

		await migrateLegacyKeys()

		expect(await getProviderKey('p-1', 'https://llm.example.com')).toEqual({ ok: true, key: 'sk-newer-value' })
	})

	it('leaves a store without keys untouched', async () => {
		const store = { ai: { providers: [{ id: 'p-1', name: 'gw', baseURL: 'https://llm.example.com', model: 'm', createdOn: 1 }] } }
		storage[STORE_KEY] = store

		await migrateLegacyKeys()

		expect(storage[STORE_KEY]).toEqual(store)
		expect(storage[SECRETS_KEY]).toBeUndefined()
	})
})
