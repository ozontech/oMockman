import type { TableSchema } from '../blocks'

import type { Row } from './model/types'
import type { CreateMocksTableSchemaParams } from './table/mocks-table-schema.types'
import {
	createActionsColumn,
	createDelayColumn,
	createMethodColumn,
	createNameColumn,
	createStatusColumn,
	createToggleColumn,
	createUrlColumn,
} from './table/columns'

export function createMocksTableSchema(params: CreateMocksTableSchemaParams): TableSchema<Row> {
	return [
		createToggleColumn(params),
		createNameColumn(params),
		createMethodColumn(params),
		createUrlColumn(params),
		createStatusColumn(params),
		createDelayColumn(params),
		createActionsColumn(params),
	]
}
