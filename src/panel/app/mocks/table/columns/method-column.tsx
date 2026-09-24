import React from 'react'

import type { Row } from '../../model/types'
import type { CreateMocksTableSchemaParams } from '../mocks-table-schema.types'

import { buildMockDragProps, renderCollectionPlaceholderCell } from './cell-helpers'

import type { TableSchema } from '@/panel/app/blocks'

export function createMethodColumn(params: CreateMocksTableSchemaParams): TableSchema<Row>[number] {
	const { t, isFirefox, getCellDndHandlers, onDragStart } = params

	return {
		header: t.mocks_colMethod,
		width: 90,
		content: (row) => row.rowType === 'mock' ? (
			<div {...buildMockDragProps({ isFirefox, onDragStart }, row)}>
				{row.mock.method}
			</div>
		) : (
			renderCollectionPlaceholderCell(getCellDndHandlers, row)
		),
	}
}
