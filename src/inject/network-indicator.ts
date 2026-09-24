import { safeNumberInt } from '@/services/number'

interface MockedRequest {
	url: string
	method: string
}

const CONTAINER_STYLE: Partial<CSSStyleDeclaration> = {
	position: 'fixed',
	bottom: '16px',
	left: '0px',
	zIndex: '2147483647',
	fontFamily: '-apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, \'Helvetica Neue\', Arial, sans-serif',
	fontSize: '13px',
	pointerEvents: 'auto',
	display: 'flex',
	flexDirection: 'row',
	alignItems: 'center',
	gap: '8px',
	cursor: 'grab',
	touchAction: 'none',
}

const BADGE_BASE_STYLE: Partial<CSSStyleDeclaration> = {
	alignItems: 'center',
	flexWrap: 'nowrap',
	gap: '6px',
	padding: '8px 12px',
	color: '#fff',
	borderRadius: '8px',
	cursor: 'grab',
	userSelect: 'none',
}

const MOCKED_BADGE_STYLE: Partial<CSSStyleDeclaration> = {
	background: 'linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%)',
	boxShadow: '0 4px 12px rgba(37, 99, 235, 0.4)',
}

const TEXT_STYLE: Partial<CSSStyleDeclaration> = {
	fontWeight: '600',
	lineHeight: '1',
	whiteSpace: 'nowrap',
}

class NetworkIndicator {
	private container: HTMLElement | null = null
	private mockedBadge: HTMLElement | null = null
	private mockedRequests: MockedRequest[] = []
	private mockedKeys = new Set<string>()
	private lastLocationKey = ''
	private dragging = false
	private prevCursor = ''

	private readonly CONTAINER_ID = '__mockman_indicator__'
	private readonly MAX_REQUESTS = 100
	private readonly NAV_EVENT = 'mockman:url-changed'
	private readonly STORAGE_KEY = '__mockman_indicator_left__'
	private readonly EDGE_MARGIN = 16

	constructor() {
		if (typeof window === 'undefined') return
		this.lastLocationKey = this.getLocationKey()
		this.installNavigationListeners()
		// Bring the indicator back on screen when the window is resized.
		window.addEventListener('resize', () => this.applyPosition())
	}

	addMockedRequest(url: string, method: string): void {
		const normalizedMethod = method.toUpperCase()
		const key = `${normalizedMethod}:${url}`
		if (this.mockedKeys.has(key)) return

		this.mockedRequests.push({
			url,
			method: normalizedMethod,
		})
		this.mockedKeys.add(key)

		while (this.mockedRequests.length > this.MAX_REQUESTS) {
			const first = this.mockedRequests.shift()
			if (!first) break
			this.mockedKeys.delete(`${first.method}:${first.url}`)
		}

		this.render()
	}

	getMockedRequests(): MockedRequest[] {
		return [...this.mockedRequests]
	}

	clear(): void {
		this.mockedRequests = []
		this.mockedKeys.clear()
		this.destroy()
	}

	destroy(): void {
		if (this.container) {
			this.container.remove()
			this.container = null
			this.mockedBadge = null
		}
	}

	private createMockedIcon(): SVGSVGElement {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
		svg.setAttribute('width', '16')
		svg.setAttribute('height', '16')
		svg.setAttribute('viewBox', '0 0 24 24')
		svg.setAttribute('fill', 'none')
		svg.setAttribute('stroke', 'currentColor')
		svg.setAttribute('stroke-width', '2')
		svg.setAttribute('stroke-linecap', 'round')
		svg.setAttribute('stroke-linejoin', 'round')
		const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
		path.setAttribute(
			'd',
			'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z',
		)
		svg.appendChild(path)
		return svg
	}

	private createContainer(): HTMLElement {
		const existing = document.getElementById(this.CONTAINER_ID)
		if (existing) {
			existing.remove()
		}

		const container = document.createElement('div')
		container.id = this.CONTAINER_ID
		Object.assign(container.style, CONTAINER_STYLE)

		this.mockedBadge = document.createElement('div')
		Object.assign(this.mockedBadge.style, BADGE_BASE_STYLE, MOCKED_BADGE_STYLE)

		container.appendChild(this.mockedBadge)
		;(document.body ?? document.documentElement).appendChild(container)

		this.installDrag(container)

		return container
	}

	private render(): void {
		if (this.mockedRequests.length === 0) {
			this.destroy()
			return
		}

		if (!this.container) {
			this.container = this.createContainer()
		}
		if (this.mockedBadge) {
			const count = this.mockedRequests.length
			this.mockedBadge.style.display = count > 0 ? 'flex' : 'none'
			this.mockedBadge.textContent = ''
			this.mockedBadge.appendChild(this.createMockedIcon())
			const text = document.createElement('span')
			Object.assign(text.style, TEXT_STYLE)
			text.textContent = `${count} mocked API`
			this.mockedBadge.appendChild(text)
		}

		this.applyPosition()
	}

	private loadStoredLeft(): number | null {
		try {
			const raw = window.localStorage.getItem(this.STORAGE_KEY)
			if (raw == null) return null
			return safeNumberInt(raw) ?? null
		} catch {
			return null
		}
	}

	private storeLeft(left: number): void {
		try {
			window.localStorage.setItem(this.STORAGE_KEY, String(Math.round(left)))
		} catch {
			void 0
		}
	}

	// Horizontal movement only: bottom is fixed, left changes and is kept
	// on screen. With no saved position it sits in the bottom right corner.
	private applyPosition(): void {
		const container = this.container
		if (!container || this.dragging) return
		const width = container.getBoundingClientRect().width
		const maxLeft = Math.max(this.EDGE_MARGIN, window.innerWidth - width - this.EDGE_MARGIN)
		const stored = this.loadStoredLeft()
		const left = stored == null
			? maxLeft
			: Math.min(Math.max(stored, this.EDGE_MARGIN), maxLeft)
		container.style.left = `${Math.round(left)}px`
	}

	private installDrag(container: HTMLElement): void {
		let startX = 0
		let startLeft = 0

		const onMove = (e: PointerEvent) => {
			if (!this.dragging) return
			const width = container.getBoundingClientRect().width
			const maxLeft = Math.max(this.EDGE_MARGIN, window.innerWidth - width - this.EDGE_MARGIN)
			const next = Math.min(Math.max(startLeft + (e.clientX - startX), this.EDGE_MARGIN), maxLeft)
			container.style.left = `${Math.round(next)}px`
		}

		const onEnd = (e: PointerEvent) => {
			if (!this.dragging) return
			this.dragging = false
			container.style.cursor = 'grab'
			try {
				document.documentElement.style.cursor = this.prevCursor
			} catch {
				void 0
			}
			try {
				container.releasePointerCapture(e.pointerId)
			} catch {
				void 0
			}
			this.storeLeft(container.getBoundingClientRect().left)
		}

		container.addEventListener('pointerdown', (e: PointerEvent) => {
			if (e.button !== 0) return
			this.dragging = true
			startX = e.clientX
			startLeft = container.getBoundingClientRect().left
			container.style.cursor = 'grabbing'
			this.prevCursor = document.documentElement.style.cursor
			try {
				document.documentElement.style.cursor = 'grabbing'
			} catch {
				void 0
			}
			try {
				container.setPointerCapture(e.pointerId)
			} catch {
				void 0
			}
			e.preventDefault()
		})
		container.addEventListener('pointermove', onMove)
		container.addEventListener('pointerup', onEnd)
		container.addEventListener('pointercancel', onEnd)
	}

	private getLocationKey(): string {
		if (typeof window === 'undefined') return ''
		return `${window.location.origin}${window.location.pathname}${window.location.search}${window.location.hash}`
	}

	private resetIfLocationChanged(): void {
		const key = this.getLocationKey()
		if (key === this.lastLocationKey) return
		this.lastLocationKey = key
		this.mockedRequests = []
		this.mockedKeys.clear()
		this.render()
	}

	private installNavigationListeners(): void {
		type HistoryMethod = (...args: unknown[]) => unknown
		const navEvent = this.NAV_EVENT

		const wrapHistory = (type: 'pushState' | 'replaceState') => {
			const current = history[type] as unknown as HistoryMethod & { __mockmanWrapped?: boolean }
			if (current.__mockmanWrapped) return

			const orig = history[type] as unknown as HistoryMethod
			const wrapped: HistoryMethod & { __mockmanWrapped?: boolean } = function (this: History, ...args: unknown[]) {
				const ret = orig.apply(this, args)
				window.dispatchEvent(new Event(navEvent))
				return ret
			}
			wrapped.__mockmanWrapped = true
			history[type] = wrapped as unknown as History['pushState']
		}
		wrapHistory('pushState')
		wrapHistory('replaceState')

		window.addEventListener('popstate', () => this.resetIfLocationChanged())
		window.addEventListener('hashchange', () => this.resetIfLocationChanged())
		window.addEventListener(this.NAV_EVENT, () => this.resetIfLocationChanged())
	}
}

// Not on window: page scripts could read it.
export const networkIndicator = new NetworkIndicator()
