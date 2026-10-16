import React, { useRef, useEffect, useMemo } from 'react'
import { Button, Icon, Segment, Message } from 'semantic-ui-react'
import { toast } from 'react-toastify'

import editorStyles from '../../common/code-editor.module.scss'
import { AutoResizeCodeMirror } from '../../common/auto-resize-codemirror'
import { useGlobalStore } from '../../store'

import { parseJSONIfPossible } from './log-details-utils'

import { formatBytes, LARGE_EDITOR_CHARS, MAX_BODY_BYTES, utf8ByteLength } from '@/services/body-limits'
import { copyTextToClipboard } from '@/services/helper'

/** Saves the shown body as it is: the text is already formatted. */
function downloadText(filename: string, text: string): void {
	const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }))
	const link = document.createElement('a')
	link.href = url
	link.download = filename
	link.click()
	setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const countLines = (text: string): number => {
	let lines = 1
	for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) lines += 1
	return lines
}

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
	/** Set for a binary body, which is never captured; 0 when the size is unknown. */
	binaryBytes?: number
}

export const LogDetailsJson: React.FC<Props> = ({
	response,
	isRequestPending,
	useEditor = true,
	tooLargeBytes,
	binaryBytes,
}) => {
	const isDark = useGlobalStore((s) => s.resolvedScheme === 'dark')
	const t = useGlobalStore((s) => s.t)
	const editorRef = useRef<HTMLDivElement | null>(null)
	const displayValue = useMemo(() => {
		const sourceString = typeof response === 'string'
			? response
			: response != null
				? (() => {
					try { return JSON.stringify(response, null, 2) } catch { return String(response) }
				})()
				: ''
		const parsed = parseJSONIfPossible(sourceString)
		return parsed.parsed ? JSON.stringify(parsed.json, null, 2) : sourceString
	}, [response])
	const large = displayValue.length > LARGE_EDITOR_CHARS
	const largeInfo = useMemo(
		() => (large ? { size: formatBytes(utf8ByteLength(displayValue)), lines: countLines(displayValue) } : null),
		[large, displayValue],
	)

	const updateHeight = (): void => {
		if (!editorRef.current) return
		if (large) {
			editorRef.current.style.height = ''
			return
		}
		const content = editorRef.current.querySelector('.cm-content') as HTMLElement | null
		if (content) {
			const newHeight = Math.max(content.scrollHeight + 24, 120)
			editorRef.current.style.height = `${newHeight}px`
		}
	}

	useEffect(() => {
		updateHeight()
	}, [displayValue, large])

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

	if (binaryBytes != null)
		return (
			<Segment basic textAlign="center" style={{ paddingTop: 64, background: isDark ? 'var(--bg)' : undefined }}>
				<Message
					info
					inverted={isDark}
					style={isDark ? { background: '#333', color: '#fff', border: '1px solid #444' } : undefined}
					header={t.logDetail_binaryTitle}
					content={t.logDetail_binary(binaryBytes ? formatBytes(binaryBytes) : '')}
					data-testid="log-body-binary"
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

	const largeBanner = largeInfo ? (
		<div className={editorStyles.largeBanner} data-testid="log-body-large">
			<Icon name="file alternate outline" />
			<span className={editorStyles.largeBannerText}>{t.logDetail_largeBody(largeInfo.size, largeInfo.lines.toLocaleString(t.dateLocale))}</span>
			<Button
				type="button"
				size="mini"
				basic
				inverted={isDark}
				onClick={() => void copyTextToClipboard(displayValue).then((ok) => ok && toast.success(t.logDetail_copied))}
			>
				<Icon name="copy outline" />
				{t.logDetail_copy}
			</Button>
			<Button type="button" size="mini" basic inverted={isDark} onClick={() => downloadText('response.json', displayValue)}>
				<Icon name="download" />
				{t.logDetail_download}
			</Button>
		</div>
	) : null

	if (!useEditor) return (
		<Segment style={{ padding: '16px', backgroundColor: isDark ? '#222222' : '#ffffff', border: 'none', borderRadius: '4px' }}>
			{largeBanner}
			<div ref={editorRef} className={editorStyles.cmHost} style={{ width: '100%' }}>
				<AutoResizeCodeMirror value={displayValue} isDark={isDark} onChange={() => { /* read-only */ }} placeholder={undefined} readOnly />
			</div>
		</Segment>
	)

	return (
		<Segment style={{ padding: '16px', backgroundColor: isDark ? '#222222' : '#ffffff', border: 'none', borderRadius: '4px' }}>
			{largeBanner}
			<div ref={editorRef} className={editorStyles.cmHost} style={{ width: '100%' }}>
				<AutoResizeCodeMirror value={displayValue} isDark={isDark} onChange={() => { /* read-only */ }} placeholder={undefined} readOnly />
			</div>
		</Segment>
	)
}
