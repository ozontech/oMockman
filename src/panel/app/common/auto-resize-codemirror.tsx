import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import type { Transaction } from '@uiw/react-codemirror'
import { json } from '@codemirror/lang-json'
import { lintGutter, linter } from '@codemirror/lint'
import type { Diagnostic } from '@codemirror/lint'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorView } from '@codemirror/view'

import { applyQuickFixToJson, findRangeByPath } from './cm-json-path'
import { setFindDecos, findDecoField } from './cm-find-decorations'
import { useLintTooltipLifecycle } from './use-lint-tooltip'
import editorStyles from './code-editor.module.scss'

import { safeParseInt } from '@/services/number'

const jsonLinter = linter((view) => {
	const diagnostics: Diagnostic[] = []
	const content = view.state.doc.toString()
	if (content.trim() === '') return diagnostics
	if (content.length > 250_000) return diagnostics
	try {
		JSON.parse(content)
	} catch (err) {
		const error = err as Error
		const match = error.message.match(/position (\d+)/)
		let pos = 0
		if (match) {
			const offset = safeParseInt(match[1]) ?? 0
			const lines = content.slice(0, offset).split('\n')
			const line = Math.max(0, lines.length - 1)
			const column = lines[lines.length - 1].length
			pos = view.state.doc.line(line + 1).from + column
		}
		diagnostics.push({
			from: Math.max(0, pos - 1),
			to: Math.min(view.state.doc.length, pos + 1),
			severity: 'error',
			message: `JSON Syntax Error: ${error.message}`,
		})
	}
	return diagnostics
})

export interface AutoResizeCodeMirrorProps {
	value: string
	onChange: (value: string) => void
	isDark: boolean
	placeholder?: string
	readOnly?: boolean
	enableNativeSearchPanel?: boolean
	externalDiagnostics?: AutoResizeCodeMirrorDiagnostic[]
}

export interface AutoResizeCodeMirrorDiagnostic {
	path: string
	anchorPath?: string
	message: string
	severity?: 'error' | 'warning' | 'info'
	enumActions?: Array<{
		label: string
		value: unknown
	}>
	quickFix?: {
		type: 'set-value'
		path: string
		value: unknown
		createParents?: boolean
	}
}

interface ResolvedExternalDiagnosticAction {
	label: string
	key: string
	fix: NonNullable<AutoResizeCodeMirrorDiagnostic['quickFix']>
}

interface ResolvedExternalDiagnostic extends AutoResizeCodeMirrorDiagnostic {
	from: number
	to: number
	quickFixKey?: string
	enumActionItems?: ResolvedExternalDiagnosticAction[]
}

export interface AutoResizeCodeMirrorHandle {
	openFind: () => void
	closeFind: () => void
}

function toActionKey(value: unknown): string {
	try {
		return JSON.stringify(value)
	} catch {
		return String(value)
	}
}

function resolveExternalDiagnostics(
	externalDiagnostics: AutoResizeCodeMirrorDiagnostic[],
	content: string,
): ResolvedExternalDiagnostic[] {
	if (!Array.isArray(externalDiagnostics) || externalDiagnostics.length === 0) return []
	const diagnostics: ResolvedExternalDiagnostic[] = []
	const dedupe = new Set<string>()

	for (const diagnostic of externalDiagnostics) {
		if (!diagnostic?.message) continue
		const { from, to } = findRangeByPath(content, diagnostic.anchorPath ?? diagnostic.path)
		const severity = diagnostic.severity ?? 'error'
		const message = diagnostic.path && diagnostic.path !== '$'
			? `${diagnostic.path}: ${diagnostic.message}`
			: diagnostic.message
		const quickFixKey = diagnostic.quickFix
			? `${diagnostic.quickFix.type}:${diagnostic.quickFix.path}:${JSON.stringify(diagnostic.quickFix.value)}`
			: undefined
		const enumActionItems: ResolvedExternalDiagnosticAction[] | undefined = Array.isArray(diagnostic.enumActions)
			? diagnostic.enumActions
				.map((action) => ({
					label: String(action.label ?? '').trim(),
					key: `enum:${diagnostic.path}:${toActionKey(action.value)}`,
					fix: {
						type: 'set-value' as const,
						path: diagnostic.path,
						value: action.value,
						createParents: true,
					},
				}))
				.filter((action) => action.label.length > 0)
			: undefined

		const key = `${from}:${to}:${severity}:${message}`
		if (dedupe.has(key)) continue
		dedupe.add(key)
		diagnostics.push({
			...diagnostic,
			severity,
			message,
			from,
			to,
			quickFixKey,
			enumActionItems,
		})
		if (diagnostics.length >= 120) break
	}

	return diagnostics
}

export const AutoResizeCodeMirror = forwardRef<AutoResizeCodeMirrorHandle, AutoResizeCodeMirrorProps>(({
	value,
	onChange,
	isDark,
	placeholder,
	readOnly,
	enableNativeSearchPanel = false,
	externalDiagnostics = [],
}, ref) => {
	const editorRef = useRef<HTMLDivElement | null>(null)
	const viewRef = useRef<EditorView | null>(null)
	const rafRef = useRef<number | null>(null)

	const onChangeRef = useRef(onChange)
	onChangeRef.current = onChange
	const valueRef = useRef(value)
	valueRef.current = value

	const [findOpen, setFindOpen] = useState(false)
	const findOpenRef = useRef(false)
	const [query, setQuery] = useState('')
	const [currentIdx, setCurrentIdx] = useState(0)
	const [appliedFixes, setAppliedFixes] = useState<Record<string, true>>({})
	const [pendingFix, setPendingFix] = useState<NonNullable<AutoResizeCodeMirrorDiagnostic['quickFix']> | null>(null)

	useLintTooltipLifecycle(editorRef)

	const matches = useMemo(() => {
		const q = query
		if (!q) return [] as Array<{ from: number; to: number }>
		const text = value ?? ''
		const hay = text.toLowerCase()
		const needle = q.toLowerCase()
		const out: Array<{ from: number; to: number }> = []
		let i = 0
		while (true) {
			const idx = hay.indexOf(needle, i)
			if (idx === -1) break
			out.push({ from: idx, to: idx + needle.length })
			i = idx + Math.max(1, needle.length)
			if (out.length > 5000) break
		}
		return out
	}, [query, value])

	useEffect(() => {
		if (!pendingFix) return
		const fix = pendingFix
		setPendingFix(null)
		const currentText = valueRef.current
		const nextText = applyQuickFixToJson(currentText, fix)
		if (nextText && nextText !== currentText) {
			onChangeRef.current(nextText)
			const view = viewRef.current
			if (view) {
				try {
					view.dispatch({
						changes: { from: 0, to: view.state.doc.length, insert: nextText },
					})
				} catch {
					void 0
				}
			}
		}
	}, [pendingFix])

	const resolvedExternalDiagnostics = useMemo(
		() => resolveExternalDiagnostics(externalDiagnostics, value ?? ''),
		[externalDiagnostics, value],
	)

	useEffect(() => {
		const allowed = new Set(
			resolvedExternalDiagnostics.flatMap((diagnostic) => {
				const keys: string[] = []
				if (typeof diagnostic.quickFixKey === 'string') keys.push(diagnostic.quickFixKey)
				if (Array.isArray(diagnostic.enumActionItems)) {
					for (const action of diagnostic.enumActionItems) {
						if (action.key) keys.push(action.key)
					}
				}
				return keys
			}),
		)
		setAppliedFixes((prev) => {
			const next: Record<string, true> = {}
			for (const key of Object.keys(prev)) {
				if (allowed.has(key)) next[key] = true
			}
			return next
		})
	}, [resolvedExternalDiagnostics])

	const openFind = useCallback(() => {
		setFindOpen(true)
		findOpenRef.current = true
		setCurrentIdx(0)
	}, [])

	const closeFind = useCallback(() => {
		setFindOpen(false)
		findOpenRef.current = false
	}, [])

	useImperativeHandle(ref, () => ({ openFind, closeFind }), [openFind, closeFind])

	const scheduleUpdateHeight = useCallback((): void => {
		if (rafRef.current != null) {
			try {
				cancelAnimationFrame(rafRef.current)
			} catch {
				void 0
			}
		}
		rafRef.current = requestAnimationFrame(() => {
			rafRef.current = null
			const host = editorRef.current
			if (!host) return
			const content = host.querySelector('.cm-content') as HTMLElement | null
			if (content) {
				const hugeText = (valueRef.current ?? '').length > 250_000
				const desired = content.scrollHeight + 24
				const newHeight = hugeText ? 720 : Math.max(desired, 120)
				host.style.height = `${newHeight}px`
			}
		})
	}, [])

	useEffect(() => {
		scheduleUpdateHeight()
	}, [value, scheduleUpdateHeight])

	useEffect(() => {
		const host = editorRef.current
		if (!host) return
		const styleId = 'cm-caret-override'
		let styleEl = host.querySelector(`#${styleId}`) as HTMLStyleElement | null
		if (!styleEl) {
			styleEl = document.createElement('style')
			styleEl.id = styleId
			host.prepend(styleEl)
		}
		const caret = isDark ? '#ffffff' : '#000000'
		styleEl.textContent = `
.cm-editor .cm-content { caret-color: ${caret} !important; }
.cm-editor .cm-cursor { border-left-color: ${caret} !important; }
.cm-editor .cm-dropCursor { border-left-color: ${caret} !important; }
		`
		const applyInline = () => {
			const caretTargets = host.querySelectorAll<HTMLElement>('.cm-content, .cm-line')
			caretTargets.forEach((el) => el.style.setProperty('caret-color', caret, 'important'))
			const cursorTargets = host.querySelectorAll<HTMLElement>('.cm-cursor, .cm-dropCursor')
			cursorTargets.forEach((el) => el.style.setProperty('border-left-color', caret, 'important'))
		}
		applyInline()
		const observer = new MutationObserver(applyInline)
		observer.observe(host, { childList: true, subtree: true, attributes: true })
		return () => observer.disconnect()
	}, [isDark])

	const jumpTo = useCallback((idx: number) => {
		const view = viewRef.current
		if (!view) return
		if (!query || matches.length === 0) return
		const safeIdx = ((idx % matches.length) + matches.length) % matches.length
		const m = matches[safeIdx]
		setCurrentIdx(safeIdx)
		try {
			view.dispatch({
				selection: { anchor: m.from, head: m.to },
				effects: EditorView.scrollIntoView(m.from, { y: 'center', x: 'nearest' }),
			} as unknown as Transaction)
		} catch {
			void 0
		}
	}, [matches, query])

	useEffect(() => {
		if (!findOpen) return
		if (!query || matches.length === 0) return
		jumpTo(0)
	}, [findOpen, jumpTo, matches.length, query])

	useEffect(() => {
		if (!findOpen) return
		if (matches.length === 0) {
			setCurrentIdx(0)
		} else if (currentIdx >= matches.length) {
			setCurrentIdx(0)
		}
	}, [currentIdx, findOpen, matches.length])

	const triggerPendingFix = useCallback((fix: NonNullable<AutoResizeCodeMirrorDiagnostic['quickFix']>, fixKey?: string) => {
		setPendingFix(fix)
		if (fixKey) {
			setAppliedFixes((prev) => ({ ...prev, [fixKey]: true }))
		}
	}, [])

	const applyAllAvailableFixes = useCallback((applicable: Array<{
		fix: NonNullable<AutoResizeCodeMirrorDiagnostic['quickFix']>
		key: string
	}>) => {

		if (applicable.length <= 1) return

		let nextText = valueRef.current
		const appliedKeys: string[] = []
		for (const item of applicable) {
			const patched = applyQuickFixToJson(nextText, item.fix)
			if (!patched || patched === nextText) continue
			nextText = patched
			appliedKeys.push(item.key)
		}

		if (nextText === valueRef.current || appliedKeys.length === 0) return

		onChangeRef.current(nextText)
		const view = viewRef.current
		if (view) {
			try {
				view.dispatch({
					changes: { from: 0, to: view.state.doc.length, insert: nextText },
				})
			} catch {
				void 0
			}
		}

		setAppliedFixes((prev) => {
			const next = { ...prev }
			for (const key of appliedKeys) next[key] = true
			return next
		})
	}, [])

	const extensions = useMemo(() => {
		const openApiLinter = linter((view) => {
			if (!resolvedExternalDiagnostics.length) return [] as Diagnostic[]
			const severityRank = (severity?: string): number => {
				if (severity === 'error') return 0
				if (severity === 'warning') return 1
				if (severity === 'info') return 2
				return 3
			}

			const sortedDiagnostics = [...resolvedExternalDiagnostics].sort((a, b) => {
				const severityDiff = severityRank(a.severity) - severityRank(b.severity)
				if (severityDiff !== 0) return severityDiff
				if (a.from !== b.from) return a.from - b.from
				return a.to - b.to
			})
			const lineNumbers = sortedDiagnostics.map((d) => view.state.doc.lineAt(d.from).number)

			return sortedDiagnostics.map((diagnostic, idx) => ({
				from: diagnostic.from,
				to: diagnostic.to,
				severity: diagnostic.severity ?? 'error',
				message: diagnostic.message,
				renderMessage: () => {
					const currentLineNumber = lineNumbers[idx]
					const scopedApplyAllCandidates = sortedDiagnostics.reduce<Array<{
						fix: NonNullable<AutoResizeCodeMirrorDiagnostic['quickFix']>
						key: string
					}>>((acc, item, itemIdx) => {
						if (lineNumbers[itemIdx] !== currentLineNumber) return acc
						if (!item.quickFix || !item.quickFixKey) return acc
						if (item.enumActionItems && item.enumActionItems.length > 0) return acc
						if (appliedFixes[String(item.quickFixKey)]) return acc
						acc.push({ fix: item.quickFix, key: String(item.quickFixKey) })
						return acc
					}, [])
					const showApplyAll = !readOnly && scopedApplyAllCandidates.length > 1
					const applyAllFirstKey = showApplyAll ? scopedApplyAllCandidates[0].key : ''

					const wrap = document.createElement('div')
					wrap.style.position = 'relative'
					wrap.style.whiteSpace = 'pre-wrap'
					wrap.style.maxWidth = '560px'
					wrap.style.wordBreak = 'break-word'

					const msgSpan = document.createElement('span')
					if (showApplyAll && String(diagnostic.quickFixKey ?? '') === applyAllFirstKey) {
						msgSpan.style.display = 'block'
						msgSpan.style.paddingRight = '90px'
					}
					msgSpan.textContent = diagnostic.message
					wrap.appendChild(msgSpan)

					if (showApplyAll && String(diagnostic.quickFixKey ?? '') === applyAllFirstKey) {
						const applyAllBtn = document.createElement('button')
						applyAllBtn.textContent = 'Apply all'
						applyAllBtn.style.cssText = 'position:absolute;top:0;right:0;padding:2px 8px;border:1px solid #888;border-radius:4px;background:#2a2a2a;color:#fff;cursor:pointer;font-size:13px;'
						applyAllBtn.addEventListener('mousedown', (e) => {
							e.preventDefault()
							e.stopPropagation()
						})
						applyAllBtn.addEventListener('click', (e) => {
							e.preventDefault()
							e.stopPropagation()
							applyAllAvailableFixes(scopedApplyAllCandidates)
						})
						wrap.appendChild(applyAllBtn)
					}

					if (!readOnly && Array.isArray(diagnostic.enumActionItems) && diagnostic.enumActionItems.length > 0) {
						const actionsWrap = document.createElement('div')
						actionsWrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;max-height:200px;overflow-y:auto;align-content:flex-start;padding-right:4px;'
						for (const action of diagnostic.enumActionItems) {
							const actionButton = document.createElement('button')
							const isApplied = Boolean(appliedFixes[action.key])
							actionButton.textContent = isApplied ? `${action.label} ✓` : action.label
							actionButton.style.cssText = 'padding:2px 8px;border:1px solid #888;border-radius:4px;background:#2a2a2a;color:#fff;cursor:pointer;font-size:13px;'
							if (isApplied) {
								actionButton.disabled = true
								actionButton.style.opacity = '0.5'
								actionButton.style.cursor = 'default'
							} else {
								actionButton.addEventListener('mousedown', (e) => {
									e.preventDefault()
									e.stopPropagation()
								})
								actionButton.addEventListener('click', (e) => {
									e.preventDefault()
									e.stopPropagation()
									triggerPendingFix(action.fix, action.key)
								})
							}
							actionsWrap.appendChild(actionButton)
						}
						wrap.appendChild(actionsWrap)
					}

					if (!readOnly && diagnostic.quickFix && (!diagnostic.enumActionItems || diagnostic.enumActionItems.length === 0)) {
						const isApplied = diagnostic.quickFixKey && appliedFixes[diagnostic.quickFixKey]
						const btn = document.createElement('button')
						btn.textContent = isApplied ? 'Added ✓' : 'Apply'
						btn.style.cssText = 'display:block;margin-top:6px;padding:2px 10px;border:1px solid #888;border-radius:4px;background:#2a2a2a;color:#fff;cursor:pointer;font-size:13px;'
						if (isApplied) {
							btn.disabled = true
							btn.style.opacity = '0.5'
							btn.style.cursor = 'default'
						} else {
							btn.addEventListener('mousedown', (e) => {
								e.preventDefault()
								e.stopPropagation()
							})
							btn.addEventListener('click', (e) => {
								e.preventDefault()
								e.stopPropagation()
								if (!diagnostic.quickFix) return
								triggerPendingFix(diagnostic.quickFix, diagnostic.quickFixKey)
							})
						}
						wrap.appendChild(btn)
					}

					return wrap
				},
			}))
		}, {
			markerFilter: (diagnostics) => diagnostics.filter((diagnostic) => (
				diagnostic.severity === 'error'
				|| /Enum values available:/i.test(String(diagnostic.message ?? ''))
			)),
			tooltipFilter: () => [],
		})

		const openFindKeys = EditorView.domEventHandlers({
			keydown: (e) => {
				if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'f' && !enableNativeSearchPanel) {
					e.preventDefault()
					openFind()
					return true
				}
				if (e.key === 'Escape' && findOpenRef.current) {
					e.preventDefault()
					closeFind()
					return true
				}
				return false
			},
			mousedown: (e, view) => {
				if (!resolvedExternalDiagnostics.length) return false
				const target = e.target as HTMLElement | null
				if (!target?.closest('.cm-gutters')) return false

				const pos = view.posAtCoords({ x: Math.max(1, e.clientX), y: e.clientY })
				if (pos == null) return false
				const line = view.state.doc.lineAt(pos)

				const lineDiagnostics = resolvedExternalDiagnostics.filter((diagnostic) => (
					diagnostic.from <= line.to && diagnostic.to >= line.from
				))
				if (!lineDiagnostics.length) return false

				const preferred = lineDiagnostics.find((diagnostic) => /^\$[^:]*: Missing(?: required)? field\b/i.test(diagnostic.message))
					?? lineDiagnostics.find((diagnostic) => /\bMissing(?: required)? field\b/i.test(diagnostic.message))
					?? lineDiagnostics[0]

				view.dispatch({
					selection: { anchor: preferred.from, head: preferred.to },
					effects: EditorView.scrollIntoView(preferred.from, { y: 'center', x: 'nearest' }),
				} as unknown as Transaction)

				return false
			},
		})

		return [
			...(isDark ? [oneDark] : []),
			json(),
			jsonLinter,
			openApiLinter,
			lintGutter(),
			EditorView.lineWrapping,
			...(readOnly ? [EditorView.editable.of(false)] : []),
			openFindKeys,
			findDecoField,
			EditorView.theme({
				'&': { fontSize: '13px', backgroundColor: isDark ? '#222222' : '#ffffff', fontFamily: 'monospace' },
				'.cm-tooltip.cm-tooltip-lint': {
					maxHeight: '360px',
					overflowY: 'auto',
				},
				'.cm-content': {
					minHeight: '80px',
					maxHeight: 'none',
					backgroundColor: isDark ? '#222222' : '#ffffff',
					fontSize: '13px',
					fontFamily: 'monospace',
				},
				'.cm-scroller': { overflow: 'auto' },
			}),
			EditorView.updateListener.of((update) => {
				if (update.docChanged) setTimeout(scheduleUpdateHeight, 0)
			}),
		]
	}, [appliedFixes, applyAllAvailableFixes, closeFind, enableNativeSearchPanel, isDark, openFind, readOnly, resolvedExternalDiagnostics, scheduleUpdateHeight, triggerPendingFix])

	useEffect(() => () => {
		if (rafRef.current != null) {
			try {
				cancelAnimationFrame(rafRef.current)
			} catch {
				void 0
			}
			rafRef.current = null
		}
	}, [])

	useEffect(() => {
		if (!findOpen || enableNativeSearchPanel) return
		const host = editorRef.current
		if (!host) return

		const sidebar = host.closest('.mm-side-drawer') as HTMLElement | null
		const header = sidebar?.querySelector('[data-mm-sticky-header="1"]') as HTMLElement | null

		const applyTop = () => {
			try {
				const h = header ? Math.max(0, Math.round(header.getBoundingClientRect().height)) : 0
				host.style.setProperty('--mm-find-sticky-top', `${h}px`)
			} catch {
				void 0
			}
		}

		applyTop()

		let ro: ResizeObserver | null = null
		if (typeof ResizeObserver !== 'undefined' && header) {
			ro = new ResizeObserver(() => applyTop())
			ro.observe(header)
		}

		window.addEventListener('resize', applyTop)
		return () => {
			try {
				ro?.disconnect()
			} catch {
				void 0
			}
			window.removeEventListener('resize', applyTop)
			try {
				host.style.removeProperty('--mm-find-sticky-top')
			} catch {
				void 0
			}
		}
	}, [enableNativeSearchPanel, findOpen])

	useEffect(() => {
		const view = viewRef.current
		if (!view) return
		if (!findOpen || !query || matches.length === 0) {
			try {
				view.dispatch({ effects: setFindDecos.of({ ranges: [], current: 0 }) } as unknown as Transaction)
			} catch {
				void 0
			}
			return
		}
		try {
			view.dispatch({ effects: setFindDecos.of({ ranges: matches, current: currentIdx }) } as unknown as Transaction)
		} catch {
			void 0
		}
	}, [currentIdx, findOpen, matches, query])

	return (
		<div ref={editorRef} className={editorStyles.cmHost} style={{ width: '100%' }}>
			{!enableNativeSearchPanel && findOpen ? (
				<div className={`${editorStyles.findBar} ${isDark ? editorStyles.findBarDark : ''}`}>
					<div className={editorStyles.findRow}>
						<input
							className={editorStyles.findInput}
							placeholder="Find…"
							value={query}
							onChange={(e) => setQuery(e.currentTarget.value)}
							onKeyDown={(e) => {
								if (e.key === 'Enter') {
									e.preventDefault()
									jumpTo(currentIdx + (e.shiftKey ? -1 : 1))
								}
								if (e.key === 'Escape') {
									e.preventDefault()
									closeFind()
								}
							}}
						/>

						<button
							type="button"
							className={editorStyles.findBtn}
							onClick={() => jumpTo(currentIdx - 1)}
							disabled={!query || matches.length === 0}
							title="Previous (Shift+Enter)"
						>
							Prev
						</button>
						<button
							type="button"
							className={editorStyles.findBtn}
							onClick={() => jumpTo(currentIdx + 1)}
							disabled={!query || matches.length === 0}
							title="Next (Enter)"
						>
							Next
						</button>

						<span className={editorStyles.findCount}>
							{query ? (matches.length ? `${currentIdx + 1}/${matches.length}` : '0/0') : ''}
						</span>

						<button type="button" className={editorStyles.findClose} onClick={closeFind} title="Close (Esc)">
							×
						</button>
					</div>
				</div>
			) : null}
			<CodeMirror
				value={value}
				height="auto"
				style={{
					minHeight: '120px',
					width: '100%',
					background: isDark ? '#222' : '#fff',
					overflow: 'visible',
					fontSize: '13px',
					fontFamily: 'monospace',
				}}
				extensions={extensions}
				onCreateEditor={(view: unknown) => {
					try {
						viewRef.current = view as EditorView
					} catch {
						void 0
					}
				}}
				onChange={readOnly ? () => undefined : onChange}
				placeholder={placeholder}
			/>
		</div>
	)
})

AutoResizeCodeMirror.displayName = 'AutoResizeCodeMirror'
