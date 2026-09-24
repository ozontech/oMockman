import React, { useState, useEffect, useRef } from 'react'
import { Segment, Button } from 'semantic-ui-react'

import { getMockFromLog } from '../log-util'
import { useChromeStore, useGlobalStore } from '../../store'

import s from './log-details.module.scss'
import { LogDetailsHeader } from './log-details-header'
import { LogDetailsJson } from './log-details-json'
import { StickyTopBlock } from './top-block'

import { SideDrawer } from '@/panel/app/blocks'
import type { ILog } from '@/interface/mock'
import { useDetachedWindow } from '@/panel/app/hooks/use-detached-window'

interface Props {
	log: ILog
	onClose: () => void
}

export const LogDetailsDetached: React.FC<Props> = ({ log, onClose }) => {
	const setSelectedMock = useChromeStore((s) => s.setSelectedMock)
	const isDark = useGlobalStore((s) => s.resolvedScheme === 'dark')
	const t = useGlobalStore((s) => s.t)
	const [activeIndex, setActiveIndex] = useState(0)
	const wasDetachedRef = useRef(false)

	const { render, detach, isDetached } = useDetachedWindow({
		title: 'MockMan — Log Details',
	})
	useEffect(() => {
		detach()
	}, [detach])
	useEffect(() => {
		if (isDetached) {
			wasDetachedRef.current = true
		}
	}, [isDetached])
	useEffect(() => {
		if (wasDetachedRef.current && !isDetached) {
			onClose()
		}
	}, [isDetached, onClose])

	const addMock = (): void => {
		setSelectedMock(getMockFromLog(log))
		onClose()
	}
	const isPending = log.response == null

	const renderActivePane = (): React.ReactNode => {
		switch (activeIndex) {
			case 0:
				return (
					<Segment basic inverted={isDark} style={{ padding: 0 }}>
						<LogDetailsJson isRequestPending={isPending} response={log.response?.response} useEditor={false} tooLargeBytes={log.response?.tooLarge ? (log.response.size ?? 0) : undefined} />
					</Segment>
				)
			case 1:
				return (
					<Segment basic inverted={isDark} style={{ padding: 0 }}>
						<LogDetailsJson isRequestPending={isPending} response={log.request?.body} tooLargeBytes={log.request?.bodyTooLarge ? (log.request.bodySize ?? 0) : undefined} />
					</Segment>
				)
			case 2:
				return (
					<Segment basic inverted={isDark} style={{ padding: 0 }}>
						<LogDetailsJson isRequestPending={isPending} response={log.request?.queryParams} useEditor={false} />
					</Segment>
				)
			default:
				return (
					<Segment basic inverted={isDark} style={{ padding: 0, border: 'none', boxShadow: 'none' }}>
						<LogDetailsHeader
							responseHeaders={log.response?.headers}
							requestHeaders={log.request?.headers}
						/>
					</Segment>
				)
		}
	}

	const content = (
		<SideDrawer minWidth={480} storageKey="mockman.drawer.log" detached>
			<Segment raised className={s.container}>
				<StickyTopBlock
					isDark={isDark}
					url={log.request?.url}
					activeIndex={activeIndex}
					onChangeTab={setActiveIndex}
					onMock={addMock}
					onClose={onClose}
					isDetached
				/>
				<div className={s.content}>
					{renderActivePane()}
				</div>
				<div className={`${s.stickyFooter} ${isDark ? s.dark : s.light}`}>
					<Button
						type="button"
						size="small"
						inverted={isDark}
						onClick={onClose}
						className={s.button}
						basic
						style={{ color: '#e06c75' }}
					>
						{t.logDetail_close}
					</Button>
				</div>
			</Segment>
		</SideDrawer>
	)

	return render(content)
}
