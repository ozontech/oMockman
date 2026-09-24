import React from 'react'

import type { Row } from '../../model/types'
import type { CreateMocksTableSchemaParams } from '../mocks-table-schema.types'

import { buildMockDragProps, renderCollectionPlaceholderCell } from './cell-helpers'

import type { TableSchema } from '@/panel/app/blocks'

export function createDelayColumn(params: CreateMocksTableSchemaParams): TableSchema<Row>[number] {
	const { t, isFirefox, getCellDndHandlers, onDragStart } = params

	return {
		header: t.mocks_colDelay,
		width: 90,
		content: (row) => row.rowType === 'mock' ? (
			<div {...buildMockDragProps({ isFirefox, onDragStart }, row)}>
				{row.mock.delay == null ? '—' : row.mock.delay}
			</div>
		) : (
			renderCollectionPlaceholderCell(getCellDndHandlers, row)
		),
	}
}
