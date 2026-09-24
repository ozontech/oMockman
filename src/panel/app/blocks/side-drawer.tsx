import type { ReactNode } from 'react'
import React, { useState, useRef, useEffect } from 'react'
import { Segment } from 'semantic-ui-react'

import { useGlobalStore } from '../store'

import s from './side-drawer.module.scss'

import { safeNumberInt } from '@/services/number'

interface SideDrawerProps {
	minWidth?: number
	maxWidth?: number
	initialWidth?: number
	storageKey?: string
	children: ReactNode
	detached?: boolean
	className?: string
	onClickOutside?: () => void
}

const PORTAL_SELECTOR = '.ui.modal, .ui.popup, .Toastify, .cm-tooltip'

export const SideDrawer: React.FC<SideDrawerProps> = ({
	minWidth = 550,
	maxWidth = 1600,
	initialWidth = 700,
	storageKey,
	children,
	detached = false,
	className,
	onClickOutside,
}) => {

	const clamp = (value: number): number => {
		if (value < minWidth) return minWidth
		if (value > maxWidth) return maxWidth
		return value
	}

	const initialPersistedWidth = (() => {
		if (storageKey) {
			try {
				const raw = localStorage.getItem(storageKey)
				if (raw) {
					const parsed = safeNumberInt(String(raw))
					if (parsed != null) {
						return clamp(parsed)
					}
				}
			} catch (err) {
				void err
			}
		}
		return initialWidth
	})()

	const [width, setWidth] = useState(initialPersistedWidth)
	const widthRef = useRef<number>(initialPersistedWidth)
	const startX = useRef<number | null>(null)
	const startWidth = useRef<number>(initialPersistedWidth)
	const rootRef = useRef<HTMLDivElement | null>(null)

	const onMouseMove = (e: MouseEvent) => {
		if (startX.current !== null) {
			const delta = startX.current - e.clientX
			let newWidth = startWidth.current + delta
			newWidth = clamp(newWidth)
			setWidth(newWidth)
		}
	}

	const stopResize = () => {
		startX.current = null
		document.removeEventListener('mousemove', onMouseMove)
		document.removeEventListener('mouseup', stopResize)
		if (storageKey) {
			try {
				localStorage.setItem(storageKey, String(widthRef.current))
			} catch (err) {
				void err
			}
		}
	}

	const handleMouseDown = (e: React.MouseEvent) => {
		startX.current = e.clientX
		startWidth.current = width
		document.addEventListener('mousemove', onMouseMove)
		document.addEventListener('mouseup', stopResize)
		e.preventDefault()
	}

	useEffect(() => () => stopResize(), [])

	useEffect(() => {
		widthRef.current = clamp(width)
	}, [width])

	useEffect(() => {
		if (detached || !onClickOutside) return
		const handler = (e: MouseEvent) => {
			const host = rootRef.current
			const target = e.target as Node | null
			if (!host || !target || host.contains(target)) return
			if (target instanceof Element && target.closest('.mm-side-drawer')) return
			if (target instanceof Node && !target.isConnected) return
			if (target instanceof Element && target.closest(PORTAL_SELECTOR)) return
			if (target === document.body || target === document.documentElement) return
			onClickOutside()
		}
		document.addEventListener('mousedown', handler)
		return () => document.removeEventListener('mousedown', handler)
	}, [detached, onClickOutside])

	useEffect(() => {
		const host = rootRef.current
		if (!host) return
		if (!host.id) host.id = `mm-sd-${Math.random().toString(36).slice(2)}`
		const STYLE_ID = 'mm-sd-scrollbar-style'
		let styleEl = host.querySelector(`#${STYLE_ID}`) as HTMLStyleElement | null
		if (!styleEl) {
			styleEl = document.createElement('style')
			styleEl.id = STYLE_ID
			host.prepend(styleEl)
		}
		styleEl.textContent = `
body.dark #${host.id} {
  scrollbar-color: #565656 #2a2a2a;
  scrollbar-width: thin;
}
body.dark #${host.id} *::-webkit-scrollbar { width: 10px; height: 10px; }
body.dark #${host.id} *::-webkit-scrollbar-track { background: #2a2a2a; }
body.dark #${host.id} *::-webkit-scrollbar-thumb { background: #565656; border-radius: 8px; border: 2px solid #2a2a2a; }
		`
	}, [])

	if (detached) {
		return (
			<div
				ref={rootRef}
				className={`mm-side-drawer ${s.root} ${s.detached} ${className ?? ''}`.trim()}
				style={{
					position: 'relative',
					width: '100%',
					height: '100%',
					maxWidth: 'none',
					boxShadow: 'none',
				}}
			>
				<div className={s.content}>{children}</div>
			</div>
		)
	}

	return (
		<div
			ref={rootRef}
			className={`mm-side-drawer ${s.root} ${className ?? ''}`.trim()}
			style={{
				width,
				maxWidth,
			}}
		>
			<div onMouseDown={handleMouseDown} className={s.resizeHandle} />
			<div className={s.content}>{children}</div>
		</div>
	)
}

export const SideDrawerHeader: React.FC<{
	children: ReactNode
	style?: React.CSSProperties
	className?: string
}> = ({ children, style, className }) => {
	const isDark = useGlobalStore((s) => s.resolvedScheme === 'dark')

	return (
		<Segment
			data-mm-sticky-header="1"
			basic
			inverted={isDark}
			className={className}
			style={{
				margin: 0,
				padding: '12px 0',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'space-between',
				borderBottom: isDark ? '1px solid #444' : '1px solid #e8e8e8',
				position: 'sticky',
				top: 0,
				zIndex: 10,
				marginBottom: 16,
				backgroundColor: isDark ? '#222222' : '#ffffff',
				...style,
			}}
		>
			{children}
		</Segment>
	)
}
