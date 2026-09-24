import React from 'react'

import type { Row } from '../../model/types'
import type { CreateMocksTableSchemaParams } from '../mocks-table-schema.types'

interface BuildMockDragPropsInput {
	isFirefox: boolean
	onDragStart: CreateMocksTableSchemaParams['onDragStart']
}

export function buildMockDragProps(
	input: BuildMockDragPropsInput,
	row: Row & { rowType: 'mock' },
): {
	draggable: boolean
	onDragStart: ReturnType<CreateMocksTableSchemaParams['onDragStart']> | undefined
} {
	return {
		draggable: !input.isFirefox,
		onDragStart: input.isFirefox ? undefined : input.onDragStart({ type: 'mock', id: row.mock.id }),
	}
}

export function renderCollectionPlaceholderCell(
	getCellDndHandlers: CreateMocksTableSchemaParams['getCellDndHandlers'],
	row: Row,
): JSX.Element {
	return <div style={{ width: '100%', height: '100%' }} {...getCellDndHandlers(row)} />
}
