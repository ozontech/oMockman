import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Segment } from 'semantic-ui-react'

import { getMockFromLog } from '../log-util'
import { useChromeStore, useDetachedStore, useGlobalStore } from '../../store'

import s from './log-details.module.scss'
import { LogDetailsHeader } from './log-details-header'
import { LogDetailsJson } from './log-details-json'
import { StickyTopBlock } from './top-block'

import { SideDrawer } from '@/panel/app/blocks'
import type { ILog } from '@/interface/mock'

interface Props {
	log: ILog
	onClose: () => void
}

export const LogDetails: React.FC<Props> = ({ log, onClose }) => {
	const setSelectedMock = useChromeStore((s) => s.setSelectedMock)
	const isDark = useGlobalStore((s) => s.resolvedScheme === 'dark')
	const t = useGlobalStore((s) => s.t)
	const [activeIndex, setActiveIndex] = useState(0)
	const [closing, setClosing] = useState(false)
	const closeTimer = useRef<number | null>(null)
	const drawerClassName = useMemo(() => (closing ? 'mm-sd-leave' : 'mm-sd-enter'), [closing])

	const clearCloseTimer = () => {
		if (closeTimer.current != null) {
			window.clearTimeout(closeTimer.current)
			closeTimer.current = null
		}
	}

	useEffect(() => {
		setClosing(false)
		clearCloseTimer()
	}, [log?.id])

	useEffect(() => () => clearCloseTimer(), [])

	const handleClose = useCallback(() => {
		setClosing(true)
		closeTimer.current = window.setTimeout(() => onClose(), 180)
	}, [onClose])

	const addDetachedLog = useDetachedStore((s) => s.addDetachedLog)
	const handleDetach = () => {
		addDetachedLog(log)
		setClosing(true)
		closeTimer.current = window.setTimeout(() => onClose(), 180)
	}

	const addMock = (): void => {
		setSelectedMock(getMockFromLog(log))
		setClosing(true)
		closeTimer.current = window.setTimeout(() => onClose(), 180)
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

	return (
		<SideDrawer minWidth={480} storageKey="mockman.drawer.log" className={drawerClassName} onClickOutside={handleClose}>
			<Segment raised className={s.container}>
				<StickyTopBlock
					isDark={isDark}
					url={log.request?.url}
					activeIndex={activeIndex}
					onChangeTab={setActiveIndex}
					onMock={addMock}
					onClose={handleClose}
					isDetached={false}
					onToggleDetach={(next) => next && handleDetach()}
				/>
				<div className={s.content}>
					{renderActivePane()}
				</div>
				<div className={`${s.stickyFooter} ${isDark ? s.dark : s.light}`}>
					<Button
						type="button"
						size="small"
						inverted={isDark}
						onClick={handleClose}
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
}
