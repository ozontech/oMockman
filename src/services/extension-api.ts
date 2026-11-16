/** Callback API works in Chrome and Firefox's chrome namespace. Also accepts Promise-based test adapters. */
function invoke<T>(call: (done: (value: T) => void) => unknown): Promise<T> {
	return new Promise((resolve, reject) => {
		try {
			const returned = call((value) => {
				const error = chrome.runtime.lastError
				if (error) reject(new Error(error.message ?? 'EXTENSION_API_ERROR'))
				else resolve(value)
			})
			if (returned && typeof (returned as Promise<T>).then === 'function')
				void (returned as Promise<T>).then(resolve, reject)
		} catch (error) {
			reject(error)
		}
	})
}
export const storageGet = (
	area: chrome.storage.StorageArea,
	key: string,
): Promise<Record<string, unknown>> => invoke((done) => area.get(key, done))
export const storageSet = (
	area: chrome.storage.StorageArea,
	value: Record<string, unknown>,
): Promise<void> => invoke((done) => area.set(value, () => done(undefined)))
export const storageRemove = (area: chrome.storage.StorageArea, key: string): Promise<void> =>
	invoke((done) => area.remove(key, () => done(undefined)))
export const getTab = (tabId: number): Promise<chrome.tabs.Tab> =>
	invoke((done) => chrome.tabs.get(tabId, done))
export const queryTabs = (query: chrome.tabs.QueryInfo = {}): Promise<chrome.tabs.Tab[]> =>
	invoke((done) => chrome.tabs.query(query, done))
export const sendExtensionMessage = <T>(message: unknown): Promise<T> =>
	invoke((done) => chrome.runtime.sendMessage(message, done))
