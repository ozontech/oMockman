import React, { useRef, useEffect } from 'react'
import { Segment, Message } from 'semantic-ui-react'

import editorStyles from '../../common/code-editor.module.scss'
import { AutoResizeCodeMirror } from '../../common/auto-resize-codemirror'
import { useGlobalStore } from '../../store'

import { parseJSONIfPossible } from './log-details-utils'

import { formatBytes, MAX_BODY_BYTES } from '@/services/body-limits'

/**
 * LogDetailsJson - read-only JSON viewer
 */

type ResponseBody = unknown

interface Props {
	response?: ResponseBody
	isRequestPending: boolean
	useEditor?: boolean
	/** 0 when the size is unknown. */
	tooLargeBytes?: number
}

export const LogDetailsJson: React.FC<Props> = ({
	response,
	isRequestPending,
	useEditor = true,
	tooLargeBytes,
}) => {
	const isDark = useGlobalStore((s) => s.resolvedScheme === 'dark')
	const t = useGlobalStore((s) => s.t)
	const editorRef = useRef<HTMLDivElement | null>(null)
	const sourceString = typeof response === 'string'
		? response
		: response != null
			? (() => {
				try { return JSON.stringify(response, null, 2) } catch { return String(response) }
			})()
			: ''

	const parsed = parseJSONIfPossible(sourceString)
	const isJson = parsed.parsed
	const displayValue = isJson ? JSON.stringify(parsed.json, null, 2) : sourceString

	const updateHeight = (): void => {
		if (!editorRef.current) return
		const content = editorRef.current.querySelector('.cm-content') as HTMLElement | null
		if (content) {
			const newHeight = Math.max(content.scrollHeight + 24, 120)
			editorRef.current.style.height = `${newHeight}px`
		}
	}

	useEffect(() => {
		updateHeight()
	}, [displayValue])

	if (isRequestPending)
		return (
			<Segment basic textAlign="center" style={{ paddingTop: 64, background: isDark ? 'var(--bg)' : undefined }}>
				<Message
					info
					inverted={isDark}
					style={isDark ? { background: '#333', color: '#fff', border: '1px solid #444' } : undefined}
					content={t.logDetail_pending}
				/>
			</Segment>
		)

	if (tooLargeBytes != null)
		return (
			<Segment basic textAlign="center" style={{ paddingTop: 64, background: isDark ? 'var(--bg)' : undefined }}>
				<Message
					negative
					icon="exclamation triangle"
					header={t.logDetail_bodyTooLargeTitle}
					content={t.logDetail_bodyTooLarge(tooLargeBytes ? formatBytes(tooLargeBytes) : '', formatBytes(MAX_BODY_BYTES))}
					data-testid="log-body-too-large"
				/>
			</Segment>
		)

	if (!response)
		return (
			<Segment basic textAlign="center" style={{ paddingTop: 64, background: isDark ? 'var(--bg)' : undefined }}>
				<Message
					inverted={isDark}
					style={isDark ? { background: '#333', color: '#fff', border: '1px solid #444' } : undefined}
					content={t.logDetail_nothingToPreview}
				/>
			</Segment>
		)

	if (!useEditor) return (
		<Segment style={{ padding: '16px', backgroundColor: isDark ? '#222222' : '#ffffff', border: 'none', borderRadius: '4px' }}>
			<div ref={editorRef} className={editorStyles.cmHost} style={{ width: '100%' }}>
				<AutoResizeCodeMirror value={displayValue} isDark={isDark} onChange={() => { /* read-only */ }} placeholder={undefined} readOnly />
			</div>
		</Segment>
	)

	return (
		<Segment style={{ padding: '16px', backgroundColor: isDark ? '#222222' : '#ffffff', border: 'none', borderRadius: '4px' }}>
			<div ref={editorRef} className={editorStyles.cmHost} style={{ width: '100%' }}>
				<AutoResizeCodeMirror value={displayValue} isDark={isDark} onChange={() => { /* read-only */ }} placeholder={undefined} readOnly />
			</div>
		</Segment>
	)
}
