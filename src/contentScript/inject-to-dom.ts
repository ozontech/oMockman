export const inject = (): void => {
	const s = document.createElement('script')
	s.src = chrome.runtime.getURL('js/inject.js')
	;(document.head || document.documentElement).appendChild(s)
}