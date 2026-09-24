/** Bodies over the limit are never captured partially: a cut-off JSON would become a broken mock. */
export const MAX_BODY_BYTES = 20 * 1024 * 1024

export function utf8ByteLength(text: string): number {
	if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).length
	return text.length
}

// A UTF-16 unit is 1-3 UTF-8 bytes, so most strings are decided by length alone.
export function exceedsBodyLimit(text: string, limit: number = MAX_BODY_BYTES): boolean {
	if (text.length > limit) return true
	if (text.length * 3 <= limit) return false
	return utf8ByteLength(text) > limit
}

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
