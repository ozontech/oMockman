import React from 'react'
import { Button, Checkbox, Icon } from 'semantic-ui-react'
import type { CheckboxProps } from 'semantic-ui-react'

import type { Row } from '../../model/types'
import type { CreateMocksTableSchemaParams } from '../mocks-table-schema.types'

import type { TableSchema } from '@/panel/app/blocks'

export function createToggleColumn(params: CreateMocksTableSchemaParams): TableSchema<Row>[number] {
	const {
		s,
		t,
		isFirefox,
		isDark,
		allMocksEnabled,
		handleToggleAllMocks,
		editCol,
		expandToFirstActive,
		getRowPath,
		getCellDndHandlers,
		actions,
		collectionActions,
		collectionMockCounts,
		collectionHasActive,
		collectionBranchEnabled,
		collectionToggleAllowed,
		onDragStart,
	} = params

	return {
		header: (
			<div className={s.cellCenter}>
				<Button
					size="mini"
					icon
					labelPosition="left"
					onClick={(e) => {
						e.stopPropagation()
						handleToggleAllMocks()
					}}
					title={allMocksEnabled ? t.mocks_disableMock : t.mocks_enableMock}
					className={`${s.mockingBtn} ${s.allMockingBtn} ${allMocksEnabled ? s.on : s.off}`}
				>
					<Icon name={allMocksEnabled ? 'toggle on' : 'toggle off'} />
					{allMocksEnabled ? t.mocks_enableAll : t.mocks_disableAll}
				</Button>
			</div>
		),
		minWidth: 210,
		maxWidth: 210,
		width: 210,
		disableRowClick: true,
		content: (row: Row) => {
			if (row.rowType === 'collection') {
				const mocksCount = collectionMockCounts[row.node.id] ?? 0
				const collectionEnabled = collectionBranchEnabled[row.node.id] !== false
				const collectionToggleDisabled = !allMocksEnabled || collectionToggleAllowed[row.node.id] === false
				const isEditing = editCol?.id === row.node.id
				return (
					<div
						className={`${s.textWrap} ${s.collectionToggleCell} ${s.collectionLeftCell}`}
						draggable={!isFirefox && !isEditing}
						style={{ fontWeight: 600 }}
						onDragStart={(e: React.DragEvent) => {
							if (isFirefox) return
							if (isEditing) {
								e.preventDefault()
								e.stopPropagation()
								return
							}
							onDragStart({ type: 'collection', id: row.node.id })(e)
						}}
						{...getCellDndHandlers(row)}
						title={getRowPath(row)}
					>
						<span className={s.collectionMetaRow}>
							<span className={s.lightningSlot}>
								{collectionHasActive[row.node.id] ? (
									<Icon
										data-mm-no-dnd="1"
										name="lightning"
										color="blue"
										className={s.activeMockIcon}
										title={t.mocks_hasActive}
										onClick={(e: React.MouseEvent) => {
											e.stopPropagation()
											expandToFirstActive(row.node.id)
										}}
									/>
								) : null}
							</span>
							<span className={`${s.collectionCounter} ${isDark ? s.collectionCounterDark : ''}`}>
								{mocksCount}
							</span>
							<Button
								size="mini"
								icon
								labelPosition="left"
								disabled={collectionToggleDisabled}
								onClick={(e) => {
									e.stopPropagation()
									collectionActions.toggleCollectionMocking(row.node.id, !collectionEnabled)
								}}
								title={collectionEnabled ? t.mocks_disableCollection : t.mocks_enableCollection}
								className={`${s.mockingBtn} ${s.collectionMockingBtn} ${collectionEnabled ? s.on : s.off}`}
							>
								<Icon name={collectionEnabled ? 'toggle on' : 'toggle off'} />
								{collectionEnabled ? t.mocks_collectionOn : t.mocks_collectionOff}
							</Button>
						</span>
					</div>
				)
			}
			const parentCollectionEnabled = !row.parentCollectionId || collectionBranchEnabled[row.parentCollectionId] !== false
			return (
				<div
					className={s.cellCenter}
					{...getCellDndHandlers(row)}
					style={{ width: '100%', height: '100%' }}
				>
					{row.rowType === 'mock' ? (
						<Checkbox
							toggle
							disabled={!allMocksEnabled || !parentCollectionEnabled}
							inverted={isDark}
							checked={row.mock.active && parentCollectionEnabled}
							onChange={(_e, data: CheckboxProps) =>
								actions.toggleMock({ ...row.mock, active: !!data.checked })
							}
							className={s.smallToggle}
						/>
					) : null}
				</div>
			)
		},
	}
}
