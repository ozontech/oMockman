/**
 * AI keys live apart from the store the panel and the content scripts read: only this worker
 * reads them. The panel can set or delete a key, and sees a mask of it, never the key itself.
 *
 * A key is bound to the origin it was entered for. Pointing a connection at another host does
 * not carry the key along: it has to be entered again, so a changed baseURL cannot leak it.
 */
import { STORE_KEY } from '@/background/store-access'
import type { IAIProviderConfig } from '@/interface/ai'
import type { IStore } from '@/interface/mock'
import { canonicalOrigin } from '@/services/origin'

export const SECRETS_KEY = 'mockman.extension.secrets'

export interface IStoredSecret {
	key: string
	origin: string
}

type Secrets = Record<string, IStoredSecret>

export type KeyLookup =
	| { ok: true; key: string }
	| { ok: false; reason: 'missing' | 'origin_mismatch'; origin?: string }

function storageGet<T>(name: string): Promise<T | undefined> {
	return new Promise((resolve) => {
		try {
			chrome.storage.local.get([name], (res) => resolve(res?.[name] as T | undefined))
		} catch {
			resolve(undefined)
		}
	})
}

function storageSet(items: Record<string, unknown>): Promise<void> {
	return new Promise((resolve, reject) => {
		try {
			chrome.storage.local.set(items, () => {
				const error = chrome.runtime?.lastError
				if (error) reject(new Error(error.message ?? 'storage.set failed'))
				else resolve()
			})
		} catch (error) {
			reject(error instanceof Error ? error : new Error('storage.set failed'))
		}
	})
}

function isSecret(value: unknown): value is IStoredSecret {
	if (!value || typeof value !== 'object') return false
	const candidate = value as Partial<IStoredSecret>
	return typeof candidate.key === 'string' && typeof candidate.origin === 'string'
}

async function readSecrets(): Promise<Secrets> {
	const raw = await storageGet<Record<string, unknown>>(SECRETS_KEY)
	if (!raw || typeof raw !== 'object') return {}
	return Object.fromEntries(Object.entries(raw).filter(([, value]) => isSecret(value))) as Secrets
}

/** Enough to tell two keys apart, never enough to use one. */
export function maskKey(key: string): string {
	const value = key.trim()
	if (value.length <= 8) return '••••'
	return `${value.slice(0, 3)}…${value.slice(-4)}`
}

export function keyOrigin(baseURL: string): string | null {
	return canonicalOrigin(baseURL)
}

export async function setProviderKey(
	providerId: string,
	key: string,
	baseURL: string,
): Promise<{ ok: true; mask: string } | { ok: false; error: string }> {
	if (!providerId) return { ok: false, error: 'Unknown AI connection.' }
	const value = key.trim()
	if (!value) return { ok: false, error: 'The API key is empty.' }
	const origin = keyOrigin(baseURL)
	if (!origin) return { ok: false, error: 'The server URL must be an absolute http(s) URL.' }

	const secrets = await readSecrets()
	secrets[providerId] = { key: value, origin }
	await storageSet({ [SECRETS_KEY]: secrets })
	return { ok: true, mask: maskKey(value) }
}

export async function deleteProviderKey(providerId: string): Promise<void> {
	const secrets = await readSecrets()
	if (!(providerId in secrets)) return
	delete secrets[providerId]
	await storageSet({ [SECRETS_KEY]: secrets })
}

/** The key, only for the origin it was entered for. */
export async function getProviderKey(providerId: string, baseURL: string): Promise<KeyLookup> {
	const secret = (await readSecrets())[providerId]
	if (!secret) return { ok: false, reason: 'missing' }
	if (keyOrigin(baseURL) !== secret.origin) return { ok: false, reason: 'origin_mismatch', origin: secret.origin }
	return { ok: true, key: secret.key }
}

type LegacyProvider = IAIProviderConfig & { apiKey?: unknown }

/**
 * Before 2.4 the key sat in the provider inside the main store. Moves it here, leaves a mask in
 * its place, and strips the key from the store. Safe to run on every worker start.
 */
export async function migrateLegacyKeys(): Promise<void> {
	const store = await storageGet<IStore>(STORE_KEY)
	const providers = store?.ai?.providers
	if (!store || !Array.isArray(providers)) return

	const legacy = (providers as LegacyProvider[]).filter((p) => typeof p?.apiKey === 'string')
	if (legacy.length === 0) return

	const secrets = await readSecrets()
	for (const provider of legacy) {
		const key = String(provider.apiKey).trim()
		const origin = keyOrigin(provider.baseURL)
		if (key && origin && !secrets[provider.id]) secrets[provider.id] = { key, origin }
	}
	await storageSet({ [SECRETS_KEY]: secrets })

	const migrated = (providers as LegacyProvider[]).map((provider) => {
		if (typeof provider?.apiKey !== 'string') return provider
		const stripped: LegacyProvider = { ...provider }
		delete stripped.apiKey
		const secret = secrets[provider.id]
		return { ...stripped, apiKeyMask: secret ? maskKey(secret.key) : undefined }
	})
	await storageSet({ [STORE_KEY]: { ...store, ai: { ...store.ai, providers: migrated } } })
}
