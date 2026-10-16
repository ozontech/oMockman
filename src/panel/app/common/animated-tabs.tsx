import React, { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { Tab } from 'semantic-ui-react'
import type { TabProps } from 'semantic-ui-react'

import s from './animated-tabs.module.scss'

type Indicator = { left: number; width: number; top: number }

const sameIndicator = (a: Indicator | null, b: Indicator): boolean =>
	Boolean(a) && a?.left === b.left && a?.width === b.width && a?.top === b.top

/**
 * Tabs whose underline slides to the chosen tab and whose content comes in from the side it was
 * picked on. Each pane needs its own `key`, or React keeps the old pane and nothing animates.
 * Tabs can nest: each animates only its own menu and panes.
 */
export const AnimatedTabs: React.FC<{
	panes: TabProps['panes']
	/** Controlled: a tab can also open from outside, e.g. when its switch goes on. */
	activeIndex: number
	onActiveIndexChange: (index: number) => void
	isDark: boolean
	menuSize?: 'small'
	/** Shown at the right end of the tab row. */
	aside?: React.ReactNode
}> = ({ panes, activeIndex: active, onActiveIndexChange, isDark, menuSize, aside }) => {
	const previous = useRef(active)
	const backRef = useRef(false)
	if (active !== previous.current) {
		backRef.current = active < previous.current
		previous.current = active
	}
	const back = backRef.current
	const [indicator, setIndicator] = useState<Indicator | null>(null)
	const wrapRef = useRef<HTMLDivElement>(null)

	const measure = useCallback(() => {
		const wrap = wrapRef.current
		const menu = wrap?.querySelector(':scope > div > .ui.menu')
		const item = menu?.querySelector(':scope > .item.active')
		if (!wrap || !menu || !item) return
		const wrapRect = wrap.getBoundingClientRect()
		const itemRect = item.getBoundingClientRect()
		const menuRect = menu.getBoundingClientRect()
		const next = { left: itemRect.left - wrapRect.left, width: itemRect.width, top: menuRect.bottom - wrapRect.top - 2 }
		setIndicator((prev) => (sameIndicator(prev, next) ? prev : next))
	}, [])

	useLayoutEffect(measure)

	useLayoutEffect(() => {
		const wrap = wrapRef.current
		if (!wrap || typeof ResizeObserver === 'undefined') return undefined
		const observer = new ResizeObserver(() => measure())
		observer.observe(wrap)
		return () => observer.disconnect()
	}, [measure])

	return (
		<div ref={wrapRef} className={`${s.tabs} ${back ? s.back : ''} ${isDark ? s.dark : ''}`}>
			<Tab
				activeIndex={active}
				onTabChange={(_, data) => onActiveIndexChange(Number(data.activeIndex))}
				menu={{ secondary: true, pointing: true, inverted: isDark, size: menuSize }}
				panes={panes}
			/>
			{aside ? <div className={s.aside}>{aside}</div> : null}
			{indicator ? (
				<span
					className={s.indicator}
					style={{ width: indicator.width, top: indicator.top, transform: `translateX(${indicator.left}px)` }}
					aria-hidden
				/>
			) : null}
		</div>
	)
}
