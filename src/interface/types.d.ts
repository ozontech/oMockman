declare global {
	interface Window {
		__MOCKMAN_CONTENT_PORT__?: chrome.runtime.Port | null
	}
}

export type __mockman_global_types = unknown
