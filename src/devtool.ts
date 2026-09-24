import { IS_FIREFOX } from '@/services/browser'

const devtools = (
	(globalThis as unknown as { browser?: { devtools?: typeof chrome.devtools } }).browser?.devtools
	?? (globalThis as unknown as { chrome?: { devtools?: typeof chrome.devtools } }).chrome?.devtools
) as typeof chrome.devtools | undefined

if (devtools) {
	devtools.panels.create(
		'Mockman',
		IS_FIREFOX ? '../icons/icon.png' : 'public/icons/icon.png',
		IS_FIREFOX ? 'panel.html' : 'public/html/panel.html',
	)
}
