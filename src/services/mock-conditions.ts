import { match } from 'path-to-regexp'

import { getActiveEnvVars, resolveTemplate } from './env'
import { normalizeUrl } from './url'

import type { IMockResponse, IStore } from '@/interface/mock'

function equal(a: unknown, b: unknown): boolean {
	if (a === b) return true
	if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false
	if (Array.isArray(a) !== Array.isArray(b)) return false
	const left = Object.keys(a),
		right = Object.keys(b)
	return (
		left.length === right.length &&
		left.every(
			(key) =>
				Object.hasOwn(b, key) &&
				equal((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
		)
	)
}

/** Exact query/path values and deep equality at explicit JSON paths. Missing is not null. */
export function matchesConditions(
	mock: IMockResponse,
	store: IStore,
	url: string,
	body?: string,
): boolean {
	if (!mock.when) return true
	try {
		const parsed = new URL(url)
		if (
			Object.entries(mock.when.query ?? {}).some(([key, value]) => {
				const values = parsed.searchParams.getAll(key)
				return values.length !== 1 || values[0] !== value
			})
		)
			return false
		if (mock.when.params && Object.keys(mock.when.params).length) {
			const pattern = normalizeUrl(resolveTemplate(mock.url, getActiveEnvVars(store))).replace(
				'://',
				'-',
			)
			const result = match(pattern, { decode: decodeURIComponent })(
				normalizeUrl(url).replace('://', '-'),
			)
			if (
				!result ||
				Object.entries(mock.when.params).some(
					([key, value]) => result.params[key as keyof typeof result.params] !== value,
				)
			)
				return false
		}
		if (mock.when.body?.length) {
			if (typeof body !== 'string' || body.length > 1024 * 1024) return false
			const data: unknown = JSON.parse(body)
			for (const condition of mock.when.body) {
				let value = data
				for (const key of condition.path) {
					if (!value || typeof value !== 'object' || !Object.hasOwn(value, key)) return false
					value = (value as Record<string, unknown>)[key]
				}
				if (!equal(value, condition.equals)) return false
			}
		}
		return true
	} catch {
		return false
	}
}
