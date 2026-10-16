import React, { useMemo } from 'react'
import { Button, Icon, Popup } from 'semantic-ui-react'
import { toast } from 'react-toastify'

import {
	useGlobalStore,
	useChromeStore,
	useLogStore,
	useSendStore,
} from '../store'
import type { LogStoreState } from '../store'
import { Placeholder, TableWrapper, StatusBadge } from '../blocks'
import type { TableSchema } from '../blocks'

import s from './logs.module.scss'
import { getRowColor, matchesSearch } from './helpers'
import { getMockFromLog } from './log-util'

import { requestFromLog } from '@/panel/app/service/send-request'
import { copyTextToClipboard, downloadJsonFile, getByPath } from '@/services/helper'
import { formatFullMoment, formatMoment, isRealTimestamp } from '@/services/date-format'
import type { ILog } from '@/interface/mock'
import type { Translations } from '@/panel/app/i18n/translations'
import { useRowAnimations } from '@/panel/app/common'

/**
 * Both labels share one grid cell and only one shows, so the button is as wide as the longer one
 * in any language: Mock and Edit line up down the column.
 */
const MockOrEditLabel: React.FC<{ edit: boolean; t: { log_edit: string; log_mock: string } }> = ({ edit, t }) => (
	<span className={s.labelStack}>
		<span className={edit ? undefined : s.labelGhost} aria-hidden={!edit}>{t.log_edit}</span>
		<span className={edit ? s.labelGhost : undefined} aria-hidden={edit}>{t.log_mock}</span>
	</span>
)

/** What happened to a logged call: mocked, patched, sent from the panel or plain network. */
const LogKindIcon: React.FC<{ log: ILog; t: Translations }> = ({ log, t }) =>
	log.isMocked ? (
		<Popup content={t.log_mockedCall} trigger={<Icon name="microchip" color="blue" data-testid="log-mocked-response-icon" />} />
	) : log.requestPatched ? (
		<Popup content={t.log_patchedCall} trigger={<Icon name="exchange" color="yellow" data-testid="log-mocked-request-icon" />} />
	) : log.sentByMockman ? (
		<Popup content={t.log_sentCall} trigger={<Icon name="paper plane" color="teal" data-testid="log-sent-icon" />} />
	) : log.headersPatched ? (
		<Popup content={t.log_mockedHeaders} trigger={<Icon name="microchip" color="blue" data-testid="log-mocked-headers-icon" />} />
	) : (
		<Popup content={t.log_networkCall} trigger={<Icon name="server" />} />
	)

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
	const openSend = useSendStore((s) => s.openSend)

	const isDark = useGlobalStore((s) => s.resolvedScheme === 'dark')
	const t = useGlobalStore((s) => s.t)
	const actionsWidth = useGlobalStore((s) => (s.lang === 'ru' ? 260 : 220))
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
				content: (log: Row) => (
					<span className={s.kindIcons}>
						<LogKindIcon log={log} t={t} />
						{log.scenario && (
							<Popup
								content={t.log_scenario(log.scenario.collectionName, log.scenario.callNumber, log.scenario.network)}
								trigger={<Icon name="sitemap" color="violet" data-testid="log-scenario-icon" />}
							/>
						)}
					</span>
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
				minWidth: 220,
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
				header: t.logs_colTime,
				width: 130,
				content: (log: Row) => (isRealTimestamp(log.time) ? (
					<span className={s.dateCell} title={formatFullMoment(log.time, t.dateLocale)} data-testid="log-time">
						{formatMoment(log.time, t.dateLocale, { seconds: true })}
					</span>
				) : '—'),
			},
			{
				header: t.mocks_colStatus,
				width: 100,
				content: (log: Row) => <StatusBadge value={log.response?.status} inverted={isDark} />,
			},
			{
				header: t.mocks_colActions,
				width: actionsWidth,
				stickyEnd: true,
				content: (log: Row) => (
					<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
						<Button
							size="mini"
							basic
							inverted={isDark}
							color={log.isMocked || log.headersPatched ? 'blue' : log.requestPatched ? 'yellow' : undefined}
							onClick={(e) => {
								e.stopPropagation()
								const mock =
									(log.isMocked || log.isPatched) && log.mockPath
										? getByPath(store, log.mockPath, {})
										: getMockFromLog(log)
								setSelectedMock(mock)
							}}
							data-testid="log-create-mock-button"
						>
							<MockOrEditLabel edit={Boolean(log.isMocked || (log.isPatched && log.mockPath))} t={t} />
						</Button>
						<Button
							icon
							basic
							color="teal"
							className={s.actionDeleteBtn}
							title={t.log_replay}
							onClick={(e) => {
								e.stopPropagation()
								openSend(requestFromLog(log))
							}}
							data-testid="log-send-button"
						>
							<Icon name="paper plane" className={s.actionDeleteIcon} />
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
							data-testid="log-delete-button"
						>
							<Icon name="trash" className={s.actionDeleteIcon} />
						</Button>
					</div>
				),
			},
		],
		[isDark, t, store, setSelectedMock, rows.length, actionsWidth],
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
