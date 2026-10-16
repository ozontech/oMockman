import { describe, expect, it } from 'vitest'

import { fitColumnWidths, minTableWidth } from '@/panel/app/blocks/fit-column-widths'
import type { TableSchema } from '@/interface/table.types'

type Row = { id: string }
const cell = () => null

// Toggle, Name, Method, URL, Actions, like the mocks table.
const schema: TableSchema<Row> = [
	{ header: 'toggle', content: cell, width: 210 },
	{ header: 'name', content: cell, columnKey: 'name', resizable: true, minFitWidth: 180, width: 450 },
	{ header: 'method', content: cell, width: 90 },
	{ header: 'url', content: cell, columnKey: 'url', resizable: true, minFitWidth: 200, width: 520 },
	{ header: 'actions', content: cell, width: 180, stickyEnd: true },
]

describe('fitColumnWidths', () => {
	it('keeps the widths while the panel is wide enough', () => {
		expect(fitColumnWidths(schema, undefined, 1600)).toEqual([210, 450, 90, 520, 180])
	})

	it('uses the widths the user dragged to', () => {
		expect(fitColumnWidths(schema, { name: 300, url: 400 }, 1600)).toEqual([210, 300, 90, 400, 180])
	})

	it('shrinks only the resizable columns to fit', () => {
		const widths = fitColumnWidths(schema, undefined, 1200)

		expect([widths[0], widths[2], widths[4]]).toEqual([210, 90, 180])
		expect(minTableWidth(schema, widths)).toBeLessThanOrEqual(1200)
		expect(minTableWidth(schema, widths)).toBeGreaterThan(1195)
	})

	it('stops at the fit minimums and leaves the rest to scrolling', () => {
		const widths = fitColumnWidths(schema, undefined, 600)

		expect(widths).toEqual([210, 180, 90, 200, 180])
		expect(minTableWidth(schema, widths)).toBe(860)
	})

	it('counts a column without a width by its minimum', () => {
		const logs: TableSchema<Row> = [
			{ header: 'icon', content: cell, width: 60 },
			{ header: 'url', content: cell, minWidth: 220 },
			{ header: 'actions', content: cell, width: 260 },
		]

		expect(minTableWidth(logs, fitColumnWidths(logs, undefined, 400))).toBe(540)
	})

	it('leaves the widths alone before the panel is measured', () => {
		expect(fitColumnWidths(schema, undefined, null)).toEqual([210, 450, 90, 520, 180])
	})
})
