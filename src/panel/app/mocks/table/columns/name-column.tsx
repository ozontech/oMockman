import React from 'react'
import { Button, Icon, Input } from 'semantic-ui-react'

import type { Row } from '../../model/types'
import type { CreateMocksTableSchemaParams } from '../mocks-table-schema.types'

import type { TableSchema } from '@/panel/app/blocks'

export function createNameColumn(params: CreateMocksTableSchemaParams): TableSchema<Row>[number] {
	const {
		s,
		t,
		isFirefox,
		columnWidths,
		editCol,
		setEditCol,
		expanded,
		toggleExpanded,
		getRowPath,
		getCellDndHandlers,
		allowDrop,
		handleRowDrag,
		clearPreview,
		performDrop,
		onDragStart,
		collectionActions,
	} = params

	return {
		header: (
			<div
				style={{ textAlign: 'center', width: '100%' }}
				onDragOver={(e) => {
					allowDrop(e)
					handleRowDrag(null, e)
				}}
				onDragEnter={(e) => handleRowDrag(null, e)}
				onDragLeave={() => {
					clearPreview()
				}}
				onDrop={(e) => {
					e.stopPropagation()
					performDrop(e, null)
				}}
			>
				{t.mocks_colName}
			</div>
		),
		columnKey: 'name',
		resizable: true,
		minResizableWidth: 150,
		maxResizableWidth: 1070,
		maxWidth: 1070,
		width: columnWidths.name,
		content: (row: Row) => {
			if (row.rowType === 'collection') {
				const isEditing = editCol?.id === row.node.id
				const canEditName = !isEditing
				return (
					<div
						className={`${s.textWrap} ${s.collectionNameCell}`}
						{...getCellDndHandlers(row)}
						title={getRowPath(row)}
					>
						<div className={s.collectionNameMain}>
							{isEditing ? (
								<span className={`${s.collectionNameLabel} ${s.collectionNameEditWrap}`}>
									<Icon name="folder" />
									<Input
										className={s.collectionNameInput}
										data-mm-no-dnd="1"
										draggable={false}
										autoFocus
										value={editCol?.name ?? ''}
										onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
											setEditCol({
												id: row.node.id,
												name: e.currentTarget.value,
											})}
										onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
										onDragStart={(e: React.DragEvent) => {
											e.preventDefault()
											e.stopPropagation()
										}}
										onBlur={() => {
											const name = (editCol?.name ?? '').trim()
											setEditCol(null)
											if (name && name !== row.node.name)
												collectionActions.renameCollection(row.node.id, name)
										}}
										onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
											if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
										}}
										size="small"
									/>
								</span>
							) : (
								<span
									data-mm-no-dnd="1"
									className={s.collectionNameLabel}
									onMouseDown={(e) => e.stopPropagation()}
								>
									<Icon name="folder" />
									<span className={s.collectionNameText}>{row.node.name}</span>
								</span>
							)}
						</div>
						<div className={s.collectionNameControls}>
							{canEditName ? (
								<Button
									size="mini"
									icon
									basic
									color="blue"
									title={t.mocks_editRow(row.node.name)}
									className={s.collectionNameEditBtn}
									onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
									onClick={(e) => {
										e.stopPropagation()
										setEditCol({ id: row.node.id, name: row.node.name })
									}}
								>
									<Icon name="edit" />
								</Button>
							) : null}
							<Button
								size="mini"
								icon
								basic
								color="grey"
								onClick={() => toggleExpanded(row.node.id)}
								title={expanded.has(row.node.id) ? t.mocks_collapse : t.mocks_expand}
							>
								<Icon name={expanded.has(row.node.id) ? 'chevron up' : 'chevron down'} />
							</Button>
						</div>
					</div>
				)
			}
			return (
				<div
					className={s.textWrap}
					style={{ paddingLeft: 0 }}
					draggable={!isFirefox}
					onDragStart={isFirefox ? undefined : onDragStart({ type: 'mock', id: row.mock.id })}
					{...getCellDndHandlers(row)}
					title={getRowPath(row)}
				>
					{row.mock.name}
				</div>
			)
		},
	}
}
