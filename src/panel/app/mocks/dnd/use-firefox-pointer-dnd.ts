import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { Row, DragEntryPayload } from '../model/types'

import { computeDropIntent } from './compute-drop-intent'

export type UseFirefoxPointerDndParams = {
	enabled: boolean
	rows: Row[]
	applyPreviewFromIntent: (
		row: Row,
		intent: ReturnType<typeof computeDropIntent>,
		payload: DragEntryPayload,
	) => void
	onDropByIntent: (containerId: string | null, index: number, payload: DragEntryPayload) => void
	clearPreview: () => void
	setDropPreview: (v: { rowId: string | null; position: 'before' | 'after' | 'inside' | null }) => void
	setHoverCollection: (v: string | null) => void
	noDndSelector?: string
	ghostClassName: string
	ghostTableClassName: string
}

export function useFirefoxPointerDnd(params: UseFirefoxPointerDndParams): {
	draggingRowId: string | null
	suppressClickRef: React.MutableRefObject<boolean>
	getRowPointerHandlers: (payload: DragEntryPayload) => {
		onPointerDownCapture?: (e: React.PointerEvent) => void
		onPointerUpCapture?: (e: React.PointerEvent) => void
		onPointerCancelCapture?: (e: React.PointerEvent) => void
	}
} {
	const {
		enabled,
		rows,
		applyPreviewFromIntent,
		onDropByIntent,
		clearPreview,
		setDropPreview,
		setHoverCollection,
		noDndSelector = '[data-mm-no-dnd="1"]',
		ghostClassName,
		ghostTableClassName,
	} = params

	const [draggingRowId, setDraggingRowId] = useState<string | null>(null)
	const rowsByIdRef = useRef<Map<string, Row>>(new Map())
	const suppressClickRef = useRef(false)

	const restoreSelectionRef = useRef<{
		prevUserSelect?: string
		prevCursor?: string
		cleanup?: (() => void) | null
	}>({ cleanup: null })

	const ghostRef = useRef<HTMLDivElement | null>(null)

	const pointerDragRef = useRef<{
		payload: DragEntryPayload | null
		startX: number
		startY: number
		offsetX: number
		offsetY: number
		startEl: HTMLElement | null
		pointerId: number | null
		captureEl: HTMLElement | null
		active: boolean
	}>({
		payload: null,
		startX: 0,
		startY: 0,
		offsetX: 0,
		offsetY: 0,
		startEl: null,
		pointerId: null,
		captureEl: null,
		active: false,
	})

	useEffect(() => {
		rowsByIdRef.current = new Map(rows.map((r) => [String(r.id), r]))
	}, [rows])

	const getRowAtPoint = useCallback((clientX: number, clientY: number): { row: Row; el: HTMLElement } | null => {
		const stack = (document.elementsFromPoint?.(clientX, clientY) || []) as HTMLElement[]
		for (const el of stack) {
			const tr = el?.closest?.('tr') as HTMLElement | null
			if (!tr) continue
			const rowId = tr.getAttribute('data-row-id') || tr.dataset?.rowId
			if (!rowId) continue
			const row = rowsByIdRef.current.get(String(rowId))
			if (!row) continue
			return { row, el: tr }
		}
		return null
	}, [])
	const pointerMoveLogicRef = useRef<((ev: MouseEvent | PointerEvent) => void) | null>(null)
	const pointerUpLogicRef = useRef<((ev: MouseEvent | PointerEvent) => void) | null>(null)
	const pointerMoveListener = useCallback((ev: Event) => {
		pointerMoveLogicRef.current?.(ev as unknown as MouseEvent | PointerEvent)
	}, [])
	const pointerUpListener = useCallback((ev: Event) => {
		pointerUpLogicRef.current?.(ev as unknown as MouseEvent | PointerEvent)
	}, [])

	const stopPointerListeners = useCallback(() => {
		const st = pointerDragRef.current
		const captureEl = st.captureEl
		const doc = (captureEl?.ownerDocument || document)
		const win = doc.defaultView || window

		try {
			win.removeEventListener('pointermove', pointerMoveListener, true)
			win.removeEventListener('pointerup', pointerUpListener, true)
			win.removeEventListener('pointercancel', pointerUpListener, true)
		} catch {
			void 0
		}
		try {
			doc.removeEventListener('pointermove', pointerMoveListener, true)
			doc.removeEventListener('pointerup', pointerUpListener, true)
			doc.removeEventListener('pointercancel', pointerUpListener, true)
		} catch {
			void 0
		}
		try {
			captureEl?.removeEventListener('lostpointercapture', pointerUpListener, true)
		} catch {
			void 0
		}
	}, [pointerMoveListener, pointerUpListener])

	const cleanupPointerDrag = useCallback(() => {
		const st = pointerDragRef.current
		const captureEl = st.captureEl
		const pointerId = st.pointerId

		stopPointerListeners()

		try {
			if (captureEl && pointerId != null) {
				captureEl.releasePointerCapture?.(pointerId)
			}
		} catch {
			void 0
		}

		st.payload = null
		st.captureEl = null
		st.pointerId = null
		st.active = false

		try {
			restoreSelectionRef.current.cleanup?.()
		} catch {
			void 0
		} finally {
			restoreSelectionRef.current.cleanup = null
		}

		try {
			ghostRef.current?.remove()
		} catch {
			void 0
		} finally {
			ghostRef.current = null
		}

		setDraggingRowId(null)
		setHoverCollection(null)
		setDropPreview({ rowId: null, position: null })
		setTimeout(() => {
			suppressClickRef.current = false
		}, 0)
	}, [setDropPreview, setHoverCollection, stopPointerListeners])

	const pointerMove = useCallback((ev: MouseEvent | PointerEvent) => {
		const st = pointerDragRef.current
		if (!st.payload) return

		const dx = Math.abs(ev.clientX - st.startX)
		const dy = Math.abs(ev.clientY - st.startY)
		if (!st.active) {
			if (dx < 4 && dy < 4) return
			st.active = true
			suppressClickRef.current = true
			setDraggingRowId(st.payload.id)

			try {
				if (st.captureEl && st.pointerId != null) {
					st.captureEl.setPointerCapture?.(st.pointerId)
				}
			} catch {
				void 0
			}

			try {
				const body = document.body
				restoreSelectionRef.current.prevUserSelect = body.style.userSelect
				restoreSelectionRef.current.prevCursor = body.style.cursor
				body.style.userSelect = 'none'
				body.style.cursor = 'grabbing'

				const onSelectStart = (e: Event) => {
					e.preventDefault()
				}
				window.addEventListener('selectstart', onSelectStart, true)

				restoreSelectionRef.current.cleanup = () => {
					window.removeEventListener('selectstart', onSelectStart, true)
					body.style.userSelect = restoreSelectionRef.current.prevUserSelect ?? ''
					body.style.cursor = restoreSelectionRef.current.prevCursor ?? ''
				}
			} catch {
				void 0
			}
			try {
				if (!ghostRef.current && st.startEl) {
					const tr = st.startEl.closest('tr') as HTMLTableRowElement | null
					const table = tr?.closest('table') as HTMLTableElement | null
					const rect = tr?.getBoundingClientRect()
					if (tr && table && rect) {
						const wrapper = document.createElement('div')
						wrapper.className = ghostClassName
						wrapper.style.width = `${rect.width}px`

						const ghostTable = document.createElement('table')
						ghostTable.className = `${table.className} ${ghostTableClassName}`.trim()
						ghostTable.style.width = `${rect.width}px`

						const tbody = document.createElement('tbody')
						const cloneTr = tr.cloneNode(true) as HTMLTableRowElement
						cloneTr.removeAttribute('draggable')
						tbody.appendChild(cloneTr)
						ghostTable.appendChild(tbody)
						wrapper.appendChild(ghostTable)

						document.body.appendChild(wrapper)
						ghostRef.current = wrapper
					}
				}
			} catch {
				void 0
			}
		}
		if (ghostRef.current && st.active) {
			const x = ev.clientX - st.offsetX
			const y = ev.clientY - st.offsetY
			ghostRef.current.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`
		}

		const hit = getRowAtPoint(ev.clientX, ev.clientY)
		if (!hit) {
			clearPreview()
			return
		}

		const fakeEvt = { currentTarget: hit.el, target: hit.el, clientY: ev.clientY } as unknown as React.DragEvent
		const intent = computeDropIntent(hit.row, fakeEvt)
		applyPreviewFromIntent(hit.row, intent, st.payload)
	}, [applyPreviewFromIntent, clearPreview, getRowAtPoint])

	const pointerUp = useCallback((ev: MouseEvent | PointerEvent) => {
		const st = pointerDragRef.current
		const payload = st.payload
		const wasActive = st.active
		if (!payload || !wasActive) {
			cleanupPointerDrag()
			return
		}

		const hit = getRowAtPoint(ev.clientX, ev.clientY)
		if (hit) {
			const fakeEvt = { currentTarget: hit.el, target: hit.el, clientY: ev.clientY } as unknown as React.DragEvent
			const intent = computeDropIntent(hit.row, fakeEvt)

			if ((payload.type === 'mock') && hit.row.rowType === 'collection' && intent.previewPosition === 'before') {
				clearPreview()
			} else {
				onDropByIntent(intent.containerId, intent.index, payload)
			}
		} else {
			onDropByIntent(null, 9999, payload)
		}
		cleanupPointerDrag()
	}, [cleanupPointerDrag, clearPreview, getRowAtPoint, onDropByIntent])

	useEffect(() => {
		pointerMoveLogicRef.current = pointerMove
	}, [pointerMove])
	useEffect(() => {
		pointerUpLogicRef.current = pointerUp
	}, [pointerUp])

	useEffect(() => cleanupPointerDrag, [cleanupPointerDrag])

	const startRowPointerDrag = useCallback((payload: DragEntryPayload) => (e: React.PointerEvent) => {
		if (!enabled) return
		if (e.button !== 0) return
		try {
			const target = e.target as HTMLElement | null
			if (target?.closest) {
				if (target.closest?.(noDndSelector)) return
				if (target.closest?.('input, textarea, button, select, a, [contenteditable="true"]')) return
			}
		} catch {
			void 0
		}

		cleanupPointerDrag()

		const startEl = e.currentTarget as HTMLElement
		const doc = startEl.ownerDocument || document
		const win = doc.defaultView || window
		const rect = (startEl.closest('tr') as HTMLElement | null)?.getBoundingClientRect()
		const offsetX = rect ? e.clientX - rect.left : 0
		const offsetY = rect ? e.clientY - rect.top : 0
		const pointerId = (e.nativeEvent as PointerEvent).pointerId ?? null

		pointerDragRef.current = {
			payload,
			startX: e.clientX,
			startY: e.clientY,
			offsetX,
			offsetY,
			startEl,
			pointerId,
			captureEl: startEl,
			active: false,
		}
		doc.addEventListener('pointermove', pointerMoveListener, true)
		doc.addEventListener('pointerup', pointerUpListener, true)
		doc.addEventListener('pointercancel', pointerUpListener, true)
		win.addEventListener('pointermove', pointerMoveListener, true)
		win.addEventListener('pointerup', pointerUpListener, true)
		win.addEventListener('pointercancel', pointerUpListener, true)
		startEl.addEventListener('lostpointercapture', pointerUpListener, true)
	}, [cleanupPointerDrag, enabled, noDndSelector, pointerMoveListener, pointerUpListener])

	const onRowPointerUpCapture = useCallback((e: React.PointerEvent) => {
		pointerUpLogicRef.current?.(e.nativeEvent as unknown as PointerEvent)
	}, [])
	const onRowPointerCancelCapture = useCallback((e: React.PointerEvent) => {
		pointerUpLogicRef.current?.(e.nativeEvent as unknown as PointerEvent)
	}, [])

	const getRowPointerHandlers = useCallback((payload: DragEntryPayload) => {
		if (!enabled) return {}
		return {
			onPointerDownCapture: startRowPointerDrag(payload),
			onPointerUpCapture: onRowPointerUpCapture,
			onPointerCancelCapture: onRowPointerCancelCapture,
		}
	}, [enabled, onRowPointerCancelCapture, onRowPointerUpCapture, startRowPointerDrag])

	return {
		draggingRowId,
		suppressClickRef,
		getRowPointerHandlers,
	}
}
