import type { FC, PropsWithChildren } from 'react'
import React, { useEffect } from 'react'
import 'react-toastify/dist/ReactToastify.css'
import { ToastContainer } from 'react-toastify'

import '../../styles/tokens.scss'
import '../../styles/utils.scss'

import { App } from './app'
import { useGlobalStore } from './store'
import type { GlobalStoreState } from './store'

export const AppProvider: FC<PropsWithChildren<GlobalStoreState['meta']>> = (props) => {
	const resolvedScheme = useGlobalStore((s) => s.resolvedScheme)

	useEffect(() => {
		document.body.classList.toggle('dark', resolvedScheme === 'dark')
	}, [resolvedScheme])

	const themeClass = 'ui segment'
	return (
		<div
			className={themeClass}
			style={{
				height: '100vh',
				transition: 'background 0.3s',
				padding: 0,
				margin: 0,
			}}
		>
			<App {...props} />
			<ToastContainer
				position="bottom-right"
				autoClose={3000}
				hideProgressBar={false}
				newestOnTop={false}
				closeOnClick
				rtl={false}
				pauseOnFocusLoss
				draggable
				pauseOnHover
				theme={resolvedScheme}
			/>
		</div>
	)
}
