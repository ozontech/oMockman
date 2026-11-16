import React, { useEffect, useRef } from 'react'

/** Keep native details semantics while animating both opening and closing. */
export const McpDetails: React.FC<{ className: string; label: string; children: React.ReactNode }> = ({ className, label, children }) => {
	const ref = useRef<HTMLDetailsElement>(null)
	const animation = useRef<Animation | null>(null)
	const targetOpen = useRef(false)
	useEffect(() => () => { animation.current?.cancel() }, [])
	const toggle = (event: React.MouseEvent<HTMLElement>) => {
		const element = ref.current
		if (!element || typeof element.animate !== 'function') return
		event.preventDefault()
		const opening = !(animation.current ? targetOpen.current : element.open)
		targetOpen.current = opening
		const from = element.getBoundingClientRect().height
		animation.current?.cancel()
		animation.current = null
		element.style.height = ''
		element.style.overflow = ''
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
			element.open = opening
			return
		}
		element.open = opening
		const to = element.getBoundingClientRect().height
		// Content stays visible during closing; the native open state changes at the end.
		element.open = true
		element.style.overflow = 'hidden'
		const current = element.animate([{ height: `${from}px` }, { height: `${to}px` }], {
			duration: 180, easing: 'ease', fill: 'both',
		})
		animation.current = current
		current.onfinish = () => {
			if (animation.current !== current) return
			element.open = opening
			current.cancel()
			animation.current = null
			element.style.overflow = ''
		}
	}
	return <details ref={ref} className={className}>
		<summary onClick={toggle}>{label}</summary>
		{children}
	</details>
}
