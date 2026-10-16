import React from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { Button, Form, Icon } from 'semantic-ui-react'

import s from './add-mock.module.scss'
import panesS from './add-mock-panes.module.scss'
import { RequestPatchPane } from './request-patch-pane'
import { ApplyPane, ApplyTabLabel } from './apply-tab'
import { buildBodyDiagnostics, GenerateSplitButton } from './body-editor-tools'

import { useGlobalStore } from '@/panel/app/store'
import type { IBuildAddMockPanesAIOptions } from '@/interface/ai'
import type { OpenApiValidationState } from '@/interface/openapi'
import { AutoResizeCodeMirror } from '@/panel/app/common/auto-resize-codemirror'
import type { AutoResizeCodeMirrorHandle } from '@/panel/app/common/auto-resize-codemirror'
import type { IMockResponseRaw } from '@/interface/mock'
import { prettifyJson } from '@/services/json'
import { exceedsBodyLimit, formatBytes, MAX_BODY_BYTES, utf8ByteLength } from '@/services/body-limits'
import { resolveMockApply, toggleMockApply } from '@/services/mock-apply'
import type { MockApplyPart } from '@/services/mock-apply'

/** The order of the tabs below. */
export const APPLY_TAB_INDEX: Record<MockApplyPart, number> = { responseBody: 0, responseHeaders: 1, requestBody: 2 }

/** What the request body tab has besides the values: its schema check, its generator and its editor. */
export interface RequestBodyTools {
	validation: OpenApiValidationState
	ai: IBuildAddMockPanesAIOptions
	editorRef: React.RefObject<AutoResizeCodeMirrorHandle>
}

export function buildAddMockPanes(
	values: IMockResponseRaw,
	setValues: Dispatch<SetStateAction<IMockResponseRaw>>,
	addHeader: () => void,
	removeHeader: (idx: number) => void,
	isDark: boolean,
	onHeaderNameChange: (idx: number) => (_: unknown, data: { value: unknown }) => void,
	onHeaderValueChange: (idx: number) => (_: unknown, data: { value: unknown }) => void,
	responseEditorRef: React.RefObject<AutoResizeCodeMirrorHandle>,
	openApiValidation: OpenApiValidationState,
	ai: IBuildAddMockPanesAIOptions,
	request: RequestBodyTools,
	selectTab: (index: number) => void,
) {
	const { diagnostics: openApiDiagnostics, summary: diagnosticsSummary } = buildBodyDiagnostics(openApiValidation, values.response)

	const t = useGlobalStore.getState().t

	const apply = resolveMockApply(values)
	const setPart = (part: MockApplyPart, on: boolean) => {
		setValues((prev) => ({
			...prev,
			apply: toggleMockApply(resolveMockApply(prev), part, on),
			requestPatch: part === 'requestBody' && on && !prev.requestPatch ? { mode: 'replace', body: '' } : prev.requestPatch,
		}))
		if (on) selectTab(APPLY_TAB_INDEX[part])
	}
	const tabLabel = (part: MockApplyPart, label: string, testId: string) => ({
		key: testId,
		content: <ApplyTabLabel label={label} on={apply[part]} onToggle={(on) => setPart(part, on)} testId={testId} />,
	})

	const responseLimitError = values.responseTooLargeBytes != null && !values.response?.trim()
		? t.pane_responseNotCaptured(
			values.responseTooLargeBytes ? formatBytes(values.responseTooLargeBytes) : '',
			formatBytes(MAX_BODY_BYTES),
		)
		: exceedsBodyLimit(values.response ?? '')
			? t.pane_responseTooLarge(formatBytes(utf8ByteLength(values.response ?? '')), formatBytes(MAX_BODY_BYTES))
			: ''

	return [
		{
			menuItem: tabLabel('responseBody', t.pane_tabResponse, 'response-body'),
			render: () => (
				<ApplyPane key="response-body" isDark={isDark} on={apply.responseBody}>
					<Form.Field>
						<div className={panesS.responseHeaderRow}>
							<label>
								{t.pane_responseLabel}
								{diagnosticsSummary ? (
									<span className={panesS.responseHeaderMeta}>{diagnosticsSummary}</span>
								) : null}
							</label>
							<div className={panesS.responseHeaderActions}>
								<GenerateSplitButton isDark={isDark} ai={ai} />
								<Button
									size="mini"
									type="button"
									basic
									inverted={isDark}
									onClick={() => {
										const formatted = prettifyJson(values.response || '')
										setValues((prev) => ({ ...prev, response: formatted }))
									}}
								>
									{t.pane_format}
								</Button>
								<Button
									size="mini"
									type="button"
									icon
									basic
									inverted={isDark}
									onClick={() => responseEditorRef.current?.openFind()}
									title={t.pane_find}
									aria-label={t.pane_find}
								>
									<Icon name="search" />
								</Button>
							</div>
						</div>
						{responseLimitError ? (
							<div className={panesS.aiError} data-testid="response-too-large">
								<Icon name="exclamation triangle" />
								<div className={panesS.aiErrorBody}>
									<span>{responseLimitError}</span>
								</div>
							</div>
						) : null}
						{ai.error ? (
							<div className={panesS.aiError}>
								<Icon name="exclamation triangle" />
								<div className={panesS.aiErrorBody}>
									<span>{ai.error}</span>
									{ai.errorTraceId ? (
										<span className={panesS.aiErrorTrace}>trace ID: {ai.errorTraceId}</span>
									) : null}
								</div>
							</div>
						) : null}
						<div className={`${panesS.editorWrap} ${ai.generating ? panesS.editorGenerating : ''} ${ai.succeeded ? panesS.editorSuccess : ''}`}>
							<AutoResizeCodeMirror
								ref={responseEditorRef}
								value={values.response ?? ''}
								isDark={isDark}
								placeholder="Enter valid JSON or leave empty"
								externalDiagnostics={openApiDiagnostics}
								readOnly={ai.generating || !apply.responseBody}
								onChange={(val: string) => setValues((prev) => ({ ...prev, response: val, responseTooLargeBytes: undefined }))}
							/>
						</div>
					</Form.Field>
					</ApplyPane>
			),
		},
		{
			menuItem: tabLabel('responseHeaders', t.pane_tabHeaders, 'response-headers'),
			render: () => (
				<ApplyPane key="response-headers" isDark={isDark} on={apply.responseHeaders}>
					<div className={s.headersAddBtnWrap}>
						<Button
							type="button"
							size="mini"
							basic
							inverted={isDark}
							icon
							onClick={addHeader}
							className={panesS.addHeaderBtn}
						>
							<Icon name="add" /> {t.pane_addHeader}
						</Button>
					</div>
					<div className={s.headersRow}>
						{Array.isArray(values.headers) &&
							values.headers.map((h: { name: string; value: string }, i: number) => (
								<Form.Group key={i} style={{ alignItems: 'center', marginBottom: '8px' }}>
									<Form.Field className={s.headerField}>
										<Form.Input
											required
											placeholder={t.pane_headerNamePlaceholder}
											name={`headerName${i}`}
											value={h.name}
											onChange={onHeaderNameChange(i)}
										/>
									</Form.Field>
									<Form.Field className={`${s.headerField} ${s.valueField}`}>
										<Form.Input
											required
											placeholder={t.pane_headerValuePlaceholder}
											name={`headerValue${i}`}
											value={h.value}
											onChange={onHeaderValueChange(i)}
										/>
									</Form.Field>
									<Form.Field className={s.headerRemove}>
										<Button
											type="button"
											size="mini"
											basic
											inverted={isDark}
											color="red"
											icon
											onClick={() => removeHeader(i)}
											tabIndex={-1}
											title={t.pane_deleteHeader}
											style={{ color: '#e06c75' }}
										>
											<Icon name="trash" />
										</Button>
									</Form.Field>
								</Form.Group>
							))}
					</div>
					</ApplyPane>
			),
		},
		{
			menuItem: tabLabel('requestBody', t.pane_tabRequestBody, 'request-body'),
			render: () => (
				<ApplyPane key="request-body" isDark={isDark} on={apply.requestBody}>
						<RequestPatchPane
							values={values}
							setValues={setValues}
							isDark={isDark}
							disabled={!apply.requestBody}
							validation={request.validation}
							ai={request.ai}
							editorRef={request.editorRef}
						/>
					</ApplyPane>
			),
		},
	]
}
