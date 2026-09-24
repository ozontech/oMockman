import { safeNumberInt } from '@/services/number'

export function getByPath<T = unknown>(obj: unknown, path: string, defaultValue?: T): T {
	if (obj == null) return defaultValue as T
	const segments = String(path)
		.replace(/\[(\w+)\]/g, '.$1')
		.replace(/^\./, '')
		.split('.')
		.filter(Boolean)
	let current: unknown = obj
	for (const segment of segments) {
		if (current == null || typeof current !== 'object') return defaultValue as T
		current = (current as Record<string, unknown>)[segment]
	}
	return (current === undefined ? defaultValue : current) as T
}

export function getHeaders(
	h: Record<string, string> | Headers | undefined,
): Record<string, string> {
	if (!h) return {}
	if (h instanceof Headers) {
		const obj: Record<string, string> = {}
		h.forEach((v, k) => (obj[k] = v))
		return obj
	}
	return h
}

export function downloadJsonFile(filename: string, data: unknown): void {
	try {
		const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' })
		const url = URL.createObjectURL(blob)
		const a = document.createElement('a')
		a.href = url
		a.download = filename
		document.body.appendChild(a)
		a.click()
		document.body.removeChild(a)
		URL.revokeObjectURL(url)
	} catch { void 0 }
}

export function parsePositiveIntFromInput(value: unknown): number | undefined {
	const raw = String(value ?? '')
	const normalized = raw.replace(/\D+/g, '')
	if (normalized === '') return undefined
	const parsed = safeNumberInt(normalized)
	return parsed == null ? undefined : parsed
}

export function genId(): string {
	return typeof crypto?.randomUUID === 'function'
		? crypto.randomUUID()
		: `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export async function copyTextToClipboard(value: string): Promise<boolean> {
	const text = String(value ?? '')
	if (!text) return false

	try {
		if (navigator?.clipboard?.writeText) {
			await navigator.clipboard.writeText(text)
			return true
		}
	} catch {
		void 0
	}

	try {
		const textarea = document.createElement('textarea')
		textarea.value = text
		textarea.setAttribute('readonly', 'true')
		textarea.style.position = 'fixed'
		textarea.style.opacity = '0'
		textarea.style.pointerEvents = 'none'
		document.body.appendChild(textarea)
		textarea.select()
		textarea.setSelectionRange(0, text.length)
		const copied = document.execCommand('copy')
		document.body.removeChild(textarea)
		return copied
	} catch {
		return false
	}
}
