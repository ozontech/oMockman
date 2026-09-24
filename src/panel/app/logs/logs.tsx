import React, { useMemo } from 'react'
import { Button, Icon, Popup } from 'semantic-ui-react'
import { toast } from 'react-toastify'

import {
	useGlobalStore,
	useChromeStore,
	useLogStore,
} from '../store'
import type { LogStoreState } from '../store'
import { Placeholder, TableWrapper, StatusBadge } from '../blocks'
import type { TableSchema } from '../blocks'

import s from './logs.module.scss'
import { getRowColor, matchesSearch } from './helpers'
import { getMockFromLog } from './log-util'

import { copyTextToClipboard, downloadJsonFile, getByPath } from '@/services/helper'
import type { ILog } from '@/interface/mock'
import { useRowAnimations } from '@/panel/app/common'

const logSelector = (s: LogStoreState) => ({
	logs: s.logs,
	isClearing: s.isClearing,
	selectedLog: s.selectedLog,
	setSelectedLog: s.setSelectedLog,
})

export const Logs: React.FC = () => {
	const { logs, isClearing, selectedLog, setSelectedLog } = useLogStore(logSelector)

	const store = useChromeStore((s) => s.store)
	const setSelectedMock = useChromeStore((s) => s.setSelectedMock)

	const isDark = useGlobalStore((s) => s.resolvedScheme === 'dark')
	const t = useGlobalStore((s) => s.t)
	const search = useGlobalStore((s) => s.search).toLowerCase()

	type Row = ILog & { id: string | number }

	const filteredLogs = useMemo(() => logs.filter((l) => matchesSearch(l, search)), [logs, search])

	const rows = useMemo<Row[]>(
		() => filteredLogs.map((l, idx) => ({
			...l,
			id: l.id ?? `${l.request?.method ?? 'UNK'}:${l.request?.url ?? ''}:${idx}`,
		})),
		[filteredLogs],
	)

	const { enteringIds, leavingIds, animateRemove } = useRowAnimations({ items: rows, durationMs: 180 })

	const copyUrl = (url: string): void => {
		void (async () => {
			const copied = await copyTextToClipboard(url)
			if (copied) toast.success(t.log_urlCopied)
		})()
	}

	const schema: TableSchema<Row> = useMemo(

		() => [
			{
				header: (
					<div className={s.counterWrap}>
						<span className={`${s.counter} ${isDark ? s.counterDark : ''}`}>{rows.length}</span>
					</div>
				),
				width: 60,
				content: (log: Row) =>
					log.isMocked ? (
						<Popup content={t.log_mockedCall} trigger={<Icon name="microchip" color="blue" />} />
					) : (
						<Popup content={t.log_networkCall} trigger={<Icon name="server" />} />
					),
			},
			{
				header: t.mocks_colMethod,
				width: 100,
				content: (log: Row) => {
					const c = getRowColor(log)
					return (
						<span style={c ? { color: c } : undefined} className={c ? s.statusStrong : undefined}>
							{log.request?.method}
						</span>
					)
				},
			},
			{
				header: <div className={s.leftHeader}>{t.mocks_colUrl}</div>,
				content: (log: Row) => {
					const c = getRowColor(log)
					const url = String(log.request?.url ?? '')
					return (
						<div className={s.urlCell}>
							<span
								style={c ? { color: c } : undefined}
								className={`${s.urlCopyText} ${c ? s.statusStrong : ''}`}
								title={t.mocks_copyUrl}
								draggable={false}
								onMouseDown={(e) => {
									e.preventDefault()
									e.stopPropagation()
								}}
								onDragStart={(e) => {
									e.preventDefault()
									e.stopPropagation()
								}}
								onClick={(e) => {
									e.preventDefault()
									e.stopPropagation()
									if (!url) return
									copyUrl(url)
								}}
							>
								{url}
							</span>
						</div>
					)
				},
			},
			{
				header: t.mocks_colStatus,
				width: 100,
				content: (log: Row) => <StatusBadge value={log.response?.status} inverted={isDark} />,
			},
			{
				header: t.mocks_colActions,
				width: 260,
				content: (log: Row) => (
					<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
						<Button
							size="mini"
							basic
							inverted={isDark}
							color={log.isMocked ? 'blue' : undefined}
							onClick={(e) => {
								e.stopPropagation()
								const mock =
									log.isMocked && log.mockPath
										? getByPath(store, log.mockPath, {})
										: getMockFromLog(log)
								setSelectedMock(mock)
							}}
						>
							{log.isMocked ? t.log_edit : t.log_mock}
						</Button>
						<Button
							icon
							basic
							color="blue"
							className={s.actionDeleteBtn}
							title={t.log_exportMock}
							onClick={(e) => {
								e.stopPropagation()
								const mock = getMockFromLog(log)
								downloadJsonFile(
									`mock-${mock.method}-${(mock.name || 'unnamed').replace(/\s+/g, '_')}.json`,
									mock,
								)
							}}
						>
							<Icon name="download" className={s.actionDeleteIcon} />
						</Button>
						<Button
							icon
							basic
							color="red"
							className={s.actionDeleteBtn}
							title={t.log_deleteLog}
							onClick={(e) => {
								e.stopPropagation()
								animateRemove([log.id], () => {
									useLogStore.setState((state) => ({ logs: state.logs.filter((l) => l.id !== log.id) }))
								})
							}}
						>
							<Icon name="trash" className={s.actionDeleteIcon} />
						</Button>
					</div>
				),
			},
		],
		[isDark, t, store, setSelectedMock, rows.length],
	)

	if (!logs.length) {
		return (
			<Placeholder
				inverted={isDark}
				title={t.log_noLogs}
				description={t.log_noLogsHint}
			/>
		)
	}

	if (!rows.length) {
		return (
			<Placeholder
				inverted={isDark}
				title={t.log_noSearch}
				description={t.log_noSearchHint}
			/>
		)
	}

	return (
		<TableWrapper
			schema={schema}
			data={rows}
			inverted={isDark}
			selectedRowId={selectedLog?.id}
			onRowClick={setSelectedLog}
			getRowClassName={(row) => {
				const id = String(row.id)
				if (isClearing) return 'mm-row-leave'
				if (leavingIds.has(id)) return 'mm-row-leave'
				if (enteringIds.has(id)) return 'mm-row-enter'
				return undefined
			}}
		/>
	)
}
