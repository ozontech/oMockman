import type { ReactNode } from 'react'

export type TableSchema<T> = Array<{
	header: ReactNode
	content: (row: T) => ReactNode
	columnKey?: string
	minWidth?: number
	maxWidth?: number
	width?: number
	resizable?: boolean
	minResizableWidth?: number
	maxResizableWidth?: number
	/**
	 * Merges several columns into one cell (for example colSpan=2).
	 */
	colSpan?: (row: T) => number | undefined
	/**
	 * Returning true skips rendering the cell for that column/row.
	 */
	hidden?: (row: T) => boolean
	/**
	 * When true, clicking the cell does not trigger onRowClick.
	 */
	disableRowClick?: boolean
}>

export interface TableWrapperProps<T> {
	schema: TableSchema<T>
	data: T[]
	onRowClick?: (row: T) => void
	selectedRowId?: number | string
	inverted?: boolean
	striped?: boolean
	getRowClassName?: (row: T) => string | undefined
	getRowHandlers?: (row: T) => Record<string, unknown> | undefined
	tableBodyHandlers?: Record<string, unknown>
	getRowAttrs?: (row: T) => Record<string, string | number | boolean> | undefined
	enableColumnReorder?: boolean
	columnWidths?: Record<string, number>
	onColumnWidthChange?: (columnKey: string, width: number) => void
}

