import React from 'react'

import type { Row } from '../../model/types'
import type { CreateMocksTableSchemaParams } from '../mocks-table-schema.types'

import { buildMockDragProps, renderCollectionPlaceholderCell } from './cell-helpers'

import type { TableSchema } from '@/panel/app/blocks'
import { formatFullMoment, formatMoment, isRealTimestamp } from '@/services/date-format'

/** When the mock was created: "8 Oct, 14:32", today included; the full date on hover. */
export function createCreatedColumn(params: CreateMocksTableSchemaParams): TableSchema<Row>[number] {
	const { t, s, isFirefox, getCellDndHandlers, onDragStart } = params

	return {
		header: t.mocks_colCreated,
		width: 150,
		content: (row) => {
			if (row.rowType !== 'mock') return renderCollectionPlaceholderCell(getCellDndHandlers, row)
			const created = row.mock.createdOn
			return (
				<div {...buildMockDragProps({ isFirefox, onDragStart }, row)}>
					{isRealTimestamp(created) ? (
						<span className={s.dateCell} title={formatFullMoment(created, t.dateLocale)} data-testid="mock-created">
							{formatMoment(created, t.dateLocale, { dateToday: true })}
						</span>
					) : '—'}
				</div>
			)
		},
	}
}
