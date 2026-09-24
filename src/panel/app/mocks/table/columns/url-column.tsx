import React from 'react'

import type { Row } from '../../model/types'
import type { CreateMocksTableSchemaParams } from '../mocks-table-schema.types'

import { renderCollectionPlaceholderCell } from './cell-helpers'

import { resolveTemplate } from '@/services/env'
import type { TableSchema } from '@/panel/app/blocks'

export function createUrlColumn(params: CreateMocksTableSchemaParams): TableSchema<Row>[number] {
	const { s, t, columnWidths, envVars, getCellDndHandlers, onCopyUrl } = params

	return {
		header: <div className={s.leftHeader}>{t.mocks_colUrl}</div>,
		columnKey: 'url',
		resizable: true,
		minResizableWidth: 320,
		width: columnWidths.url,
		content: (row: Row) => row.rowType === 'mock' ? (
			<div className={s.textWrapLeft} style={{ paddingLeft: 0 }}>
				<span
					className={s.urlCopyText}
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
						onCopyUrl(resolveTemplate(row.mock.url, envVars))
					}}
				>
					{resolveTemplate(row.mock.url, envVars)}
				</span>
			</div>
		) : (
			renderCollectionPlaceholderCell(getCellDndHandlers, row)
		),
	}
}
