import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-toastify'
import { Button, Form, Icon, Modal } from 'semantic-ui-react'

import { useGlobalStore } from '../store'

import { ApiKeyField } from './api-key-field'
import { SetupHint } from './setup-hint'
import { SystemPromptSection } from './system-prompt-section'
import { TestConnectionButton } from './test-connection-button'
import s from './settings.module.scss'

import { modalActionsSurface, modalHeaderSurface, modalSurface } from '@/panel/app/blocks'
import { safeNumberFloat, safeNumberInt } from '@/services/number'
import type { IAIProviderConfig, IProviderFormProps, ProviderDraft } from '@/interface/ai'
import { createProvider } from '@/services/ai'

const FieldLabel: React.FC<{ text: string; tip: string }> = ({ text, tip }) => {
	const [visible, setVisible] = useState(false)
	const ref = useRef<HTMLSpanElement>(null)
	const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

	useEffect(() => {
		if (!visible) return
		const close = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) setVisible(false)
		}
		document.addEventListener('mousedown', close)
		return () => document.removeEventListener('mousedown', close)
	}, [visible])

	const handleMouseEnter = () => {
		hoverTimer.current = setTimeout(() => setVisible(true), 500)
	}

	const handleMouseLeave = () => {
		if (hoverTimer.current) clearTimeout(hoverTimer.current)
		setVisible(false)
	}

	return (
		<label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
			{text}
			<span
				ref={ref}
				style={{ position: 'relative', display: 'inline-flex', cursor: 'default' }}
				onClick={() => setVisible((v) => !v)}
				onMouseEnter={handleMouseEnter}
				onMouseLeave={handleMouseLeave}
			>
				<span style={{ opacity: 0.5, fontSize: 13, userSelect: 'none' }}>ⓘ</span>
				{visible && (
					<span
						style={{
							position: 'absolute',
							bottom: 'calc(100% + 6px)',
							left: '50%',
							transform: 'translateX(-50%)',
							background: '#222',
							color: '#fff',
							fontSize: 12,
							lineHeight: 1.4,
							padding: '6px 10px',
							borderRadius: 4,
							whiteSpace: 'normal',
							width: 240,
							zIndex: 1000,
							boxShadow: '0 2px 8px rgba(0,0,0,.3)',
							pointerEvents: 'none',
						}}
					>
						{tip}
					</span>
				)}
			</span>
		</label>
	)
}

function makeEmptyDraft(): ProviderDraft {
	return {
		name: '',
		baseURL: '',
		apiKey: '',
		model: '',
		authHeader: '',
		authPrefix: '',
		temperature: '',
		maxTokens: '',
		supportsJsonMode: true,
		supportsStreaming: false,
		allowLocalHttp: false,
		extraHeaders: [],
	}
}

function toDraft(provider: IAIProviderConfig | null | undefined): ProviderDraft {
	if (!provider) return makeEmptyDraft()
	return {
		name: provider.name,
		baseURL: provider.baseURL,
		apiKey: provider.apiKey,
		model: provider.model,
		authHeader: provider.authHeader ?? '',
		authPrefix: provider.authPrefix ?? '',
		temperature: provider.temperature != null ? String(provider.temperature) : '',
		maxTokens: provider.maxTokens != null ? String(provider.maxTokens) : '',
		supportsJsonMode: provider.supportsJsonMode !== false,
		supportsStreaming: Boolean(provider.supportsStreaming),
		allowLocalHttp: provider.allowLocalHttp === true,
		extraHeaders: (provider.extraHeaders ?? []).map((entry, idx) => ({
			id: `eh-${idx}`,
			name: entry.name,
			value: entry.value,
		})),
		setupHint: provider.setupHint,
	}
}

function parseFloatOrUndefined(value: string): number | undefined {
	const trimmed = value.trim()
	if (!trimmed) return undefined
	return safeNumberFloat(trimmed) ?? undefined
}

function parseIntOrUndefined(value: string): number | undefined {
	const trimmed = value.trim()
	if (!trimmed) return undefined
	return safeNumberInt(trimmed) ?? undefined
}

function isDraftValid(draft: ProviderDraft): boolean {
	return Boolean(draft.name.trim() && draft.baseURL.trim() && draft.apiKey.trim() && draft.model.trim())
}

export const ProviderForm: React.FC<IProviderFormProps> = ({
	open,
	onClose,
	onSubmit,
	editing,
	isDark,
	systemPrompt,
	onSaveSystemPrompt,
}) => {
	const t = useGlobalStore((s) => s.t)
	const [draft, setDraft] = useState<ProviderDraft>(makeEmptyDraft())
	const [advancedOpen, setAdvancedOpen] = useState(false)
	const [submitting, setSubmitting] = useState(false)

	useEffect(() => {
		if (!open) return
		setDraft(toDraft(editing))
		setAdvancedOpen(false)
	}, [open, editing])

	const canSubmit = useMemo(() => isDraftValid(draft) && !submitting, [draft, submitting])

	const handleSubmit = useCallback(async () => {
		if (!canSubmit) return
		const name = draft.name.trim()
		setSubmitting(true)
		try {
			await onSubmit({
				name,
				baseURL: draft.baseURL.trim(),
				apiKey: draft.apiKey.trim(),
				model: draft.model.trim(),
				authHeader: draft.authHeader.trim() || undefined,
				authPrefix: draft.authPrefix || undefined,
				extraHeaders: draft.extraHeaders
					.filter((entry) => entry.name.trim())
					.map(({ name, value }) => ({ name: name.trim(), value })),
				temperature: parseFloatOrUndefined(draft.temperature),
				maxTokens: parseIntOrUndefined(draft.maxTokens),
				supportsJsonMode: draft.supportsJsonMode,
				supportsStreaming: draft.supportsStreaming,
				allowLocalHttp: draft.allowLocalHttp,
				setupHint: draft.setupHint,
			})
			toast.success(editing ? t.toast_connectionUpdated(name) : t.toast_connectionAdded(name))
			onClose()
		} catch {
			// Already reported; keep the form open so nothing is lost.
		} finally {
			setSubmitting(false)
		}
	}, [canSubmit, draft, onSubmit, onClose, editing, t])

	const probeProvider = useMemo<IAIProviderConfig>(() => createProvider({
		name: draft.name.trim() || 'probe',
		baseURL: draft.baseURL.trim(),
		apiKey: draft.apiKey.trim(),
		model: draft.model.trim(),
		authHeader: draft.authHeader.trim() || undefined,
		authPrefix: draft.authPrefix || undefined,
		extraHeaders: draft.extraHeaders
			.filter((entry) => entry.name.trim())
			.map(({ name, value }) => ({ name: name.trim(), value })),
		temperature: parseFloatOrUndefined(draft.temperature),
		maxTokens: parseIntOrUndefined(draft.maxTokens),
		supportsJsonMode: draft.supportsJsonMode,
		supportsStreaming: draft.supportsStreaming,
		allowLocalHttp: draft.allowLocalHttp,
	}), [draft])

	const addExtraHeader = () =>
		setDraft((d) => ({
			...d,
			extraHeaders: [...d.extraHeaders, { id: `eh-${Date.now()}-${d.extraHeaders.length}`, name: '', value: '' }],
		}))

	const updateExtraHeader = (id: string, patch: Partial<{ name: string; value: string }>) =>
		setDraft((d) => ({
			...d,
			extraHeaders: d.extraHeaders.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
		}))

	const removeExtraHeader = (id: string) =>
		setDraft((d) => ({ ...d, extraHeaders: d.extraHeaders.filter((entry) => entry.id !== id) }))

	const title = editing ? t.ai_editTitle(editing.name) : t.ai_addTitle


	return (
		<Modal
			open={open}
			onClose={onClose}
			size="small"
			closeOnDimmerClick={false}
			style={modalSurface(isDark)}
		>
			<Modal.Header style={modalHeaderSurface(isDark)}>
				<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
					<span>{title}</span>
					<Button icon basic inverted={isDark} size="mini" onClick={onClose} title={t.ai_close} aria-label={t.ai_close}>
						<Icon name="close" />
					</Button>
				</div>
			</Modal.Header>
			<Modal.Content scrolling style={modalSurface(isDark)}>
				<Form inverted={isDark}>
					<Form.Input
						required
						label={t.field_name}
						placeholder={t.field_name_placeholder}
						value={draft.name}
						onChange={(_, data) => setDraft((d) => ({ ...d, name: String(data.value ?? '') }))}
					/>

					<Form.Field required>
						<label>{t.field_serverUrl}</label>
						<Form.Input
							placeholder={t.field_serverUrl_placeholder}
							value={draft.baseURL}
							onChange={(_, data) => setDraft((d) => ({ ...d, baseURL: String(data.value ?? '') }))}
						/>
						<div className={s.fieldHint}>{t.field_serverUrl_hint}</div>
					</Form.Field>

					<SetupHint setupHint={draft.setupHint} />

					<ApiKeyField
						value={draft.apiKey}
						onChange={(apiKey) => setDraft((d) => ({ ...d, apiKey }))}
					/>

					<Form.Field required>
						<label>{t.field_model}</label>
						<Form.Input
							placeholder={t.field_model_placeholder}
							value={draft.model}
							onChange={(_, data) => setDraft((d) => ({ ...d, model: String(data.value ?? '') }))}
						/>
						<div className={s.fieldHint}>{t.field_model_hint}</div>
					</Form.Field>

					<button
						type="button"
						className={s.advancedToggle}
						onClick={() => setAdvancedOpen((v) => !v)}
					>
						<Icon name={advancedOpen ? 'caret down' : 'caret right'} />
						{t.field_advanced}
					</button>

					{advancedOpen ? (
						<div className={s.advancedSection}>
							<Form.Group widths="equal">
								<Form.Field>
									<FieldLabel text={t.field_authHeader} tip={t.field_authHeader_tip} />
									<input
										className="ui input"
										placeholder="Authorization"
										value={draft.authHeader}
										onChange={(e) => setDraft((d) => ({ ...d, authHeader: e.target.value }))}
									/>
								</Form.Field>
								<Form.Field>
									<FieldLabel text={t.field_authPrefix} tip={t.field_authPrefix_tip} />
									<input
										className="ui input"
										placeholder="Bearer "
										value={draft.authPrefix}
										onChange={(e) => setDraft((d) => ({ ...d, authPrefix: e.target.value }))}
									/>
								</Form.Field>
							</Form.Group>

							<Form.Group widths="equal">
								<Form.Field>
									<FieldLabel text={t.field_temperature} tip={t.field_temperature_tip} />
									<input
										className="ui input"
										type="number"
										step="0.1"
										min="0"
										max="2"
										placeholder="0.7"
										value={draft.temperature}
										onChange={(e) => setDraft((d) => ({ ...d, temperature: e.target.value }))}
									/>
								</Form.Field>
								<Form.Field>
									<FieldLabel text={t.field_maxTokens} tip={t.field_maxTokens_tip} />
									<input
										className="ui input"
										type="number"
										placeholder="8000"
										value={draft.maxTokens}
										onChange={(e) => setDraft((d) => ({ ...d, maxTokens: e.target.value }))}
									/>
								</Form.Field>
							</Form.Group>

							<Form.Field>
								<FieldLabel text={t.field_jsonMode} tip={t.field_jsonMode_tip} />
								<Form.Checkbox
									label={t.field_jsonMode_label}
									checked={draft.supportsJsonMode}
									onChange={(_, data) => setDraft((d) => ({ ...d, supportsJsonMode: Boolean(data.checked) }))}
								/>
							</Form.Field>

							<Form.Field>
								<FieldLabel text={t.field_allowLocalHttp} tip={t.field_allowLocalHttp_tip} />
								<Form.Checkbox
									label={t.field_allowLocalHttp}
									checked={draft.allowLocalHttp}
									onChange={(_, data) => setDraft((d) => ({ ...d, allowLocalHttp: Boolean(data.checked) }))}
									data-testid="provider-allow-local-http"
								/>
							</Form.Field>

							<Form.Field>
								<FieldLabel text={t.field_extraHeaders} tip={t.field_extraHeaders_tip} />
								{draft.extraHeaders.map((entry) => (
									<div key={entry.id} className={s.extraHeaderRow}>
										<input
											className={s.extraHeaderInput}
											placeholder="X-Header"
											value={entry.name}
											onChange={(e) => updateExtraHeader(entry.id, { name: e.currentTarget.value })}
										/>
										<input
											className={s.extraHeaderInput}
											placeholder="value"
											value={entry.value}
											onChange={(e) => updateExtraHeader(entry.id, { value: e.currentTarget.value })}
										/>
										<Button
											icon
											type="button"
											basic
											size="mini"
											inverted={isDark}
											onClick={() => removeExtraHeader(entry.id)}
											title={t.pane_deleteHeader}
											aria-label={t.pane_deleteHeader}
										>
											<Icon name="trash" />
										</Button>
									</div>
								))}
								<Button
									type="button"
									basic
									size="mini"
									inverted={isDark}
									onClick={addExtraHeader}
								>
									<Icon name="add" />
									{t.field_addHeader}
								</Button>
							</Form.Field>

							<Form.Field>
								<FieldLabel text={t.field_customInstructions} tip={t.field_customInstructions_tip} />
								<SystemPromptSection
									isDark={isDark}
									value={systemPrompt}
									onSave={onSaveSystemPrompt}
								/>
							</Form.Field>
						</div>
					) : null}

					{isDraftValid(draft) ? (
						<TestConnectionButton provider={probeProvider} isDark={isDark} />
					) : (
						<div className={s.fieldHint}>{t.field_fillToTest}</div>
					)}
				</Form>
			</Modal.Content>
			<Modal.Actions style={modalActionsSurface(isDark)}>
				<Button basic inverted={isDark} onClick={onClose}>{t.ai_cancel}</Button>
				<Button primary disabled={!canSubmit} onClick={() => void handleSubmit()}>
					{editing ? t.ai_save : t.ai_addConnectionBtn}
				</Button>
			</Modal.Actions>
		</Modal>
	)
}
