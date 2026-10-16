import type { TableSchema } from '@/interface/table.types'

/**
 * Widths the columns get in a panel of `available` pixels. Fixed columns keep theirs; resizable
 * ones shrink, in proportion to how much each can give, down to `minFitWidth`. What still does
 * not fit is scrolled: the result can sum to more than `available`.
 *
 * A column with no width at all takes what is left, so it counts with its `minWidth`.
 */
export function fitColumnWidths<T>(
	schema: TableSchema<T>,
	columnWidths: Record<string, number> | undefined,
	available: number | null,
): Array<number | undefined> {
	const desired = schema.map((column) => {
		const stored = typeof column.columnKey === 'string' ? columnWidths?.[column.columnKey] : undefined
		return typeof stored === 'number' ? stored : column.width
	})
	if (available == null || available <= 0) return desired

	const floors = schema.map((column, i) => {
		const width = desired[i]
		if (!column.resizable || typeof width !== 'number') return width
		return Math.min(width, column.minFitWidth ?? column.minResizableWidth ?? 120)
	})

	const total = schema.reduce((sum, column, i) => sum + (desired[i] ?? column.minWidth ?? 0), 0)
	const overflow = total - available
	if (overflow <= 0) return desired

	const slack = desired.reduce<number>((sum, width, i) => sum + ((width ?? 0) - (floors[i] ?? 0)), 0)
	if (slack <= 0) return desired

	const share = Math.min(1, overflow / slack)
	return desired.map((width, i) => {
		if (typeof width !== 'number' || !schema[i].resizable) return width
		return Math.floor(width - (width - (floors[i] ?? width)) * share)
	})
}

/** The width the table may not go below: past it the panel scrolls sideways. */
export function minTableWidth<T>(schema: TableSchema<T>, widths: Array<number | undefined>): number {
	return schema.reduce((sum, column, i) => sum + (widths[i] ?? column.minWidth ?? 0), 0)
}
