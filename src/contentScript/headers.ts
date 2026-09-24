import { normalizeUrl } from '@/services/url'

export async function fetchFullResponseHeaders(
	url: string,
	method: string,
): Promise<{ name: string; value: string }[] | null> {
	try {
		const res = await new Promise<{ headers?: { name: string; value: string }[] } | undefined>((resolve) => {
			chrome.runtime.sendMessage(
				{ type: 'GET_RESPONSE_HEADERS', url: normalizeUrl(url), method },
				(response) => resolve(response as { headers?: { name: string; value: string }[] } | undefined),
			)
		})

		return res && Array.isArray(res.headers) && res.headers.length > 0 ? res.headers : null
	} catch (e) {
		void e
		return null
	}
}

