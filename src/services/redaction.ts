/** Shared filtering rules for scenario previews and captured JSON. */
export const sensitiveField =
	/authorization|cookie|password|passwd|secret|token|api[-_]?key|session|email|phone|address/i
export const credentialValue = /\bBearer\s+\S+|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/i

/** Redact parsed JSON, reporting each hidden path through the caller's mask function. */
export function redactJson(
	value: unknown,
	path: string,
	mask: (path: string) => string,
	remainingDepth: number,
): unknown {
	if (remainingDepth < 0) return mask(path)
	if (Array.isArray(value))
		return value.map((child, index) =>
			redactJson(child, `${path}/${index}`, mask, remainingDepth - 1),
		)
	if (value && typeof value === 'object')
		return Object.fromEntries(
			Object.entries(value).map(([key, child]) => {
				const childPath = `${path}/${key}`
				return [
					key,
					sensitiveField.test(key)
						? mask(childPath)
						: redactJson(child, childPath, mask, remainingDepth - 1),
				]
			}),
		)
	return typeof value === 'string' && credentialValue.test(value) ? mask(path) : value
}
