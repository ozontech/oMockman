import React, { useMemo } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { Button, Form, Icon } from 'semantic-ui-react'

import panesS from './add-mock-panes.module.scss'
import { buildBodyDiagnostics, GenerateSplitButton } from './body-editor-tools'

import { useChromeStore, useGlobalStore, useLogStore, useSendStore } from '@/panel/app/store'
import { requestFromMock } from '@/panel/app/service/send-request'
import { getActiveEnvVars } from '@/services/env'
import { AutoResizeCodeMirror } from '@/panel/app/common/auto-resize-codemirror'
import type { AutoResizeCodeMirrorHandle } from '@/panel/app/common/auto-resize-codemirror'
import type { IBuildAddMockPanesAIOptions } from '@/interface/ai'
import type { IMockResponseRaw } from '@/interface/mock'
import type { OpenApiValidationState } from '@/interface/openapi'
import { canPatchMethod, requestPatchProblem } from '@/services/request-patch'
import { prettifyJson } from '@/services/json'

interface RequestPatchPaneProps {
	values: IMockResponseRaw
	setValues: Dispatch<SetStateAction<IMockResponseRaw>>
	isDark: boolean
	/** The switch is off: nothing can be typed, formatted or generated. */
	disabled?: boolean
	validation: OpenApiValidationState
	ai: IBuildAddMockPanesAIOptions
	editorRef: React.RefObject<AutoResizeCodeMirrorHandle>
}

/**
 * The body sent to the server in place of the page's one. Schema issues are shown but never block
 * saving: an invalid body is a legitimate test of the server's validation.
 */
export const RequestPatchPane: React.FC<RequestPatchPaneProps> = ({
	values,
	setValues,
	isDark,
	disabled,
	validation,
	ai,
	editorRef,
}) => {
	const t = useGlobalStore((s) => s.t)
	const store = useChromeStore((s) => s.store)
	const openSend = useSendStore((s) => s.openSend)
	const patch = values.requestPatch
	// Both parse the body: once per edit, not on every render of the form (each new log renders it).
	const problem = useMemo(() => (patch ? requestPatchProblem(patch) : null), [patch])
	const problemText = problem === 'invalid_json'
		? t.pane_requestPatchInvalidJson
		: problem === 'not_object'
			? t.pane_requestPatchNotObject
			: problem === 'too_large'
				? t.pane_requestPatchTooLarge
				: ''
	const warning = problemText || (canPatchMethod(String(values.method ?? 'GET')) ? '' : t.pane_requestPatchNoBodyMethod)
	const { diagnostics, summary } = useMemo(() => buildBodyDiagnostics(validation, patch?.body), [validation, patch?.body])

	const setBody = (update: (body: string) => string) =>
		setValues((prev) => ({
			...prev,
			requestPatch: { mode: prev.requestPatch?.mode ?? 'replace', body: update(prev.requestPatch?.body ?? '') },
		}))

	return (
		<Form.Field>
			<div className={panesS.responseHeaderRow}>
				<label>
					{t.pane_tabRequestBody}
					{summary ? <span className={panesS.responseHeaderMeta}>{summary}</span> : null}
				</label>
				<div className={panesS.responseHeaderActions}>
					<Button
						size="mini"
						type="button"
						basic
						inverted={isDark}
						disabled={disabled || !values.url}
						title={t.pane_sendNow}
						onClick={(event) => {
							const { request, headersFrom } = requestFromMock(values, useLogStore.getState().logs, getActiveEnvVars(store))
							openSend(request, event.currentTarget.ownerDocument.body, headersFrom)
						}}
						data-testid="request-send-now"
					>
						<Icon name="paper plane" />
						{t.pane_sendNow}
					</Button>
					<GenerateSplitButton isDark={isDark} ai={ai} />
					<Button size="mini" type="button" basic inverted={isDark} disabled={disabled} onClick={() => setBody(prettifyJson)}>
						{t.pane_format}
					</Button>
					<Button
						size="mini"
						type="button"
						icon
						basic
						inverted={isDark}
						disabled={disabled}
						onClick={() => editorRef.current?.openFind()}
						title={t.pane_find}
						aria-label={t.pane_find}
					>
						<Icon name="search" />
					</Button>
				</div>
			</div>
			{warning && !disabled ? (
				<div className={panesS.aiError} data-testid="request-patch-problem">
					<Icon name="exclamation triangle" />
					<div className={panesS.aiErrorBody}>
						<span>{warning}</span>
					</div>
				</div>
			) : null}
			{ai.error && !disabled ? (
				<div className={panesS.aiError}>
					<Icon name="exclamation triangle" />
					<div className={panesS.aiErrorBody}>
						<span>{ai.error}</span>
						{ai.errorTraceId ? <span className={panesS.aiErrorTrace}>trace ID: {ai.errorTraceId}</span> : null}
					</div>
				</div>
			) : null}
			<div className={`${panesS.editorWrap} ${ai.generating ? panesS.editorGenerating : ''} ${ai.succeeded ? panesS.editorSuccess : ''}`}>
				<AutoResizeCodeMirror
					ref={editorRef}
					value={patch?.body ?? ''}
					isDark={isDark}
					placeholder={t.pane_requestBodyPlaceholder}
					externalDiagnostics={disabled ? undefined : diagnostics}
					readOnly={disabled || ai.generating}
					onChange={(body: string) => setBody(() => body)}
				/>
			</div>
		</Form.Field>
	)
}
