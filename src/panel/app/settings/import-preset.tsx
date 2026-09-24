import React, { useCallback, useEffect, useState } from 'react'
import { Button, Form, Icon, Message, Modal } from 'semantic-ui-react'

import { useGlobalStore } from '../store'

import s from './settings.module.scss'

import { modalActionsSurface, modalHeaderSurface, modalSurface } from '@/panel/app/blocks'
import { safeParseJson } from '@/services/json'
import type { IImportPresetProps, PresetImport } from '@/interface/ai'

function parsePreset(raw: string): { ok: true; preset: PresetImport } | { ok: false; error: string } {
	const parsed = safeParseJson<Record<string, unknown>>(raw)
	if (!parsed.ok) return { ok: false, error: `Invalid JSON: ${parsed.error}` }
	const value = parsed.value
	if (!value || typeof value !== 'object') return { ok: false, error: 'Preset must be a JSON object' }

	const name = String(value.name ?? '').trim()
	const baseURL = String(value.baseURL ?? '').trim()
	const model = String(value.model ?? '').trim()
	if (!name) return { ok: false, error: 'Field "name" is required' }
	if (!baseURL) return { ok: false, error: 'Field "baseURL" is required' }
	if (!model) return { ok: false, error: 'Field "model" is required' }

	const preset: PresetImport = { name, baseURL, model }
	if (typeof value.authHeader === 'string') preset.authHeader = value.authHeader
	if (typeof value.authPrefix === 'string') preset.authPrefix = value.authPrefix
	if (typeof value.temperature === 'number') preset.temperature = value.temperature
	if (typeof value.maxTokens === 'number') preset.maxTokens = value.maxTokens
	if (typeof value.supportsJsonMode === 'boolean') preset.supportsJsonMode = value.supportsJsonMode
	if (typeof value.supportsStreaming === 'boolean') preset.supportsStreaming = value.supportsStreaming
	if (typeof value.setupHint === 'string') preset.setupHint = value.setupHint
	if (Array.isArray(value.extraHeaders)) {
		preset.extraHeaders = value.extraHeaders
			.filter((entry): entry is { name: string; value: string } => (
				Boolean(entry)
				&& typeof entry === 'object'
				&& typeof (entry as { name?: unknown }).name === 'string'
				&& typeof (entry as { value?: unknown }).value === 'string'
			))
			.map((entry) => ({ name: entry.name, value: entry.value }))
	}

	return { ok: true, preset }
}

export const ImportPreset: React.FC<IImportPresetProps> = ({ open, onClose, onImport, isDark }) => {
	const t = useGlobalStore((s) => s.t)
	const [text, setText] = useState('')
	const [error, setError] = useState<string | null>(null)
	const [submitting, setSubmitting] = useState(false)

	useEffect(() => {
		if (!open) return
		setText('')
		setError(null)
	}, [open])

	const handleSubmit = useCallback(async () => {
		const result = parsePreset(text)
		if (!result.ok) {
			setError(result.error)
			return
		}
		setError(null)
		setSubmitting(true)
		try {
			await onImport(result.preset)
			onClose()
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Import failed')
		} finally {
			setSubmitting(false)
		}
	}, [text, onImport, onClose])


	return (
		<Modal
			open={open}
			onClose={onClose}
			size="small"
			dimmer={isDark ? 'blurring' : 'dimmingLight'}
			style={modalSurface(isDark)}
		>
			<Modal.Header style={modalHeaderSurface(isDark)}>{t.import_title}</Modal.Header>
			<Modal.Content style={modalSurface(isDark)}>
				<p className={s.importHint}>{t.import_hint}</p>
				<Form inverted={isDark}>
					<Form.TextArea
						placeholder={t.import_placeholder}
						rows={10}
						value={text}
						onChange={(_, data) => setText(String(data.value ?? ''))}
						className={s.importTextarea}
					/>
				</Form>
				{error ? (
					<Message negative size="tiny">
						<Icon name="exclamation triangle" />
						{error}
					</Message>
				) : null}
			</Modal.Content>
			<Modal.Actions style={modalActionsSurface(isDark)}>
				<Button basic inverted={isDark} onClick={onClose}>{t.import_cancel}</Button>
				<Button primary disabled={submitting || !text.trim()} onClick={() => void handleSubmit()}>
					{t.import_apply}
				</Button>
			</Modal.Actions>
		</Modal>
	)
}
