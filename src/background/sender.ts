/** Content scripts run inside arbitrary pages, so privileged messages need an extension page. */

/** The extension pages allowed to call the background. The popup and the devtools page never do. */
export const PRIVILEGED_PAGES = new Set(['/public/html/panel.html'])

/** Compared by scheme and host: URL.origin is "null" for extension schemes in some engines. */
function extensionBase(): URL | null {
	try {
		const runtime = (globalThis as unknown as { chrome?: typeof chrome }).chrome?.runtime
		const base = runtime?.getURL?.('/')
		return base ? new URL(base) : null
	} catch {
		return null
	}
}

/**
 * Accepted only when the sender is this extension, has no tab (a content script always does),
 * comes from this extension's origin and from a page on the privileged list.
 */
export function isExtensionPageSender(sender: chrome.runtime.MessageSender | undefined): boolean {
	if (!sender) return false

	const runtimeId = (globalThis as unknown as { chrome?: typeof chrome }).chrome?.runtime?.id
	if (!runtimeId || sender.id !== runtimeId) return false

	if (sender.tab) return false

	const base = extensionBase()
	if (!base) return false
	let url: URL
	try {
		url = new URL(sender.url ?? '')
	} catch {
		return false
	}
	if (url.protocol !== base.protocol || url.host !== base.host) return false

	return PRIVILEGED_PAGES.has(url.pathname)
}
