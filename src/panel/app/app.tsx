import React, { useEffect } from 'react'
import { Container, Segment } from 'semantic-ui-react'

import { Modal } from './blocks'
import { SiteAccessBanner } from './blocks/site-access-banner'
import { Mocks } from './mocks/mocks'
import { Logs } from './logs/logs'
import { Header } from './header'
import { useAutoGrantSite } from './hooks/use-auto-grant-site'
import { useStorageSync } from './hooks/use-storage-sync'
import {
	useGlobalStore,
	useChromeStore,
	ViewEnum,
} from './store'
import type { GlobalStoreState } from './store'
import s from './app.module.scss'

import { usePanelListener } from '@/panel/app/hooks'

type AppProps = GlobalStoreState['meta']

export const App: React.FC<AppProps> = (props) => {
	usePanelListener(props)
	useStorageSync()
	useAutoGrantSite()
	const { setMeta, view, resolvedScheme } = useGlobalStore((s) => ({
		setMeta: s.setMeta,
		view: s.view,
		resolvedScheme: s.resolvedScheme,
	}))

	const isDark = resolvedScheme === 'dark'

	const initMockStore = useChromeStore((s) => s.init)

	useEffect(() => {
		initMockStore()
		setMeta(props)
	}, [initMockStore, setMeta, props])

	return (
		<>
			<Container
				fluid
				style={{
					width: '100%',
					height: '100%',
					overflow: 'hidden',
					display: 'flex',
					flexDirection: 'column',
					padding: 0,
					margin: 0,
				}}
			>
				<Segment className="header-root">
					<Header />
				</Segment>

				<SiteAccessBanner />

				<Segment
					inverted={isDark}
					style={{
						flexGrow: 2,
						overflow: 'hidden',
						margin: 0,
						padding: 0,
						borderRadius: 0,
					}}
				>
					<div className={s.contentRoot}>
						<div className={`${s.viewPane} ${view === ViewEnum.MOCKS ? s.viewPaneActive : ''}`}>
							<Mocks />
						</div>
						<div className={`${s.viewPane} ${view === ViewEnum.LOGS ? s.viewPaneActive : ''}`}>
							<Logs />
						</div>
					</div>
				</Segment>
			</Container>

			<Modal />
		</>
	)
}
