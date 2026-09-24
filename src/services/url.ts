export function normalizeUrl(rawUrl: string): string {
	try {
		const trimmed = String(rawUrl ?? '').trim()
		return trimmed.split('?')[0].replace(/\/+$/, '')
	} catch {
		return rawUrl
	}
}

export function makeHeadersKey(method: string, url: string): string {
	const safeMethod = (method || '').toUpperCase()
	const safeUrl = normalizeUrl(url)
	return `${safeMethod}:${safeUrl}`
}

