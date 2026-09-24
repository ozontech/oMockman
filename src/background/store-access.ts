/** AI providers are read from storage here, never taken from a message. */
import type { IAIProviderConfig } from '@/interface/ai'
import type { IStore } from '@/interface/mock'

export const STORE_KEY = 'mockman.extension.main.db'

function readStore(): Promise<Partial<IStore>> {
	return new Promise((resolve) => {
		try {
			chrome.storage.local.get([STORE_KEY], (res) => {
				const raw = res?.[STORE_KEY]
				resolve(raw && typeof raw === 'object' ? (raw as Partial<IStore>) : {})
			})
		} catch {
			resolve({})
		}
	})
}

export async function getSecuritySettings(): Promise<{ allowLocalOpenApi: boolean }> {
	const store = await readStore()
	return { allowLocalOpenApi: store.security?.allowLocalOpenApi === true }
}

function isProvider(value: unknown): value is IAIProviderConfig {
	if (!value || typeof value !== 'object') return false
	const candidate = value as Partial<IAIProviderConfig>
	return typeof candidate.id === 'string'
		&& typeof candidate.baseURL === 'string'
		&& typeof candidate.apiKey === 'string'
		&& typeof candidate.model === 'string'
}

export async function getStoredAIProvider(providerId: string): Promise<IAIProviderConfig | null> {
	if (!providerId) return null
	const store = await readStore()
	const providers = store.ai?.providers
	if (!Array.isArray(providers)) return null
	const found = providers.find((provider) => isProvider(provider) && provider.id === providerId)
	return isProvider(found) ? found : null
}
