import React from 'react'
import { Button, Icon } from 'semantic-ui-react'

type ExtApi = typeof chrome

const ext = (
	(globalThis as unknown as { browser?: ExtApi }).browser
	?? (globalThis as unknown as { chrome?: ExtApi }).chrome
) as ExtApi | undefined

export const RefreshButton: React.FC = () => {

	return (
		<Button
			icon
			compact
			size="small"
			basic
			color="blue"
			className="mm-hover-dim"
			onClick={() => {
				try {
					const query = ext?.tabs?.query as unknown as ((...args: unknown[]) => unknown) | undefined
					const reload = ext?.tabs?.reload as unknown as ((...args: unknown[]) => unknown) | undefined
					if (!query || !reload) {
						window.location.reload()
						return
					}

					if ((query as unknown as { length: number }).length >= 2) {
						query({ active: true, currentWindow: true }, (tabs: chrome.tabs.Tab[]) => {
							const tabId = tabs?.[0]?.id
							if (typeof tabId === 'number') reload(tabId)
							else window.location.reload()
						})
						return
					}

					void (Promise.resolve(query({ active: true, currentWindow: true } as chrome.tabs.QueryInfo)) as Promise<chrome.tabs.Tab[]>)
						.then((tabs) => {
							const tabId = tabs?.[0]?.id
							if (typeof tabId === 'number') reload(tabId)
							else window.location.reload()
						})
						.catch(() => window.location.reload())
				} catch {
					window.location.reload()
				}
			}}
			title="Reload current page"
			aria-label="Reload current page"
		>
			<Icon name="refresh" />
		</Button>
	)
}
