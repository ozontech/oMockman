import { afterEach, describe, expect, it, vi } from 'vitest'

import { getSecuritySettings, getStoredAIProvider, STORE_KEY } from '@/background/store-access'

const stubStorage = (value: unknown): void => {
	vi.stubGlobal('chrome', {
		storage: {
			local: {
				get: vi.fn((_keys: unknown, cb: (res: Record<string, unknown>) => void) => cb({ [STORE_KEY]: value })),
			},
		},
	})
}

const provider = {
	id: 'p-1',
	name: 'gateway',
	baseURL: 'https://llm.example.com/api',
	apiKey: 'sk-stored',
	model: 'm',
	createdOn: 1,
}

describe('getStoredAIProvider', () => {
	afterEach(() => vi.unstubAllGlobals())

	it('resolves a provider that exists in storage', async () => {
		stubStorage({ ai: { providers: [provider] } })
		expect(await getStoredAIProvider('p-1')).toEqual(provider)
	})

	it('returns null for an id that is not stored', async () => {
		stubStorage({ ai: { providers: [provider] } })
		expect(await getStoredAIProvider('made-up')).toBeNull()
	})

	it('returns null for an empty id', async () => {
		stubStorage({ ai: { providers: [provider] } })
		expect(await getStoredAIProvider('')).toBeNull()
	})

	it('returns null when storage holds no providers', async () => {
		stubStorage({})
		expect(await getStoredAIProvider('p-1')).toBeNull()
	})

	it('ignores malformed provider entries', async () => {
		stubStorage({ ai: { providers: [{ id: 'p-1', baseURL: 'https://x' }] } })
		expect(await getStoredAIProvider('p-1')).toBeNull()
	})

	it('survives a storage failure', async () => {
		vi.stubGlobal('chrome', {
			storage: {
				local: {
					get: vi.fn(() => {
						throw new Error('storage unavailable')
					}),
				},
			},
		})
		expect(await getStoredAIProvider('p-1')).toBeNull()
	})
})

describe('getSecuritySettings', () => {
	afterEach(() => vi.unstubAllGlobals())

	it('defaults to refusing local OpenAPI targets', async () => {
		stubStorage({})
		expect(await getSecuritySettings()).toEqual({ allowLocalOpenApi: false })
	})

	it('reads the opt-in from storage', async () => {
		stubStorage({ security: { allowLocalOpenApi: true } })
		expect(await getSecuritySettings()).toEqual({ allowLocalOpenApi: true })
	})
})
