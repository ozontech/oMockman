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

/** Resolve only pages belonging to this extension; content scripts fail the origin check. */
function extensionPagePath(sender: chrome.runtime.MessageSender | undefined): string | undefined {
	const runtimeId = globalThis.chrome?.runtime?.id
	const base = extensionBase()
	if (!sender || !runtimeId || sender.id !== runtimeId || !base) return undefined
	try {
		const url = new URL(sender.url ?? '')
		return url.protocol === base.protocol && url.host === base.host ? url.pathname : undefined
	} catch {
		return undefined
	}
}

/** Only our packaged panel can access the library and secrets.
 * The panel may run in DevTools or in a regular browser tab (sender.tab).
 * Authenticate its extension ID and exact packaged URL, not the presence of a tab.
 */
export function isExtensionPageSender(sender: chrome.runtime.MessageSender | undefined): boolean {
	const path = extensionPagePath(sender)
	return path !== undefined && PRIVILEGED_PAGES.has(path)
}

/** Dedicated MCP setup page may live in a tab, but receives only MCP settings commands. */
export function isMcpSettingsSender(sender: chrome.runtime.MessageSender | undefined): boolean {
	return extensionPagePath(sender) === '/public/html/mcp.html'
}

/** Popup can toggle the global flag, never replace the library or read secrets. */
export function isPopupSender(sender: chrome.runtime.MessageSender | undefined): boolean {
	return extensionPagePath(sender) === '/public/html/popup.html'
}
