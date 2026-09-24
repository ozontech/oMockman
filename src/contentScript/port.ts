let pageHideBound = false

type PortMessageHandler = (message: unknown) => void

const messageHandlers = new Set<PortMessageHandler>()

export function onContentPortMessage(handler: PortMessageHandler): void {
	messageHandlers.add(handler)
}

export function getContentPort(): chrome.runtime.Port {
	const w = window
	if (!w.__MOCKMAN_CONTENT_PORT__) {
		w.__MOCKMAN_CONTENT_PORT__ = chrome.runtime.connect({ name: 'mockman-content' })
		w.__MOCKMAN_CONTENT_PORT__.onMessage.addListener((message: unknown) => {
			for (const handler of messageHandlers) {
				try {
					handler(message)
				} catch {
					void 0
				}
			}
		})
		w.__MOCKMAN_CONTENT_PORT__.onDisconnect.addListener(() => {
			void chrome.runtime.lastError
			w.__MOCKMAN_CONTENT_PORT__ = null
		})

		if (!pageHideBound) {
			pageHideBound = true
			w.addEventListener('pagehide', () => {
				try {
					w.__MOCKMAN_CONTENT_PORT__?.disconnect()
				} catch {
					/* the port is already closed */
				}
				w.__MOCKMAN_CONTENT_PORT__ = null
			})
		}
	}
	return w.__MOCKMAN_CONTENT_PORT__ as chrome.runtime.Port
}
