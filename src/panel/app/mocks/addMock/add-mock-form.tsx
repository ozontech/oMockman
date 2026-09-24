import React, { useCallback, useMemo, useRef, useState } from 'react'
import { Button, Form, Segment, Tab, Icon } from 'semantic-ui-react'

import { useGlobalStore } from '../../store'
import type { useChromeStoreState } from '../../store'

import { StatusToggle } from './controls'
import s from './add-mock.module.scss'
import { isAddMockFormValid } from './utils'
import { useAddMockFormState } from './hooks/use-add-mock-form-state'
import { useOpenApiValidation } from './hooks/use-openapi-validation'
import { useAIGeneration } from './hooks/use-ai-generation'

import { safeNumberInt } from '@/services/number'
import { SideDrawerHeader } from '@/panel/app/blocks'
import type { AutoResizeCodeMirrorHandle } from '@/panel/app/common/auto-resize-codemirror'
import { MethodEnum } from '@/interface/network'
import { isJsonValid } from '@/services/json'
import { getActiveEnvVars } from '@/services/env'
import { UrlTemplateInput } from '@/panel/app/mocks/addMock/url-template-input'
import { OpenApiUrlField } from '@/panel/app/mocks/addMock/openapi-url-field'
import { buildAddMockPanes } from '@/panel/app/mocks/addMock/add-mock-panes'
import { RequestSettingsRow } from '@/panel/app/mocks/addMock/request-settings-row'
import { submitMock } from '@/panel/app/mocks/addMock/submit-mock'
import type { AIGenerationMode } from '@/interface/ai'
import { getAISettings } from '@/services/ai'

export const AddMockForm: React.FC<
	Pick<
		useChromeStoreState,
		'store' | 'selectedMock' | 'setSelectedMock' | 'setStoreProperties'
	> & {
		isDetached?: boolean
		onToggleDetach?: (detached: boolean) => void
		onClose?: () => void
	}
> = ({ store, selectedMock, setSelectedMock, setStoreProperties, isDetached, onToggleDetach, onClose }) => {
	const handleClose = onClose ?? (() => setSelectedMock(undefined))
	const tab = useGlobalStore((s) => s.meta.tab)
	const isDark = useGlobalStore((s) => s.resolvedScheme === 'dark')
	const t = useGlobalStore((s) => s.t)
	const [openApiSuggestOpen, setOpenApiSuggestOpen] = useState(false)
	const [openApiBaseValue, setOpenApiBaseValue] = useState<string | null>(null)
	const openApiInputRef = useRef<HTMLInputElement>(null)

	const openApiSuggestions = useMemo(() => {
		const seen = new Set<string>()
		const results: Array<{ url: string; label: string }> = []
		for (const mock of store.mocks) {
			const u = mock.openApiUrl?.trim()
			if (u && !seen.has(u)) {
				seen.add(u)
				results.push({ url: u, label: u })
			}
		}
		return results
	}, [store.mocks])

	const mockingEnabled = store.active
	const selectedCollectionOpenApiUrl = useMemo(() => {
		const collectionId = selectedMock?.collectionId
		if (!collectionId) return ''
		return String(store.collectionTree.nodes[collectionId]?.openApiUrl ?? '').trim()
	}, [store.collectionTree.nodes, selectedMock?.collectionId])
	const responseEditorRef = React.useRef<AutoResizeCodeMirrorHandle>(null as unknown as AutoResizeCodeMirrorHandle)

	const {
		values,
		setValues,
		statusInput,
		setStatusInput,
		formKey,
	} = useAddMockFormState({
		selectedMock,
		selectedCollectionOpenApiUrl,
	})

	const filteredSuggestions = useMemo(() => {
		const current = (values.openApiUrl ?? '').trim()
		const base = (openApiBaseValue ?? '').trim()
		const typed = current.toLowerCase()
		// Show everything except what is already in the field.
		// Filter by substring only once the user has typed something after focus.
		return openApiSuggestions.filter((item) => {
			if (item.url === current) return false
			if (current !== base && current) return item.url.toLowerCase().includes(typed)
			return true
		})
	}, [openApiSuggestions, values.openApiUrl, openApiBaseValue])

	const handleOpenApiSuggestSelect = useCallback((url: string) => {
		setValues((prev) => ({ ...prev, openApiUrl: url }))
		setOpenApiSuggestOpen(false)
		openApiInputRef.current?.blur()
	}, [setValues])

	const openApiValidation = useOpenApiValidation({
		openApiUrl: values.openApiUrl,
		requestUrl: values.url,
		method: values.method,
		status: values.status,
		responseBody: values.response,
	})

	const aiSettings = useMemo(() => getAISettings(store), [store])
	const aiGate = useMemo(() => {
		const active = aiSettings.providers.find((p) => p.id === aiSettings.activeProviderId)
		if (!aiSettings.providers.length) {
			return { ready: false, reason: t.ai_gate_setup }
		}
		if (!active) {
			return { ready: false, reason: t.ai_gate_pick }
		}
		if (!active.apiKey.trim()) {
			return { ready: false, reason: t.ai_gate_addKey(active.name) }
		}
		return { ready: true, reason: t.ai_gate_generate(active.name) }
	}, [aiSettings.providers, aiSettings.activeProviderId])

	const errorGate = useMemo(() => {
		const hasSchema = openApiValidation.status === 'ready' && Boolean(openApiValidation.responseSchema)
		const status = safeNumberInt(String(values.status ?? 200)) ?? 200
		const hasErrorStatus = status >= 400 && status < 600
		const reasons: string[] = []
		if (!hasSchema) reasons.push(t.ai_errorMissing_schema)
		if (!hasErrorStatus) reasons.push(t.ai_errorMissing_status)
		return {
			disabled: reasons.length > 0,
			reason: reasons.length ? t.ai_errorDisabled(reasons.join(` ${t.ai_errorJoin} `)) : '',
		}
	}, [openApiValidation.status, openApiValidation.responseSchema, values.status])

	const [aiMode, setAiMode] = useState<AIGenerationMode>('happy')
	// Error mode can become unavailable (status changed, schema gone): fall back to happy.
	const effectiveMode: AIGenerationMode = aiMode === 'error' && errorGate.disabled ? 'happy' : aiMode

	const aiGeneration = useAIGeneration({
		store,
		values,
		openApiOperation: openApiValidation.status === 'ready' ? openApiValidation.responseSchema : undefined,
		onResult: (response) => setValues((prev) => ({ ...prev, response })),
	})

	const isNew = !selectedMock?.id
	const envVars = useMemo(() => getActiveEnvVars(store), [store])

	const addHeader = () =>
		setValues((prev) => ({
			...prev,
			headers: [{ name: '', value: '' }, ...(prev.headers ?? [])],
		}))

	const removeHeader = (idx: number) =>
		setValues((prev) => ({
			...prev,
			headers: (prev.headers ?? []).filter((_, i) => i !== idx),
		}))

	const handleHeaderNameChange = (idx: number) => (
		_: unknown,
		data: { value: unknown },
	): void => {
		setValues((prev) => {
			const list = [...(prev.headers ?? [])] as Array<{ name: string; value: string }>
			list[idx] = { ...list[idx], name: String(data.value) }
			return { ...prev, headers: list }
		})
	}

	const handleHeaderValueChange = (idx: number) => (
		_: unknown,
		data: { value: unknown },
	): void => {
		setValues((prev) => {
			const list = [...(prev.headers ?? [])] as Array<{ name: string; value: string }>
			list[idx] = { ...list[idx], value: String(data.value) }
			return { ...prev, headers: list }
		})
	}

	const canSubmit = useMemo(() => isAddMockFormValid(values), [values])
	const hasResponseSyntaxError = useMemo(() => {
		const raw = String(values.response ?? '').trim()
		if (!raw) return false
		return !isJsonValid(raw)
	}, [values.response])
	const openApiLoading = openApiValidation.status === 'loading'
	const isResponseJsonValidationError = openApiValidation.status === 'error'
		&& /^Response JSON is invalid:/i.test(String(openApiValidation.message ?? ''))
	const openApiError = openApiValidation.status === 'error' && !isResponseJsonValidationError
		? openApiValidation.message
		: ''
	const openApiReady = openApiValidation.status === 'ready'
	const openApiSuggestionsPartial = openApiValidation.status === 'ready' && openApiValidation.suggestionsTruncated
	const hasResponseSchemaErrors = openApiValidation.status === 'ready'
		&& (
			openApiValidation.issues.length > 0
			|| openApiValidation.suggestions.some((suggestion) => suggestion.required)
		)
	const hasResponseValidationErrors = hasResponseSyntaxError || hasResponseSchemaErrors

	const handleSubmit = async () => {
		if (!canSubmit || hasResponseValidationErrors) return
		await submitMock({
			store,
			isNew,
			values,
			tabId: tab?.id,
			setStoreProperties,
			handleClose,
			setSelectedMock,
		})
	}

	return (
		<div className={s.container}>
			<div className={s.content}>
				<SideDrawerHeader>
					<strong className={s.drawerTitle}>
						{isNew ? t.mock_addTitle : t.mock_updateTitle}
					</strong>
					<div className={s.drawerHeaderActions}>
						{onToggleDetach ? (
							<Button
								icon
								type="button"
								basic
								inverted={isDark}
								onClick={() => onToggleDetach(!isDetached)}
								size="mini"
								title={isDetached ? t.mock_attachBack : t.mock_openWindow}
								style={{ color: isDark ? '#ffffff' : undefined }}
							>
								<Icon name={isDetached ? 'window restore' : 'external alternate'} />
							</Button>
						) : null}
						<Button
							icon
							type="button"
							basic
							inverted={isDark}
							color="red"
							onClick={handleClose}
							size="mini"
							title={t.mock_close}
							style={{ color: '#e06c75' }}
						>
							<Icon name="close" />
						</Button>
					</div>
				</SideDrawerHeader>

				<Form
					key={formKey}
					onSubmit={(e) => {
						e.preventDefault()
						void handleSubmit()
					}}
				>
					<Segment
						inverted={isDark}
						className={s.segmentPlain}
					>
						<Form.Group className={s.statusRow}>
							<StatusToggle
								className="status-field"
								active={!!values.active}
								onChange={(active) => setValues((v) => ({ ...v, active }))}
								isDark={isDark}
								disabled={!mockingEnabled && !isNew}
							/>
						</Form.Group>
						<Form.Input
							fluid
							required
							label={t.mock_fieldName}
							placeholder={t.mock_namePlaceholder}
							name="name"
							value={values.name}
							onChange={(_, data) =>
								setValues((prev) => ({ ...prev, name: String(data.value) }))
							}
							className={isDark ? s.darkField : undefined}
						/>

						<Form.TextArea
							label={t.mock_fieldDesc}
							placeholder={t.mock_descPlaceholder}
							name="description"
							value={values.description}
							onChange={(_, data) =>
								setValues((prev) => ({ ...prev, description: String(data.value) }))
							}
							className={isDark ? s.darkTextarea : undefined}
						/>

						<UrlTemplateInput
							isDark={isDark}
							envVars={envVars}
							value={values.url ?? ''}
							onChange={(next) => setValues((prev) => ({ ...prev, url: next }))}
						/>

						<OpenApiUrlField
							isDark={isDark}
							value={values.openApiUrl ?? ''}
							inputRef={openApiInputRef}
							error={openApiError}
							loading={openApiLoading}
							ready={openApiReady}
							suggestionsPartial={openApiSuggestionsPartial}
							suggestions={filteredSuggestions}
							suggestOpen={openApiSuggestOpen}
							onChange={(next) => setValues((prev) => ({ ...prev, openApiUrl: next }))}
							onFocus={() => {
								setOpenApiBaseValue(values.openApiUrl ?? '')
								setOpenApiSuggestOpen(true)
							}}
							onBlur={() => setTimeout(() => {
								setOpenApiSuggestOpen(false)
								setOpenApiBaseValue(null)
							}, 150)}
							onSelectSuggestion={handleOpenApiSuggestSelect}
						/>

						<RequestSettingsRow
							isDark={isDark}
							method={values.method ?? MethodEnum.GET}
							onMethodChange={(method) => setValues((v) => ({ ...v, method }))}
							statusInput={statusInput}
							onStatusInputChange={(next, parsed) => {
								setStatusInput(next)
								setValues((prev) => ({ ...prev, status: parsed ?? 200 }))
							}}
							delay={values.delay}
							onDelayChange={(delay) => setValues((prev) => ({ ...prev, delay }))}
						/>

						<Tab
							menu={{ secondary: true, pointing: true, inverted: isDark }}
							panes={buildAddMockPanes(
								values,
								setValues,
								addHeader,
								removeHeader,
								isDark,
								handleHeaderNameChange,
								handleHeaderValueChange,
								responseEditorRef,
								openApiValidation,
								{
									ready: aiGate.ready,
									reason: aiGate.reason,
									generating: aiGeneration.state.status === 'generating',
									generatingPhase:
										aiGeneration.state.status === 'generating' ? aiGeneration.state.phase : 'initial',
									succeeded: aiGeneration.state.status === 'success',
									error: aiGeneration.state.status === 'error' ? aiGeneration.state.message : '',
									errorTraceId:
										aiGeneration.state.status === 'error' ? aiGeneration.state.traceId : undefined,
									mode: effectiveMode,
									errorDisabled: errorGate.disabled,
									errorReason: errorGate.reason,
									onModeChange: setAiMode,
									onGenerate: () => {
										aiGeneration.clearError()
										void aiGeneration.generate(effectiveMode)
									},
									onCancel: aiGeneration.cancel,
								},
							)}
						/>
					</Segment>
				</Form>
			</div>

			<div className={`${s.stickyFooter} ${isDark ? s.dark : s.light}`}>
				<div>
				</div>
				<div>
					<Button
						type="button"
						color="grey"
						size="small"
						inverted={isDark}
						onClick={handleClose}
						className={s.button}
					>
						{t.mock_close}
					</Button>
					<Button
						type="button"
						primary
						size="small"
						disabled={!canSubmit || hasResponseValidationErrors}
						onClick={() => void handleSubmit()}
						className={s.button}
					>
						{isNew ? t.mock_addBtn : t.mock_updateBtn}
					</Button>
				</div>
			</div>
		</div>
	)
}
