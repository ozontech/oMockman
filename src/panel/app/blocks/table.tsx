import React, { isValidElement, cloneElement, useMemo, useRef, useState } from 'react'
import { Table, Button } from 'semantic-ui-react'
import type { ReactNode, ReactElement } from 'react'

import s from './table.module.scss'

import type { TableWrapperProps } from '@/interface'

export type { TableWrapperProps, TableSchema } from '../../../interface/table.types'

function patchNodeForDark(node: ReactNode, inverted?: boolean): ReactNode {
	if (!inverted || !isValidElement(node)) return node

	const el = node as ReactElement & { type: { displayName?: string } }

	const isBtn =
		el.type === Button ||
		(el.type?.displayName ?? '').includes('Button')

	if (!isBtn) return node
	if (el.props?.inverted !== undefined) return node

	return cloneElement(el, { inverted: true })
}

export const TableWrapper = <T extends { id: string | number }>({
	schema,
	data,
	onRowClick,
	selectedRowId,
	inverted,
	striped = true,
	getRowClassName,
	getRowHandlers,
	tableBodyHandlers,
	getRowAttrs,
	enableColumnReorder,
	columnWidths,
	onColumnWidthChange,
}: TableWrapperProps<T>) => {
	const wrapperRef = useRef<HTMLDivElement | null>(null)

	const [columnOrder] = useState<number[]>(() => schema.map((_, i) => i))

	const orderedSchema = useMemo(
		() => columnOrder.map((schemaIndex) => schema[schemaIndex]),
		[columnOrder, schema],
	)

	const handleHeaderDragStart = () => {
		if (!enableColumnReorder) return
	}

	const startResize = (
		event: React.MouseEvent,
		columnKey: string,
		currentWidth: number,
		minResizableWidth: number,
		maxResizableWidth?: number,
	): void => {
		if (!onColumnWidthChange) return
		event.preventDefault()
		event.stopPropagation()

		const startX = event.clientX

		const onMouseMove = (moveEvent: MouseEvent): void => {
			const delta = moveEvent.clientX - startX
			const boundedMinWidth = Math.max(minResizableWidth, Math.round(currentWidth + delta))
			const nextWidth =
				typeof maxResizableWidth === 'number'
					? Math.min(maxResizableWidth, boundedMinWidth)
					: boundedMinWidth
			onColumnWidthChange(columnKey, nextWidth)
		}

		const onMouseUp = (): void => {
			window.removeEventListener('mousemove', onMouseMove)
			window.removeEventListener('mouseup', onMouseUp)
		}

		window.addEventListener('mousemove', onMouseMove)
		window.addEventListener('mouseup', onMouseUp)
	}

	return (
		<div className={s.tableWrapper} ref={wrapperRef}>
			<Table
				celled
				striped={striped}
				selectable
				compact
				inverted={inverted}
				className={s.table}
			>
				<Table.Header>
					<Table.Row>
						{orderedSchema.map((column, visibleIdx) => {
							const {
								header,
								minWidth,
								maxWidth,
								width,
								columnKey,
								resizable,
								minResizableWidth,
								maxResizableWidth,
							} = column

							const effectiveWidth =
								typeof columnKey === 'string' && typeof columnWidths?.[columnKey] === 'number'
									? columnWidths[columnKey]
									: width

							const canResize = Boolean(resizable && columnKey && onColumnWidthChange)
							const safeMinWidth = minResizableWidth ?? minWidth ?? 120
							const safeMaxWidth = maxResizableWidth ?? maxWidth

							return (
								<Table.HeaderCell
									key={columnOrder[visibleIdx]}
									className={s.th}
									style={{
										minWidth,
										maxWidth,
										width: effectiveWidth,
										zIndex: orderedSchema.length - visibleIdx + 1,
									}}
									draggable={false}
									onDragStart={handleHeaderDragStart}
								>
									<div className={s.headerCellContent}>{patchNodeForDark(header, inverted)}</div>
									{canResize ? (
										<div
											className={s.columnResizeHandle}
											onMouseDown={(event) =>
												startResize(
													event,
													String(columnKey),
													typeof effectiveWidth === 'number' ? effectiveWidth : safeMinWidth,
													safeMinWidth,
													safeMaxWidth,
												)
											}
										/>
									) : null}
								</Table.HeaderCell>
							)
						})}
					</Table.Row>
				</Table.Header>

				<Table.Body {...(tableBodyHandlers || {})}>
					{data.map((row) => {
						const selected = row.id === selectedRowId
						const extra = (getRowClassName && getRowClassName(row)) || ''
						const rowHandlers = getRowHandlers ? getRowHandlers(row) : undefined
						const rowAttrs = getRowAttrs ? getRowAttrs(row) : undefined
						return (
							<Table.Row
								key={row.id}
								active={selected}
								className={`${s.row} ${extra}`.trim()}
								{...rowHandlers}
								{...rowAttrs}
							>
								{orderedSchema.map(({ content, colSpan, hidden, disableRowClick }, visibleIdx) => {
									if (hidden?.(row)) return null
									const span = colSpan?.(row)
									return (
										<Table.Cell
											key={columnOrder[visibleIdx]}
											className={s.cell}
											colSpan={span}
											onClick={disableRowClick ? undefined : () => onRowClick?.(row)}
										>
											{patchNodeForDark(content(row), inverted)}
										</Table.Cell>
									)
								})}
							</Table.Row>
						)
					})}
				</Table.Body>
			</Table>
		</div>
	)
}
