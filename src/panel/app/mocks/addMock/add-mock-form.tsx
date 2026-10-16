import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Form, Segment, Icon } from 'semantic-ui-react'

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
import { APPLY_TAB_INDEX, buildAddMockPanes } from '@/panel/app/mocks/addMock/add-mock-panes'
import { RequestSettingsRow } from '@/panel/app/mocks/addMock/request-settings-row'
import { submitMock } from '@/panel/app/mocks/addMock/submit-mock'
import { AnimatedTabs } from '@/panel/app/common/animated-tabs'
import type { AIGenerationMode } from '@/interface/ai'
import { getAISettings } from '@/services/ai'
import { formatBytes, SCHEMA_CHECK_MAX_CHARS } from '@/services/body-limits'
import { appliesAnything, resolveMockApply } from '@/services/mock-apply'

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

	const mockingEnabled = store.active
	const responseEditorRef = React.useRef<AutoResizeCodeMirrorHandle>(null as unknown as AutoResizeCodeMirrorHandle)

	const {
		values,
		setValues,
		statusInput,
		setStatusInput,
		formKey,
	} = useAddMockFormState({ selectedMock })

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

	const apply = resolveMockApply(values)
	const initialTab = resolveMockApply(selectedMock ?? {}).requestBody ? APPLY_TAB_INDEX.requestBody : APPLY_TAB_INDEX.responseBody
	const [activeTab, setActiveTab] = useState(initialTab)
	useEffect(() => setActiveTab(initialTab), [formKey, initialTab])
	const openApiValidation = useOpenApiValidation({
		openApiUrl: apply.responseBody ? values.openApiUrl : undefined,
		requestUrl: values.url,
		method: values.method,
		status: values.status,
		responseBody: values.response,
	})
	const requestValidation = useOpenApiValidation({
		openApiUrl: apply.requestBody ? values.openApiUrl : undefined,
		requestUrl: values.url,
		method: values.method,
		responseBody: values.requestPatch?.body,
		target: 'request',
	})
	/** The check the OpenAPI field reports on: the body that is on. */
	const activeValidation = apply.requestBody ? requestValidation : openApiValidation

	const aiSettings = useMemo(() => getAISettings(store), [store])
	const aiGate = useMemo(() => {
		const active = aiSettings.providers.find((p) => p.id === aiSettings.activeProviderId)
		if (!aiSettings.providers.length) {
			return { ready: false, reason: t.ai_gate_setup }
		}
		if (!active) {
			return { ready: false, reason: t.ai_gate_pick }
		}
		if (!active.apiKeyMask) {
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

	const requestSchema = requestValidation.status === 'ready' ? requestValidation.responseSchema : undefined
	const requestErrorGate = {
		disabled: !requestSchema,
		reason: requestSchema ? '' : t.ai_errorDisabled(t.ai_errorMissing_schema),
	}
	const [requestAiMode, setRequestAiMode] = useState<AIGenerationMode>('happy')
	const effectiveRequestMode: AIGenerationMode = requestAiMode === 'error' && requestErrorGate.disabled ? 'happy' : requestAiMode
	const requestAiGeneration = useAIGeneration({
		store,
		values,
		openApiOperation: requestSchema,
		target: 'request',
		onResult: (body) => setValues((prev) => ({
			...prev,
			requestPatch: { mode: prev.requestPatch?.mode ?? 'replace', body },
		})),
	})
	const requestEditorRef = React.useRef<AutoResizeCodeMirrorHandle>(null as unknown as AutoResizeCodeMirrorHandle)
	const containerRef = useRef<HTMLDivElement>(null)
	const activeTabRef = useRef(activeTab)
	activeTabRef.current = activeTab

	/**
	 * Ctrl/Cmd+F anywhere in the form searches the body of the open tab: the request body on its tab,
	 * the response body otherwise. Caught before anything else on the page: in DevTools the panel
	 * gets a script that hands Ctrl/Cmd+F to the DevTools search, and it must not get this one.
	 */
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (!(event.ctrlKey || event.metaKey) || String(event.key).toLowerCase() !== 'f') return
			const target = event.target as Node | null
			const inForm = Boolean(target && containerRef.current?.contains(target))
			if (!inForm && target !== document.body) return
			event.preventDefault()
			event.stopPropagation()
			if (activeTabRef.current === APPLY_TAB_INDEX.requestBody) {
				requestEditorRef.current?.openFind()
				return
			}
			setActiveTab(APPLY_TAB_INDEX.responseBody)
			responseEditorRef.current?.openFind()
		}
		window.addEventListener('keydown', onKeyDown, true)
		return () => window.removeEventListener('keydown', onKeyDown, true)
	}, [])

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
	const openApiLoading = activeValidation.status === 'loading'
	const isBodyJsonValidationError = activeValidation.status === 'error'
		&& /^(Response|Request) JSON is invalid:/i.test(String(activeValidation.message ?? ''))
	const openApiError = activeValidation.status === 'error' && !isBodyJsonValidationError
		? activeValidation.message
		: ''
	const openApiReady = activeValidation.status === 'ready'
	const openApiSuggestionsPartial = activeValidation.status === 'ready' && activeValidation.suggestionsTruncated
	const hasResponseValidationErrors = apply.responseBody && hasResponseSyntaxError

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
		<div className={s.container} ref={containerRef}>
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
							data-testid="mock-name-input"
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
							checkSkippedText={activeValidation.status === 'ready' && activeValidation.bodyCheckSkipped
								? t.mock_openApiTooLarge(formatBytes(activeValidation.bodyCheckSkipped), formatBytes(SCHEMA_CHECK_MAX_CHARS))
								: undefined}
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
							statusDisabledReason={apply.responseBody ? undefined : t.pane_statusFromServer}
						/>

						{appliesAnything(apply) ? null : (
							<div className={s.applyNothing} data-testid="apply-nothing">
								<Icon name="exclamation triangle" />
								<span>{t.pane_applyNothing}</span>
							</div>
						)}

						<AnimatedTabs
							activeIndex={activeTab}
							onActiveIndexChange={setActiveTab}
							isDark={isDark}
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
								{
									validation: requestValidation,
									editorRef: requestEditorRef,
									ai: {
										target: 'request',
										ready: aiGate.ready && apply.requestBody,
										reason: aiGate.reason,
										generating: requestAiGeneration.state.status === 'generating',
										generatingPhase:
											requestAiGeneration.state.status === 'generating' ? requestAiGeneration.state.phase : 'initial',
										succeeded: requestAiGeneration.state.status === 'success',
										error: requestAiGeneration.state.status === 'error' ? requestAiGeneration.state.message : '',
										errorTraceId:
											requestAiGeneration.state.status === 'error' ? requestAiGeneration.state.traceId : undefined,
										mode: effectiveRequestMode,
										errorDisabled: requestErrorGate.disabled,
										errorReason: requestErrorGate.reason,
										onModeChange: setRequestAiMode,
										onGenerate: () => {
											requestAiGeneration.clearError()
											void requestAiGeneration.generate(effectiveRequestMode)
										},
										onCancel: requestAiGeneration.cancel,
									},
								},
								setActiveTab,
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
						data-testid="mock-save-button"
					>
						{isNew ? t.mock_addBtn : t.mock_updateBtn}
					</Button>
				</div>
			</div>
		</div>
	)
}
