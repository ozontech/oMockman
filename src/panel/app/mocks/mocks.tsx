import React, { useMemo, useCallback, useState, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { toast } from 'react-toastify'

import { useGlobalStore, useChromeStore } from '../store'
import { Placeholder, TableWrapper } from '../blocks'

import { CollectionSettingsForm } from './components/collection-settings-form'
import s from './mocks.module.scss'
import { useMockActions, useGlobalMocksToggle, useCollectionActions } from './hooks/mocks-action'
import { DND_FALLBACK_MIME, DND_FALLBACK_PREFIX, DND_MIME } from './model/types'
import type { Row, DragEntryPayload } from './model/types'
import { buildFilteredRows } from './model/rows'
import { computeDropIntent } from './dnd/compute-drop-intent'
import { canMoveCollectionTo as canMoveCollectionToDepth } from './model/collection-depth'
import { useFirefoxPointerDnd } from './dnd/use-firefox-pointer-dnd'
import { useCollectionMeta } from './hooks/use-collection-meta'
import { createMocksTableSchema } from './mocks-table-schema'
import { buildMocksTableSchemaParams } from './table/build-mocks-table-schema-params'
import { saveCollectionOpenApiSettings } from './use-cases/save-collection-openapi-settings'
import { exportCollectionToJsonFile } from './use-cases/export-collection'

import type { ICollectionEntry } from '@/interface/collection'
import { copyTextToClipboard, downloadJsonFile } from '@/services/helper'
import { getActiveEnvVars } from '@/services/env'
import { IS_FIREFOX } from '@/services/browser'
import { useRowAnimations } from '@/panel/app/common'
import { describeSaveError } from '@/panel/app/service'

export const Mocks: React.FC = () => {
	const MAX_COLLECTION_DEPTH = 3
	const COLUMN_WIDTHS_STORAGE_KEY = 'mockman.mocks.columnWidths.v1'
	const DEFAULT_COLUMN_WIDTHS = { name: 450, url: 520 }

	const {
		store,
		selectedMock,
		setSelectedMock,
		expandedCollections,
		setExpandedCollections,
	} = useChromeStore(
		useShallow((s) => ({
			store: s.store,
			selectedMock: s.selectedMock,
			setSelectedMock: s.setSelectedMock,
			expandedCollections: s.expandedCollections,
			setExpandedCollections: s.setExpandedCollections,
		})),
	)

	const isDark = useGlobalStore((s) => s.resolvedScheme === 'dark')
	const t = useGlobalStore((s) => s.t)
	const isFirefox = IS_FIREFOX
	const search = useGlobalStore((s) => s.search)
	const { allMocksEnabled, handleToggleAllMocks } = useGlobalMocksToggle()
	const actions = useMockActions()
	const collectionActions = useCollectionActions()
	const envVars = useMemo(() => getActiveEnvVars(store), [store])

	const expanded = useMemo(() => new Set(expandedCollections), [expandedCollections])
	const [editCol, setEditCol] = useState<{ id: string; name: string } | null>(null)
	const [selectedSettingsCollectionId, setSelectedSettingsCollectionId] = useState<string | null>(null)
	const [hoverCollection, setHoverCollection] = useState<string | null>(null)
	const [columnWidths, setColumnWidths] = useState<{ name: number; url: number }>(() => {
		try {
			const raw = localStorage.getItem(COLUMN_WIDTHS_STORAGE_KEY)
			if (!raw) return DEFAULT_COLUMN_WIDTHS
			const parsed = JSON.parse(raw) as Partial<{ name: number; url: number }>
			const name = typeof parsed.name === 'number' ? parsed.name : DEFAULT_COLUMN_WIDTHS.name
			const url = typeof parsed.url === 'number' ? parsed.url : DEFAULT_COLUMN_WIDTHS.url
			return { name, url }
		} catch {
			return DEFAULT_COLUMN_WIDTHS
		}
	})
	const [dropPreview, setDropPreview] = useState<{
		rowId: string | null
		position: 'before' | 'after' | 'inside' | null
	}>({ rowId: null, position: null })
	const isInternalDragRef = useRef(false)
	const clearPreview = useCallback(() => {
		setHoverCollection(null)
		setDropPreview({ rowId: null, position: null })
	}, [])

	const rows = useMemo(
		() => buildFilteredRows(store.collectionTree, store.mocks, expanded, search),
		[store.collectionTree, store.mocks, expanded, search],
	)

	const ensureCollectionExpanded = useCallback((collectionId: string | null) => {
		if (!collectionId) return
		if (expandedCollections.includes(collectionId)) return
		setExpandedCollections([...expandedCollections, collectionId])
	}, [expandedCollections, setExpandedCollections])

	const canMoveCollectionTo = useCallback(
		(collectionId: string, targetContainerId: string | null): boolean =>
			canMoveCollectionToDepth({
				nodes: store.collectionTree.nodes,
				collectionId,
				targetContainerId,
				maxDepth: MAX_COLLECTION_DEPTH,
			}),
		[MAX_COLLECTION_DEPTH, store.collectionTree.nodes],
	)

	const { enteringIds, leavingIds, movedIds, markMoved, animateRemove } = useRowAnimations({
		items: rows,
		durationMs: 180,
	})

	const copyUrl = useCallback((url: string) => {
		if (!url) return
		void (async () => {
			const copied = await copyTextToClipboard(url)
			if (copied) toast.success(t.mocks_urlCopied)
		})()
	}, [t])

	const handleColumnWidthChange = useCallback((columnKey: string, width: number) => {
		if (columnKey !== 'name' && columnKey !== 'url') return
		const minWidth = columnKey === 'name' ? 150 : 320
		const maxWidth = columnKey === 'name' ? 1070 : Number.POSITIVE_INFINITY
		const nextWidth = Math.min(maxWidth, Math.max(minWidth, width))

		setColumnWidths((prev) => {
			if (prev[columnKey] === nextWidth) return prev
			const next = { ...prev, [columnKey]: nextWidth }
			try {
				localStorage.setItem(COLUMN_WIDTHS_STORAGE_KEY, JSON.stringify(next))
			} catch {
				void 0
			}
			return next
		})
	}, [])

	const getDragPayload = useCallback((e: React.DragEvent): DragEntryPayload | null => {
		try {
			const primary = e.dataTransfer.getData(DND_MIME)
			const fallbackRaw = e.dataTransfer.getData(DND_FALLBACK_MIME)
			const raw =
				primary
				|| (fallbackRaw?.startsWith(DND_FALLBACK_PREFIX) ? fallbackRaw.slice(DND_FALLBACK_PREFIX.length) : '')

			if (!raw) return null

			const payload = JSON.parse(raw) as DragEntryPayload
			if (!payload?.id || !payload?.type) return null
			return payload
		} catch {
			return null
		}
	}, [])

	const handleRowDrag = useCallback((row: Row | null, e: React.DragEvent) => {
		if (!row) {
			clearPreview()
			return
		}
		const payload = getDragPayload(e)
		const intent = computeDropIntent(row, e)

		if ((payload?.type === 'mock' || !payload) && row.rowType === 'collection' && intent.previewPosition === 'before') {
			clearPreview()
			return
		}

		setDropPreview({ rowId: intent.previewRowId, position: intent.previewPosition })
		if (row.rowType === 'collection') {
			if (intent.previewPosition === 'inside') setHoverCollection(row.node.id)
			else setHoverCollection(row.parentCollectionId ?? null)
		} else {
			setHoverCollection(row.parentCollectionId ?? null)
		}
	}, [clearPreview, getDragPayload])

	const toggleExpanded = useCallback((id: string) => {
		const next = new Set(expandedCollections)
		const isCollapsing = next.has(id)
		if (!isCollapsing) {
			next.add(id)
			setExpandedCollections(Array.from(next))
			return
		}

		const isDescendant = (maybeChild: string, ancestor: string): boolean => {
			let cur = store.collectionTree.nodes[maybeChild]
			while (cur?.parentId) {
				if (cur.parentId === ancestor) return true
				cur = store.collectionTree.nodes[cur.parentId]
			}
			return false
		}
		const idsToAnimate = rows
			.filter((r) => {
				if (r.rowType === 'collection') return isDescendant(r.node.id, id)
				return !!r.parentCollectionId && (r.parentCollectionId === id || isDescendant(r.parentCollectionId, id))
			})
			.map((r) => r.id)

		if (idsToAnimate.length) {
			animateRemove(idsToAnimate, () => {
				next.delete(id)
				setExpandedCollections(Array.from(next))
			})
		} else {
			next.delete(id)
			setExpandedCollections(Array.from(next))
		}
	}, [animateRemove, expandedCollections, rows, setExpandedCollections, store.collectionTree.nodes])

	const {
		mocksById,
		collectionMockCounts,
		collectionPathMap,
		collectionHasActive,
		collectionBranchEnabled,
		collectionToggleAllowed,
	} = useCollectionMeta(
		store.collectionTree,
		store.mocks,
	)

	const tableKey = useMemo(() => {
		return `${rows.length}`
	}, [rows.length])

	const expandToFirstActive = useCallback((collectionId: string) => {
		const nodes = store.collectionTree.nodes
		const isDescendant = (id: string, ancestor: string): boolean => {
			let cur = nodes[id]
			while (cur) {
				if (cur.parentId === ancestor) return true
				if (!cur.parentId) break
				cur = nodes[cur.parentId]
			}
			return false
		}

		const dfs = (colId: string): string[] | null => {
			const node = nodes[colId]
			if (!node) return null
			for (const ent of node.entries as ICollectionEntry[]) {
				if (ent.type === 'mock') {
					const mock = mocksById[ent.id]
					if (mock?.active) {
						return [colId]
					}
				} else {
					const path = dfs(ent.id)
					if (path) return [colId, ...path]
				}
			}
			return null
		}

		const path = dfs(collectionId)
		if (path) {
			const next = new Set(expandedCollections)
			for (const id of expandedCollections) {
				if (isDescendant(id, collectionId)) next.delete(id)
			}
			path.forEach((id) => next.add(id))
			setExpandedCollections(Array.from(next))
		}
	}, [store.collectionTree.nodes, mocksById, expandedCollections, setExpandedCollections])

	const getRowPath = useCallback(
		(row: Row): string => {
			if (row.rowType === 'collection') {
				return collectionPathMap[row.node.id] ?? row.node.name ?? ''
			}
			const parentId = row.parentCollectionId
			if (parentId && collectionPathMap[parentId]) {
				return `${collectionPathMap[parentId]} / ${row.mock.name ?? ''}`
			}
			return row.mock.name ?? ''
		},
		[collectionPathMap],
	)

	const onDragStart = useCallback(
		(payload: DragEntryPayload) =>
			(e: React.DragEvent) => {
				isInternalDragRef.current = true
				try {
					const raw = JSON.stringify(payload)
					e.dataTransfer.setData(DND_MIME, raw)
					e.dataTransfer.setData(DND_FALLBACK_MIME, `${DND_FALLBACK_PREFIX}${raw}`)
					e.dataTransfer.effectAllowed = 'move'
					const rowEl = (e.currentTarget as HTMLElement).closest('tr') as HTMLElement | null
					if (rowEl) {
						const rect = rowEl.getBoundingClientRect()
						const x = e.clientX - rect.left
						const y = e.clientY - rect.top
						e.dataTransfer.setDragImage(rowEl, Math.max(0, x), Math.max(0, y))
					}
				} catch {
					void 0
				}
			},
		[],
	)

	const allowDrop = useCallback((e: React.DragEvent) => {
		if (isFirefox) return
		if (!isInternalDragRef.current) return
		e.preventDefault()
		try {
			e.dataTransfer.dropEffect = 'move'
		} catch {
			void 0
		}
	}, [])

	const performDrop = useCallback(
		(e: React.DragEvent, containerId: string | null, index?: number, payload?: DragEntryPayload | null) => {
			if (isFirefox) return
			const data = payload ?? getDragPayload(e)
			if (!data) return
			if (data.type === 'collection' && !canMoveCollectionTo(data.id, containerId)) {
				toast.info(t.mocks_maxDepth)
				clearPreview()
				isInternalDragRef.current = false
				return
			}
			ensureCollectionExpanded(containerId)
			collectionActions.moveEntry({
				entryType: data.type,
				entryId: data.id,
				from: { containerId: null, index: 0 },
				to: { containerId, index: typeof index === 'number' ? index : 9999 },
			})
			if (data.type === 'mock') {
				markMoved(data.id)
			}
			clearPreview()
			isInternalDragRef.current = false
		},
		[canMoveCollectionTo, clearPreview, collectionActions, ensureCollectionExpanded, getDragPayload, markMoved],
	)

	const performDropByPayload = useCallback(
		(containerId: string | null, index: number | undefined, payload: DragEntryPayload) => {
			if (payload.type === 'collection' && !canMoveCollectionTo(payload.id, containerId)) {
				toast.info(t.mocks_maxDepth)
				clearPreview()
				return
			}
			ensureCollectionExpanded(containerId)
			collectionActions.moveEntry({
				entryType: payload.type,
				entryId: payload.id,
				from: { containerId: null, index: 0 },
				to: { containerId, index: typeof index === 'number' ? index : 9999 },
			})
			if (payload.type === 'mock') {
				markMoved(payload.id)
			}
			clearPreview()
		},
		[canMoveCollectionTo, clearPreview, collectionActions, ensureCollectionExpanded, markMoved],
	)

	const applyPreviewFromIntent = useCallback((row: Row, intent: ReturnType<typeof computeDropIntent>, payload: DragEntryPayload) => {
		if ((payload.type === 'mock') && row.rowType === 'collection' && intent.previewPosition === 'before') {
			clearPreview()
			return
		}

		setDropPreview({ rowId: intent.previewRowId, position: intent.previewPosition })
		if (row.rowType === 'collection') {
			if (intent.previewPosition === 'inside') setHoverCollection(row.node.id)
			else setHoverCollection(row.parentCollectionId ?? null)
		} else {
			setHoverCollection(row.parentCollectionId ?? null)
		}
	}, [clearPreview])

	const { draggingRowId, suppressClickRef, getRowPointerHandlers } = useFirefoxPointerDnd({
		enabled: isFirefox,
		rows,
		applyPreviewFromIntent,
		onDropByIntent: (containerId, index, payload) => performDropByPayload(containerId, index, payload),
		clearPreview,
		setDropPreview,
		setHoverCollection,
		ghostClassName: s.dndGhost,
		ghostTableClassName: s.dndGhostTable,
	})

	const handleDropOnRow = useCallback(
		(row: Row, e: React.DragEvent) => {
			if (isFirefox) return
			allowDrop(e)
			e.stopPropagation()
			const payload = getDragPayload(e)
			const intent = computeDropIntent(row, e)

			const containerId = intent.containerId
			const index = intent.index

			if ((payload?.type === 'mock' || !payload) && row.rowType === 'collection' && intent.previewPosition === 'before') {
				clearPreview()
				return
			}

			performDrop(e, containerId, index, payload)
		},
		[allowDrop, clearPreview, getDragPayload, performDrop],
	)

	const onDragEnd = useCallback(() => {
		if (isFirefox) return
		isInternalDragRef.current = false
		clearPreview()
	}, [clearPreview])

	const getCellDndHandlers = useCallback((row: Row) => ({
		onDragOver: (e: React.DragEvent) => {
			if (isFirefox) return
			allowDrop(e)
			e.stopPropagation()
			handleRowDrag(row, e)
		},
		onDrop: (e: React.DragEvent) => {
			if (isFirefox) return
			e.stopPropagation()
			handleDropOnRow(row, e)
		},
		onDragEnd,
	}), [allowDrop, handleRowDrag, handleDropOnRow, onDragEnd, isFirefox])

	const handleCollectionSettingsSave = useCallback(
		async (collectionId: string, openApiUrl: string) => {
			try {
				const { setStoreProperties } = useChromeStore.getState()
				await saveCollectionOpenApiSettings({
					store,
					collectionId,
					openApiUrl,
					setStoreProperties,
					tabId: useGlobalStore.getState().meta.tab?.id,
				})
				setSelectedSettingsCollectionId(null)
				toast.success(t.mocks_collectionSaved)
			} catch (error) {
				toast.error(describeSaveError(error, t, t.toast_collectionCannotUpdate))
			}
		},
		[store, t],
	)

	const exportCollection = useCallback((collectionId: string, name: string) => {
		try {
			exportCollectionToJsonFile({
				collectionTree: store.collectionTree,
				mocks: store.mocks,
				collectionId,
				collectionName: name,
				downloadJsonFile,
			})
		} catch {
			void 0
		}
	}, [store.collectionTree, store.mocks])

	const schemaParams = buildMocksTableSchemaParams({
		s,
		t,
		isFirefox,
		isDark,
		columnWidths,
		allMocksEnabled,
		handleToggleAllMocks,
		editCol,
		setEditCol,
		expanded,
		toggleExpanded,
		expandToFirstActive,
		getRowPath,
		getCellDndHandlers,
		allowDrop,
		handleRowDrag,
		clearPreview,
		performDrop,
		onDragStart,
		envVars,
		collectionMockCounts,
		collectionHasActive,
		collectionBranchEnabled,
		collectionToggleAllowed,
		actions,
		collectionActions,
		ensureCollectionExpanded,
		onCopyUrl: copyUrl,
		setSelectedMockRaw: setSelectedMock,
		setSelectedSettingsCollectionId,
		exportCollection,
		maxCollectionDepth: MAX_COLLECTION_DEPTH,
		rows,
		collectionNodes: store.collectionTree.nodes,
		animateRemove,
	})

	const schema = createMocksTableSchema(schemaParams)

	if (!store.mocks.length && store.collectionTree.root.length === 0)
		return (
			<Placeholder
				inverted={isDark}
				title={t.mocks_noMocks}
				description={t.mocks_noMocksHint}
			/>
		)

	if (!rows.length)
		return (
			<Placeholder
				inverted={isDark}
				title={t.mocks_noSearch}
				description={t.mocks_noSearchHint}
			/>
		)

	return (
		<>
			<div
				style={{ width: '100%', height: '100%' }}
				onDragOver={allowDrop}
				onDrop={(e: React.DragEvent) => {
					e.stopPropagation()
					performDrop(e, null, 9999)
					clearPreview()
				}}
				onDragLeave={() => {
					clearPreview()
				}}
			>
				<TableWrapper
					schema={schema}
					key={tableKey}
					data={rows}
					columnWidths={columnWidths}
					onColumnWidthChange={handleColumnWidthChange}
					striped={false}
					inverted={isDark}
					selectedRowId={selectedMock?.id}
					getRowClassName={(row) => {
						const classes: string[] = []
						const key = String(row.id)
						if (isFirefox && draggingRowId && String(row.id) === draggingRowId) {
							classes.push(s.dndDraggingSource)
						}

						let isDropAfterHere = false
						let isDropInsideHere = false

						if (dropPreview.rowId) {
							const idx = rows.findIndex((r) => r.id === dropPreview.rowId)
							if (idx !== -1) {
								if (dropPreview.position === 'after') {
									isDropAfterHere = rows[idx].id === row.id
								} else if (dropPreview.position === 'before') {
									const prev = rows[idx - 1]
									if (prev && prev.id === row.id) {
										isDropAfterHere = true
									}
								} else if (dropPreview.position === 'inside') {
									isDropInsideHere = rows[idx].id === row.id
								}
							}
						}

						if (row.rowType === 'mock' && row.level > 0) {
							classes.push('mm-in-collection')
							if (!isDropAfterHere) {
								const idx = rows.findIndex((r) => r.id === row.id)
								if (idx !== -1) {
									const next = rows[idx + 1]
									const sameCollection =
										next &&
									next.rowType === 'mock' &&
									next.parentCollectionId === row.parentCollectionId
									if (!sameCollection) {
										classes.push('mm-last-in-collection')
									}
								}
							}
						}

						if (hoverCollection) {
							if (
								(row.rowType === 'collection' && row.node.id === hoverCollection) ||
							(row.rowType === 'mock' && row.parentCollectionId === hoverCollection)
							) {
								classes.push('mm-drop-target')
							}
						}

						if (isDropAfterHere) {
							classes.push('mm-drop-after')
						}
						if (isDropInsideHere) {
							classes.push('mm-drop-target')
						}

						if (leavingIds.has(key)) classes.push('mm-row-leave')
						else if (enteringIds.has(key)) classes.push('mm-row-enter')
						else if (movedIds.has(key)) classes.push('mm-row-move')

						return classes.length ? classes.join(' ') : undefined
					}}
					getRowHandlers={(row) => {
						if (row.rowType === 'collection') {
							const editingThisRow = editCol?.id === row.node.id
							return {
								draggable: !isFirefox && !editingThisRow,
								...(isFirefox ? getRowPointerHandlers({ type: 'collection', id: row.node.id }) : {}),
								onDragStart: (e: React.DragEvent) => {
									if (isFirefox) return
									if (editingThisRow) {
										e.preventDefault()
										e.stopPropagation()
										return
									}
									onDragStart({ type: 'collection', id: row.node.id })(e)
								},
								onDragOver: (e: React.DragEvent) => {
									allowDrop(e)
									e.stopPropagation()
									handleRowDrag(row, e)
								},
								onDragEnter: (e: React.DragEvent) => {
									e.stopPropagation()
									handleRowDrag(row, e)
								},
								onDragLeave: () => {
									clearPreview()
								},
								onDrop: (e: React.DragEvent) => {
									e.stopPropagation()
									handleDropOnRow(row, e)
								},
							}
						}
						if (row.rowType === 'mock') {
							return {
								draggable: !isFirefox,
								...(isFirefox ? getRowPointerHandlers({ type: 'mock', id: row.mock.id }) : {}),
								onDragStart: isFirefox
									? undefined
									: (e: React.DragEvent) => {
										onDragStart({ type: 'mock', id: row.mock.id })(e)
									},
								onDragOver: (e: React.DragEvent) => {
									allowDrop(e)
									e.stopPropagation()
									handleRowDrag(row, e)
								},
								onDragEnter: (e: React.DragEvent) => {
									e.stopPropagation()
									handleRowDrag(row, e)
								},
								onDragLeave: () => {
									clearPreview()
								},
								onDrop: (e: React.DragEvent) => {
									e.stopPropagation()
									handleDropOnRow(row, e)
								},
							}
						}
						return undefined
					}}
					getRowAttrs={(row) => (
						row.rowType === 'collection'
							? {
								'data-row-id': String(row.id),
								'data-row-type': 'collection',
								'data-level': row.level,
								'data-collection-id': row.node.id,
								'data-scope-collection-id': row.node.id,
							}
							: {
								'data-row-id': String(row.id),
								'data-row-type': 'mock',
								'data-level': row.level,
								'data-collection-id': row.parentCollectionId ?? '',
								'data-scope-collection-id': row.parentCollectionId ?? '',
							}
					)}
					tableBodyHandlers={{
						onDragOver: (e: React.DragEvent) => {
							allowDrop(e)
							handleRowDrag(null, e)
						},
						onDragLeave: () => {
							clearPreview()
						},
						onDrop: (e: React.DragEvent) => {
							e.stopPropagation()
							performDrop(e, null)
						},
					}}
					onRowClick={(row) => {
						if (isFirefox && suppressClickRef.current) return
						if (row.rowType === 'mock') setSelectedMock(row.mock)
					}}
				/>
			</div>

			<CollectionSettingsForm
				open={selectedSettingsCollectionId !== null}
				onClose={() => setSelectedSettingsCollectionId(null)}
				selectedCollection={selectedSettingsCollectionId ? store.collectionTree.nodes[selectedSettingsCollectionId] : undefined}
				onSaveOpenApiUrl={handleCollectionSettingsSave}
				isDark={isDark}
			/>
		</>
	)
}
