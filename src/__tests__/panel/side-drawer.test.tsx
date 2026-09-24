import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SideDrawer } from '@/panel/app/blocks/side-drawer'

const STORAGE_KEY = 'mockman.test.drawerWidth'

const renderDrawer = (props: Partial<React.ComponentProps<typeof SideDrawer>> = {}) => render(
	<SideDrawer storageKey={STORAGE_KEY} {...props}>
		<div data-testid="drawer-content">content</div>
	</SideDrawer>,
)

/** The resize handle is the only unlabelled element in the drawer. */
const handle = (container: HTMLElement): HTMLElement =>
	container.querySelector('[class*="resizeHandle"]') as HTMLElement

describe('SideDrawer', () => {
	beforeEach(() => {
		window.localStorage.clear()
	})

	it('renders its children', () => {
		renderDrawer()
		expect(screen.getByTestId('drawer-content')).toBeInTheDocument()
	})

	it('starts at the persisted width, clamped to the allowed range', () => {
		window.localStorage.setItem(STORAGE_KEY, '4000')
		const { container } = renderDrawer({ minWidth: 300, maxWidth: 900 })

		const root = container.firstElementChild as HTMLElement
		expect(root.style.width).toBe('900px')
	})

	it('falls back to the initial width when nothing is stored', () => {
		const { container } = renderDrawer({ initialWidth: 640 })
		expect((container.firstElementChild as HTMLElement).style.width).toBe('640px')
	})

	it('ignores a malformed persisted width', () => {
		window.localStorage.setItem(STORAGE_KEY, 'wide please')
		const { container } = renderDrawer({ initialWidth: 640 })
		expect((container.firstElementChild as HTMLElement).style.width).toBe('640px')
	})

	it('resizes on drag and persists the result', () => {
		const { container } = renderDrawer({ initialWidth: 600, minWidth: 400, maxWidth: 1000 })

		fireEvent.mouseDown(handle(container), { clientX: 800 })
		fireEvent.mouseMove(document, { clientX: 700 })

		expect((container.firstElementChild as HTMLElement).style.width).toBe('700px')

		fireEvent.mouseUp(document)
		expect(window.localStorage.getItem(STORAGE_KEY)).toBe('700')
	})

	it('clamps a drag to the maximum width', () => {
		const { container } = renderDrawer({ initialWidth: 600, minWidth: 400, maxWidth: 650 })

		fireEvent.mouseDown(handle(container), { clientX: 800 })
		fireEvent.mouseMove(document, { clientX: 0 })

		expect((container.firstElementChild as HTMLElement).style.width).toBe('650px')
	})

	it('clamps a drag to the minimum width', () => {
		const { container } = renderDrawer({ initialWidth: 600, minWidth: 500, maxWidth: 900 })

		fireEvent.mouseDown(handle(container), { clientX: 100 })
		fireEvent.mouseMove(document, { clientX: 900 })

		expect((container.firstElementChild as HTMLElement).style.width).toBe('500px')
	})

	it('calls onClickOutside for a click elsewhere in the document', () => {
		const onClickOutside = vi.fn()
		renderDrawer({ onClickOutside })

		const outside = document.createElement('button')
		document.body.appendChild(outside)
		fireEvent.mouseDown(outside)

		expect(onClickOutside).toHaveBeenCalledTimes(1)
		outside.remove()
	})

	it('ignores clicks inside the drawer', () => {
		const onClickOutside = vi.fn()
		renderDrawer({ onClickOutside })

		fireEvent.mouseDown(screen.getByTestId('drawer-content'))

		expect(onClickOutside).not.toHaveBeenCalled()
	})

	it('ignores clicks in portals such as modals and toasts', () => {
		const onClickOutside = vi.fn()
		renderDrawer({ onClickOutside })

		const portal = document.createElement('div')
		portal.className = 'ui modal'
		const inner = document.createElement('button')
		portal.appendChild(inner)
		document.body.appendChild(portal)

		fireEvent.mouseDown(inner)

		expect(onClickOutside).not.toHaveBeenCalled()
		portal.remove()
	})

	it('does not watch for outside clicks when detached', () => {
		const onClickOutside = vi.fn()
		renderDrawer({ onClickOutside, detached: true })

		const outside = document.createElement('button')
		document.body.appendChild(outside)
		fireEvent.mouseDown(outside)

		expect(onClickOutside).not.toHaveBeenCalled()
		outside.remove()
	})

	it('renders a plain container when detached', () => {
		const { container } = renderDrawer({ detached: true })

		expect(screen.getByTestId('drawer-content')).toBeInTheDocument()
		expect(handle(container)).toBeNull()
	})
})
