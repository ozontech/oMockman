import React from 'react'
import { Menu, Tab, Input, Button, Icon } from 'semantic-ui-react'
import { useShallow } from 'zustand/react/shallow'

import { useGlobalStore, ViewEnum } from '../store'
import type { GlobalStoreState } from '../store'

import { useAddMock } from './hooks'
import { DocsButton } from './docs-button'
import { ImportMockButton } from './import-mock-button'
import { SettingsButton } from './settings-button'
import { ClearButton } from './clear-button'
import { RecordButton } from './record-button'
import { LoggingButton } from './logging-button'
import s from './header.module.scss'

import { useCollectionActions } from '@/panel/app/mocks'

const viewSelector = (s: GlobalStoreState) => ({
	view: s.view,
	setView: s.setView,
	search: s.search,
	setSearch: s.setSearch,
})

export const Header: React.FC = () => {
	const { view, setView, search, setSearch } = useGlobalStore(useShallow(viewSelector))
	const isDark = useGlobalStore((s) => s.resolvedScheme === 'dark')
	const t = useGlobalStore((s) => s.t)
	const handleAddMock = useAddMock()
	const { createCollection } = useCollectionActions()
	const panes = [
		{ menuItem: <Menu.Item key={ViewEnum.MOCKS} name={t.header_mocks} data-testid="tab-mocks" />, render: () => null },
		{ menuItem: <Menu.Item key={ViewEnum.LOGS} name={t.header_logs} data-testid="tab-logs" />, render: () => null },
	]
	const viewToIndex: Record<ViewEnum, number> = {
		[ViewEnum.MOCKS]: 0,
		[ViewEnum.LOGS]: 1,
	}
	const indexToView: Record<number, ViewEnum> = {
		0: ViewEnum.MOCKS,
		1: ViewEnum.LOGS,
	}

	return (
		<Menu secondary borderless className={`header-bar ${s.bar}`}>
			<Menu.Item className={s.tabItem} style={{ paddingRight: 0 }}>
				<Tab
					menu={{
						secondary: true,
						pointing: true,
					}}
					panes={panes}
					activeIndex={viewToIndex[view] ?? 0}
					onTabChange={(_, d) => {
						if (typeof d.activeIndex !== 'number') return
						setView(indexToView[d.activeIndex] ?? ViewEnum.MOCKS)
					}}
					renderActiveOnly={false}
				/>
			</Menu.Item>

			<Menu.Item className={`${s.middle} ${s.afterTabsGap}`} style={{ paddingLeft: 0 }}>
				<div className={`${s.actionsSlot} ${view === ViewEnum.MOCKS ? s.actionsSlotShown : s.actionsSlotHidden}`}>
					<span className={s.actionItem} data-idx="1">
						<Button
							size="small"
							basic
							inverted={isDark}
							icon
							labelPosition="left"
							onClick={handleAddMock}
							className={s.addMockBtn}
							title={t.header_addMock}
						>
							<Icon name="add" />
							{t.header_addMock}
						</Button>
					</span>

					<span className={s.actionItem} data-idx="2">
						<Button
							size="small"
							basic
							inverted={isDark}
							icon
							labelPosition="left"
							onClick={() => createCollection(null)}
							className={s.addMockBtn}
							title={t.header_addCollection}
						>
							<Icon name="folder" />
							{t.header_addCollection}
						</Button>
					</span>

					<span className={s.actionItem} data-idx="3">
						<ImportMockButton />
					</span>
				</div>

				<Input
					size="small"
					value={search}
					placeholder={t.header_search}
					onChange={(e) => setSearch(e.currentTarget.value)}
					icon={<Icon name="search" />}
					className={`${isDark ? 'inverted' : ''} ${s.searchInput}`}
				/>

				<RecordButton />
				<div className={`${s.actionsSlot} ${view === ViewEnum.LOGS ? s.actionsSlotShown : s.actionsSlotHidden}`}>
					<span className={s.actionItem} data-idx="2">
						<LoggingButton />
					</span>
					<span className={s.actionItem} data-idx="3">
						<ClearButton />
					</span>
				</div>
			</Menu.Item>

			<Menu.Menu position="right" className={s.rightMenu}>
				<DocsButton />
				<SettingsButton />
			</Menu.Menu>
		</Menu>
	)
}
