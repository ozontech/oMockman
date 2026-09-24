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

export async function fetchOpenApiSpecByRuntime(specUrl: string): Promise<IOpenApiFetchResult> {
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
