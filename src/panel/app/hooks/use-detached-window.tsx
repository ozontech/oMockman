import type React from 'react'
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'

interface Options {
	title: string
	width?: number
	height?: number
	onToggle?: (detached: boolean) => void
}

export function useDetachedWindow(options: Options): {
	isDetached: boolean
	attach: () => void
	detach: () => void
	render: (content: React.ReactNode) => React.ReactNode
} {
	const { title, width = 1000, height = 800, onToggle } = options
	const [isDetached, setIsDetached] = useState(false)
	const [container, setContainer] = useState<HTMLElement | null>(null)
	const winRef = useRef<Window | null>(null)

	useEffect(() => {
		onToggle?.(isDetached)
	}, [isDetached, onToggle])

	useEffect(() => {
		if (!isDetached) {
			if (winRef.current && !winRef.current.closed) {
				winRef.current.close()
			}
			winRef.current = null
			setContainer(null)
			return
		}
		const screenLeft = window.screenLeft ?? window.screenX ?? 0
		const screenTop = window.screenTop ?? window.screenY ?? 0
		const screenWidth = window.screen.availWidth
		const screenHeight = window.screen.availHeight
		const left = Math.max(0, screenLeft + (screenWidth - width) / 2)
		const top = Math.max(0, screenTop + (screenHeight - height) / 2)

		const w = window.open('about:blank', '_blank', `width=${width},height=${height},left=${left},top=${top}`)
		if (!w) {
			setIsDetached(false)
			return
		}

		winRef.current = w
		const setup = () => {
			try {
				const doc = w.document
				doc.open()
				doc.write(`<!DOCTYPE html><html><head><title>${title}</title><style>html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;}</style></head><body><div id="mockman-root" style="width:100%;height:100%;overflow:auto;"></div></body></html>`)
				doc.close()

				const mount = doc.getElementById('mockman-root')
				if (!mount) {
					setIsDetached(false)
					w.close()
					return
				}

				const DETACHED_STYLE_ATTR = 'data-mm-detached-style-clone'
				const syncStyles = () => {
					doc.head.querySelectorAll(`[${DETACHED_STYLE_ATTR}="1"]`).forEach((node) => node.remove())
					document
						.querySelectorAll<HTMLLinkElement | HTMLStyleElement>('link[rel="stylesheet"], style')
						.forEach((el) => {
							const clone = el.cloneNode(true) as HTMLElement
							clone.setAttribute(DETACHED_STYLE_ATTR, '1')
							doc.head.appendChild(clone)
						})
				}

				syncStyles()
				const syncTheme = () => {
					doc.documentElement.className = document.documentElement.className
					doc.body.className = document.body.className
				}
				syncTheme()

				const themeObserver = new MutationObserver(syncTheme)
				themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
				themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] })

				const styleObserver = new MutationObserver(syncStyles)
				if (document.head) {
					styleObserver.observe(document.head, {
						childList: true,
						subtree: true,
						characterData: true,
					})
				}
				const handleUnload = () => {
					themeObserver.disconnect()
					styleObserver.disconnect()
					setIsDetached(false)
				}
				w.addEventListener('beforeunload', handleUnload)

				setContainer(mount)
			} catch (err) {
				void err
				setIsDetached(false)
				w.close()
			}
		}
		const timerId = setTimeout(setup, 50)

		return () => {
			clearTimeout(timerId)
			if (winRef.current && !winRef.current.closed) {
				winRef.current.close()
			}
		}
	}, [height, isDetached, title, width])

	const attach = useCallback(() => setIsDetached(false), [])
	const detach = useCallback(() => setIsDetached(true), [])

	const render = useMemo(
		() => (content: React.ReactNode) => {
			if (isDetached) {
				return container ? createPortal(content, container) : null
			}
			return content
		},
		[container, isDetached],
	)

	return {
		isDetached,
		attach,
		detach,
		render,
	}
}
