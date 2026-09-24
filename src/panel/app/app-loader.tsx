import React, { useEffect, useState } from 'react'
import { Loader, Segment } from 'semantic-ui-react'

import { AppProvider } from './app-provider'

const getDomain = (rawUrl = ''): string => {
	try {
		return new URL(rawUrl).hostname
	} catch {
		return ''
	}
}
interface AppLoaderProps {
	tab: chrome.tabs.Tab
}

export const AppLoader: React.FC<AppLoaderProps> = ({ tab }) => {
	const [loaded, setLoaded] = useState(false)
	const [active, setActive] = useState(false)

	const host = getDomain(tab.url) || 'invalid'
	const storeKey = `mockman.extension.active.${host}`

	useEffect(() => {
		let cancelled = false;

		(async () => {
			if (cancelled) return

			setActive(true)
			setLoaded(true)
		})()

		return () => {
			cancelled = true
		}
	}, [])

	if (!loaded) {
		return (
			<Segment basic>
				<Loader active content="Loading..." size="large" />
			</Segment>
		)
	}

	return (
		<AppProvider
			host={host}
			tab={tab}
			active={active}
			storeKey={storeKey}
		/>
	)
}
