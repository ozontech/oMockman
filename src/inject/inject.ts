import { RequestIdManager } from '@/inject'
import { installBridge } from '@/inject/bridge'
import { applyFetchWrapper } from '@/inject/fetch-wrapper'
import { applyXhrWrapper } from '@/inject/xhr-wrapper'

/** Runs in the page's world. Mocks are resolved per request over the bridge; nothing is stored here. */

type ChromeRuntimeEnv = { chrome?: { runtime?: { id?: string } } }
const __IS_EXTENSION_WORLD__ =
	typeof (globalThis as unknown as ChromeRuntimeEnv)?.chrome?.runtime?.id === 'string'

declare global {
	interface Window {
		__MOCKMAN_INJECT_READY__?: boolean
		__MOCKMAN_LOADED__?: boolean
	}
}

if (!__IS_EXTENSION_WORLD__) {
	window.addEventListener('message', (evt: MessageEvent) => {
		if (evt.source !== window || !evt.data) return
		if (evt.data.type === 'MOCKMAN_CHECK_READY' && window.__MOCKMAN_INJECT_READY__) {
			window.postMessage({ type: 'MOCKMAN_INJECT_READY' }, '*')
		}
	})

	// In Chrome this file runs twice (MAIN-world content script and the <script> tag). Only the
	// copy that wraps fetch/XHR may take the port, or the other copy steals its answers.
	if (!window.__MOCKMAN_LOADED__) {
		window.__MOCKMAN_LOADED__ = true
		installBridge()
		const ids = new RequestIdManager()
		applyFetchWrapper(ids)
		applyXhrWrapper(ids)
		window.__MOCKMAN_INJECT_READY__ = true
		window.postMessage({ type: 'MOCKMAN_INJECT_READY' }, '*')
	}
}
