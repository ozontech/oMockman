import type { IOpenApiFetchResult } from '@/interface/openapi'

const runtimeSendMessage = <T>(message: unknown): Promise<T> => {
	const firefoxRuntime = (globalThis as unknown as {
		browser?: { runtime?: { sendMessage?: (msg: unknown) => Promise<T> } }
	}).browser?.runtime

	if (firefoxRuntime?.sendMessage) {
		return firefoxRuntime.sendMessage(message)
	}

	const runtime = chrome?.runtime
	if (!runtime?.sendMessage) {
		return Promise.reject(new Error('runtime.sendMessage is not available'))
	}

	return new Promise((resolve, reject) => {
		const sendMessage = runtime.sendMessage as unknown as (
			msg: unknown,
			cb: (response?: T) => void,
		) => void

		sendMessage(message, (response) => {
			const err = chrome.runtime?.lastError
			if (err?.message) {
				reject(new Error(err.message))
				return
			}
			resolve(response as T)
		})
	})
}

/**
 * Validation reruns on every edit of the mock form, so a spec is fetched once per URL for a
 * while. Only successes are kept: after a failure the next edit tries again.
 */
const SPEC_TTL_MS = 60_000
const MAX_CACHED_SPECS = 10
const specCache = new Map<string, { at: number; result: Promise<IOpenApiFetchResult> }>()

export function clearOpenApiSpecCache(): void {
	specCache.clear()
}

export function fetchOpenApiSpecByRuntime(specUrl: string): Promise<IOpenApiFetchResult> {
	const now = Date.now()
	const cached = specCache.get(specUrl)
	if (cached && now - cached.at < SPEC_TTL_MS) return cached.result

	const result = requestOpenApiSpec(specUrl)
	specCache.delete(specUrl)
	specCache.set(specUrl, { at: now, result })
	while (specCache.size > MAX_CACHED_SPECS) {
		const oldest = specCache.keys().next().value
		if (oldest === undefined) break
		specCache.delete(oldest)
	}
	void result.then((answer) => {
		if (!answer.ok && specCache.get(specUrl)?.result === result) specCache.delete(specUrl)
	})
	return result
}

async function requestOpenApiSpec(specUrl: string): Promise<IOpenApiFetchResult> {
	try {
		const result = await runtimeSendMessage<IOpenApiFetchResult>({
			type: 'PANEL_FETCH_OPENAPI_SPEC',
			url: specUrl,
		})
		if (!result || typeof result !== 'object' || typeof (result as { ok?: unknown }).ok !== 'boolean') {
			return { ok: false, error: 'Empty response from extension background while loading OpenAPI schema.' }
		}
		return result
	} catch {
		return { ok: false, error: 'Cannot request OpenAPI schema from extension background.' }
	}
}
