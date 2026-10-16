/**
 * Whether a runtime message comes from one of this extension's own pages (the DevTools panel, the
 * popup), judged by the sender's page address. `sender.tab` cannot tell: Chrome fills it in for a
 * DevTools panel too, with the inspected tab. A content script's page is the site, never ours.
 */
export function isFromExtensionPage(
	sender: { id?: string; url?: string; origin?: string } | undefined,
	extensionId: string,
	extensionBaseUrl: string,
): boolean {
	if (!sender || sender.id !== extensionId || !extensionBaseUrl) return false
	const base = extensionBaseUrl.replace(/\/+$/, '')
	const page = String(sender.url ?? sender.origin ?? '')
	return page === base || page.startsWith(`${base}/`)
}
