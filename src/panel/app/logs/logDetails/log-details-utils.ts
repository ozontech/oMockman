export interface ParsedJSON<T = unknown> {
	original: string
	parsed: boolean
	json: T | Record<string, never>
}

export const parseJSONIfPossible = (original: string): ParsedJSON => {
	try {
		const json = JSON.parse(original)
		const parsed = json !== null && typeof json === 'object'
		return { original, parsed, json: parsed ? json : {} }
	} catch {
		return { original, parsed: false, json: {} }
	}
}
