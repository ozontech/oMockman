import { useEffect } from 'react'
import type { RefObject } from 'react'

import { safeParseFloat } from '@/services/number'

const LINT_TOOLTIP_HIDE_DELAY_MS = 1500
const MARKER_SELECTOR = '.cm-lint-marker'
const TOOLTIP_SELECTOR = '.cm-tooltip-lint'
const POSITION_MARGIN = 10
const VIEWPORT_MARGIN = 8
const INTERACTION_GRACE_MS = 2000
const SHOW_FALLBACK_MS = 300

export function useLintTooltipLifecycle(editorRef: RefObject<HTMLDivElement | null>): void {
	useEffect(() => {
		const host = editorRef.current
		if (!host) return

		const win: Window = host.ownerDocument.defaultView || window

		let closeTimer: number | null = null
		let isSyntheticClose = false
		let tooltipOpen = false
		let markerRect: DOMRect | null = null
		let lastTooltipInteraction = 0

		let needsRearm = false
		let rearmMarker: HTMLElement | null = null

		let tooltipStyleMo: MutationObserver | null = null
		let observedOuter: HTMLElement | null = null
		let isGuarding = false
		let lastGoodCssTop: number | null = null
		let lastGoodCssLeft: number | null = null
		let awaitingFirstPosition = false
		let showFallbackTimer: number | null = null

		const isOnTooltip = (el: EventTarget | null): boolean =>
			el instanceof Element && Boolean(el.closest(TOOLTIP_SELECTOR))

		const isOnTooltipByCoords = (x: number, y: number): boolean => {
			const tooltipEl = host.querySelector(TOOLTIP_SELECTOR) as HTMLElement | null
			if (!tooltipEl) return false
			const r = tooltipEl.getBoundingClientRect()
			return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
		}

		const isNearMarker = (x: number, y: number): boolean => {
			if (!markerRect) return false
			return x > markerRect.left - POSITION_MARGIN &&
				x < markerRect.right + POSITION_MARGIN &&
				y > markerRect.top - POSITION_MARGIN &&
				y < markerRect.bottom + POSITION_MARGIN
		}

		const clearClose = (): void => {
			if (closeTimer != null) { clearTimeout(closeTimer); closeTimer = null }
		}

		const inGracePeriod = (): boolean =>
			Date.now() - lastTooltipInteraction < INTERACTION_GRACE_MS

		const resetPositionState = (): void => {
			markerRect = null
			lastGoodCssTop = null
			lastGoodCssLeft = null
			awaitingFirstPosition = false
			if (showFallbackTimer != null) { clearTimeout(showFallbackTimer); showFallbackTimer = null }
		}

		const forceClose = (): void => {
			if (inGracePeriod()) {
				clearClose()
				return
			}
			clearClose()
			tooltipOpen = false
			resetPositionState()
			needsRearm = true
			rearmMarker = null
			isSyntheticClose = true
			win.dispatchEvent(new MouseEvent('mousemove', {
				clientX: -9999, clientY: -9999, bubbles: true,
			}))
			if (win !== window) {
				window.dispatchEvent(new MouseEvent('mousemove', {
					clientX: -9999, clientY: -9999, bubbles: true,
				}))
			}
			isSyntheticClose = false
		}

		const scheduleClose = (): void => {
			if (inGracePeriod()) return
			clearClose()
			closeTimer = window.setTimeout(forceClose, LINT_TOOLTIP_HIDE_DELAY_MS)
		}

		const guardTooltipPosition = (outer: HTMLElement): void => {
			if (isGuarding) return
			isGuarding = true

			const cssTop = safeParseFloat(outer.style.top) ?? 0
			const cssLeft = safeParseFloat(outer.style.left) ?? 0

			if (cssTop <= -9999) {
				if (outer.style.transform) outer.style.transform = ''
				if (tooltipStyleMo) {
					tooltipStyleMo.observe(outer, { attributes: true, attributeFilter: ['style'] })
				}
				isGuarding = false
				return
			}

			if (awaitingFirstPosition) {
				const looksStale = markerRect
					? (Math.abs(cssTop - markerRect.bottom) > 50 && cssTop < 5)
					: (cssTop < 5 && Math.abs(cssLeft) < 5)
				if (looksStale) {
					if (tooltipStyleMo) {
						tooltipStyleMo.observe(outer, { attributes: true, attributeFilter: ['style'] })
					}
					isGuarding = false
					return
				}
				awaitingFirstPosition = false
				outer.style.visibility = ''
				if (showFallbackTimer != null) { clearTimeout(showFallbackTimer); showFallbackTimer = null }
			}

			if (lastGoodCssTop !== null && lastGoodCssTop > 10
				&& cssTop < 3 && Math.abs(cssLeft) < 3) {
				if (tooltipStyleMo) tooltipStyleMo.disconnect()
				outer.style.top = lastGoodCssTop + 'px'
				if (lastGoodCssLeft !== null) outer.style.left = lastGoodCssLeft + 'px'
				if (tooltipStyleMo) {
					tooltipStyleMo.observe(outer, { attributes: true, attributeFilter: ['style'] })
				}
				isGuarding = false
				return
			}

			if (cssTop > 10) {
				lastGoodCssTop = cssTop
				lastGoodCssLeft = cssLeft
			}

			if (tooltipStyleMo) tooltipStyleMo.disconnect()

			const height = outer.offsetHeight || 0
			let shiftY = 0
			if (cssTop < VIEWPORT_MARGIN) {
				shiftY = VIEWPORT_MARGIN - cssTop
			} else if (cssTop + height > win.innerHeight - VIEWPORT_MARGIN) {
				shiftY = (win.innerHeight - VIEWPORT_MARGIN) - (cssTop + height)
			}

			if (Math.abs(shiftY) > 1) {
				outer.style.transform = `translateY(${shiftY}px)`
			} else if (outer.style.transform) {
				outer.style.transform = ''
			}

			if (tooltipStyleMo) {
				tooltipStyleMo.observe(outer, { attributes: true, attributeFilter: ['style'] })
			}

			isGuarding = false
		}

		const getTooltipOuter = (tooltipEl: HTMLElement): HTMLElement =>
			(tooltipEl.closest('.cm-tooltip') as HTMLElement | null) || tooltipEl

		const bindTooltipObservers = (outer: HTMLElement): void => {
			if (observedOuter === outer) return
			if (tooltipStyleMo) { tooltipStyleMo.disconnect(); tooltipStyleMo = null }
			observedOuter = outer

			tooltipStyleMo = new MutationObserver(() => guardTooltipPosition(outer))
			tooltipStyleMo.observe(outer, { attributes: true, attributeFilter: ['style'] })
		}

		const unbindTooltipObservers = (): void => {
			if (tooltipStyleMo) { tooltipStyleMo.disconnect(); tooltipStyleMo = null }
			observedOuter = null
		}

		const mo = new MutationObserver(() => {
			const wasOpen = tooltipOpen
			const tooltipEl = host.querySelector(TOOLTIP_SELECTOR) as HTMLElement | null

			if (tooltipEl) {
				const outer = getTooltipOuter(tooltipEl)
				guardTooltipPosition(outer)
				bindTooltipObservers(outer)
			} else {
				unbindTooltipObservers()
			}

			const isOpen = Boolean(tooltipEl)
			tooltipOpen = isOpen

			if (wasOpen && !isOpen) {
				resetPositionState()
				clearClose()
			}

			if (!wasOpen && tooltipEl) {
				const outer = getTooltipOuter(tooltipEl)
				outer.style.visibility = 'hidden'
				awaitingFirstPosition = true
				if (showFallbackTimer != null) clearTimeout(showFallbackTimer)
				showFallbackTimer = window.setTimeout(() => {
					showFallbackTimer = null
					if (awaitingFirstPosition) {
						awaitingFirstPosition = false
						const el = host.querySelector(TOOLTIP_SELECTOR) as HTMLElement | null
						if (el) getTooltipOuter(el).style.visibility = ''
					}
				}, SHOW_FALLBACK_MS)
				needsRearm = false
				rearmMarker = null
			}
		})
		mo.observe(host, { childList: true, subtree: true })

		const onHostMouseOverCapture = (event: MouseEvent): void => {
			if (!(event.target instanceof Element)) return
			const marker = event.target.closest(MARKER_SELECTOR) as HTMLElement | null
			if (!marker) return

			if (tooltipOpen) {
				event.stopPropagation()
				event.preventDefault()
				return
			}

			if (rearmMarker === marker) {
				event.stopPropagation()
				event.preventDefault()
				rearmMarker = null
				markerRect = marker.getBoundingClientRect()
				return
			}

			needsRearm = false
			rearmMarker = null
			markerRect = marker.getBoundingClientRect()
		}

		const onWindowMouseMoveCapture = (event: MouseEvent): void => {
			if (isSyntheticClose) return

			if (!tooltipOpen) {
				if (needsRearm && event.target instanceof Element) {
					const marker = (event.target as Element).closest(MARKER_SELECTOR) as HTMLElement | null
					if (marker && host.contains(marker) && marker !== rearmMarker) {
						rearmMarker = marker
						needsRearm = false
						const mouseOverEvent = new MouseEvent('mouseover', {
							bubbles: true,
							cancelable: true,
							view: win,
							clientX: event.clientX,
							clientY: event.clientY,
							screenX: event.screenX,
							screenY: event.screenY,
						})
						marker.dispatchEvent(mouseOverEvent)
					}
				}
				return
			}

			event.stopImmediatePropagation()

			const inGrace = Date.now() - lastTooltipInteraction < INTERACTION_GRACE_MS
			const nearMarker = isNearMarker(event.clientX, event.clientY)
			const onTooltip = isOnTooltip(event.target)
				|| (inGrace && isOnTooltipByCoords(event.clientX, event.clientY))

			if (nearMarker || onTooltip || inGrace) {
				clearClose()
			} else if (closeTimer == null) {
				scheduleClose()
			}
		}

		const onWindowMouseDown = (event: MouseEvent): void => {
			if (!tooltipOpen) return
			if (event.target instanceof Element && event.target.closest(`${TOOLTIP_SELECTOR}, ${MARKER_SELECTOR}`)) {
				if (event.target.closest(TOOLTIP_SELECTOR)) {
					lastTooltipInteraction = Date.now()
					clearClose()
				}
				return
			}
			forceClose()
		}

		const onWindowClick = (event: MouseEvent): void => {
			if (!tooltipOpen) return
			if (event.target instanceof Element && event.target.closest(TOOLTIP_SELECTOR)) {
				lastTooltipInteraction = Date.now()
				clearClose()
			}
		}

		host.addEventListener('mouseover', onHostMouseOverCapture, true)
		win.addEventListener('mousemove', onWindowMouseMoveCapture, true)
		win.addEventListener('mousedown', onWindowMouseDown, true)
		win.addEventListener('click', onWindowClick, true)

		return () => {
			clearClose()
			if (showFallbackTimer != null) clearTimeout(showFallbackTimer)
			mo.disconnect()
			unbindTooltipObservers()
			host.removeEventListener('mouseover', onHostMouseOverCapture, true)
			win.removeEventListener('mousemove', onWindowMouseMoveCapture, true)
			win.removeEventListener('mousedown', onWindowMouseDown, true)
			win.removeEventListener('click', onWindowClick, true)
		}
	}, [])
}
