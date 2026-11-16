/** API targets are independent of the application origin; only plain HTTP(S) endpoints are supported. */
export function isScenarioUrl(value: string): boolean {
	try {
		const url = new URL(value)
		return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash
	} catch {
		return false
	}
}
