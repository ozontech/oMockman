import React from 'react'

import type { Row } from '../../model/types'
import type { CreateMocksTableSchemaParams } from '../mocks-table-schema.types'

import { buildMockDragProps, renderCollectionPlaceholderCell } from './cell-helpers'

import { StatusBadge } from '@/panel/app/blocks'
import type { TableSchema } from '@/panel/app/blocks'

export function createStatusColumn(params: CreateMocksTableSchemaParams): TableSchema<Row>[number] {
	const { t, isFirefox, isDark, getCellDndHandlers, onDragStart } = params

	return {
		header: t.mocks_colStatus,
		width: 90,
		content: (row) => row.rowType === 'mock' ? (
			<div {...buildMockDragProps({ isFirefox, onDragStart }, row)}>
				<StatusBadge value={row.mock.status} inverted={isDark} />
			</div>
		) : (
			renderCollectionPlaceholderCell(getCellDndHandlers, row)
		),
	}
}
