/** Content scripts run inside arbitrary pages, so privileged messages need an extension page. */

const EXTENSION_URL_PREFIXES = ['chrome-extension://', 'moz-extension://', 'extension://']

/** A content script always carries sender.tab, an extension page never does. */
export function isExtensionPageSender(sender: chrome.runtime.MessageSender | undefined): boolean {
	if (!sender) return false

	const runtimeId = (globalThis as unknown as { chrome?: typeof chrome }).chrome?.runtime?.id
	if (runtimeId && sender.id && sender.id !== runtimeId) return false

	if (sender.tab) return false

	const url = sender.url ?? ''
	return EXTENSION_URL_PREFIXES.some((prefix) => url.startsWith(prefix))
}
