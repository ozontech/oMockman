/** Request body patches: applied in the page world, validated in the panel and on import. */

import type { IRequestPatch, RequestPatchMode } from '@/interface/mock'
import { exceedsBodyLimit } from '@/services/body-limits'

const MODES: readonly RequestPatchMode[] = ['replace', 'merge']

/** Browsers refuse a body on these: the patch is skipped and the request goes out as it is. */
const BODYLESS_METHODS = new Set(['GET', 'HEAD'])

type JsonObject = Record<string, unknown>

const isPlainObject = (value: unknown): value is JsonObject =>
	typeof value === 'object' && value !== null && !Array.isArray(value)

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
	try {
		return { ok: true, value: JSON.parse(text) }
	} catch {
		return { ok: false }
	}
}

/** RFC 7386: a non-object patch replaces the target, `null` removes a field. */
export function jsonMergePatch(target: unknown, patch: unknown): unknown {
	if (!isPlainObject(patch)) return patch
	const result: JsonObject = isPlainObject(target) ? { ...target } : {}
	for (const [key, value] of Object.entries(patch)) {
		if (value === null) delete result[key]
		else result[key] = jsonMergePatch(result[key], value)
	}
	return result
}

export function canPatchMethod(method: string): boolean {
	return !BODYLESS_METHODS.has(String(method || 'GET').toUpperCase())
}

/**
 * The body to send instead of `original`, or null to send the request unchanged: a merge needs
 * both bodies to be JSON objects, since merging into text would guess at its format.
 */
export function applyRequestPatch(original: string, patch: IRequestPatch): string | null {
	if (patch.mode === 'replace') return patch.body

	const parsedPatch = parseJson(patch.body)
	if (!parsedPatch.ok || !isPlainObject(parsedPatch.value)) return null
	const target = original.trim() ? parseJson(original) : { ok: true as const, value: {} }
	if (!target.ok || !isPlainObject(target.value)) return null
	return JSON.stringify(jsonMergePatch(target.value, parsedPatch.value))
}

/**
 * Why a patch cannot be saved, or null when it can. The body goes out as written, so it must be
 * strict JSON (or empty); a merge also needs an object to merge.
 */
export function requestPatchProblem(patch: IRequestPatch): 'invalid_json' | 'not_object' | 'too_large' | null {
	if (exceedsBodyLimit(patch.body)) return 'too_large'
	if (patch.mode === 'replace' && !patch.body.trim()) return null
	const parsed = parseJson(patch.body)
	if (!parsed.ok) return 'invalid_json'
	if (patch.mode === 'replace') return null
	return isPlainObject(parsed.value) ? null : 'not_object'
}

/** A stored or imported value as a patch, or undefined when it is not one. */
export function coerceRequestPatch(value: unknown): IRequestPatch | undefined {
	if (!isPlainObject(value)) return undefined
	const mode = MODES.find((m) => m === value.mode)
	if (!mode || typeof value.body !== 'string') return undefined
	return { mode, body: value.body }
}
