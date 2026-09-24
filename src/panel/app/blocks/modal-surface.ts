import type { CSSProperties } from 'react'

const SURFACE: CSSProperties = { background: 'var(--bg)', color: 'var(--text)' }

export const modalSurface = (isDark: boolean): CSSProperties | undefined =>
	isDark ? SURFACE : undefined

export const modalHeaderSurface = (isDark: boolean): CSSProperties | undefined =>
	isDark ? { ...SURFACE, borderBottom: '1px solid var(--border)' } : undefined

export const modalActionsSurface = (isDark: boolean): CSSProperties | undefined =>
	isDark ? { background: 'var(--bg)', borderTop: '1px solid var(--border)' } : undefined
