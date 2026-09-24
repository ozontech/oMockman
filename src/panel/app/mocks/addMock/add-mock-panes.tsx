import React from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { Button, Dropdown, Form, Tab, Icon } from 'semantic-ui-react'
import type { SemanticICONS } from 'semantic-ui-react'

import s from './add-mock.module.scss'
import panesS from './add-mock-panes.module.scss'

import { safeNumberInt } from '@/services/number'
import { useGlobalStore } from '@/panel/app/store'
import type { AIGenerationMode, AIGenerationPhase, IBuildAddMockPanesAIOptions } from '@/interface/ai'
import type { OpenApiValidationState, RecordLike } from '@/interface/openapi'
import { AutoResizeCodeMirror } from '@/panel/app/common/auto-resize-codemirror'
import type { AutoResizeCodeMirrorDiagnostic, AutoResizeCodeMirrorHandle } from '@/panel/app/common/auto-resize-codemirror'
import type { IMockResponseRaw } from '@/interface/mock'
import { prettifyJson } from '@/services/json'
import { exceedsBodyLimit, formatBytes, MAX_BODY_BYTES, utf8ByteLength } from '@/services/body-limits'

const parsePathSegments = (path: string): Array<string | number> => {
	const raw = String(path ?? '').trim()
	if (!raw || raw === '$') return []
	let index = raw.startsWith('$') ? 1 : 0
	const segments: Array<string | number> = []

	while (index < raw.length) {
		const char = raw[index]
		if (char === '.') {
			index += 1
			const start = index
			while (index < raw.length && raw[index] !== '.' && raw[index] !== '[') index += 1
			const key = raw.slice(start, index)
			if (key) segments.push(key)
			continue
		}

		if (char === '[') {
			const close = raw.indexOf(']', index)
			if (close === -1) break
			const token = raw.slice(index + 1, close).trim()
			if (/^\d+$/.test(token)) {
				const parsed = safeNumberInt(token)
				if (parsed != null) segments.push(parsed)
				index = close + 1
				continue
			}
			if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith('\'') && token.endsWith('\''))) {
				try {
					segments.push(JSON.parse(token) as string)
				} catch {
					segments.push(token.slice(1, -1))
				}
			}
			index = close + 1
			continue
		}

		index += 1
	}

	return segments
}

const getValueByPath = (data: unknown, path: string): unknown => {
	const segments = parsePathSegments(path)
	let current: unknown = data
	for (const segment of segments) {
		if (typeof segment === 'number') {
			if (!Array.isArray(current) || segment < 0 || segment >= current.length) return undefined
			current = current[segment]
			continue
		}
		if (typeof current !== 'object' || current === null) return undefined
		current = (current as RecordLike)[segment]
	}
	return current
}

const getPathLeafKey = (path: string): string => {
	const segments = parsePathSegments(path)
	const leaf = segments[segments.length - 1]
	return typeof leaf === 'string' ? leaf : 'field'
}

const buildPathFromSegments = (segments: Array<string | number>): string => {
	if (!segments.length) return '$'
	return segments.reduce<string>((acc, segment) => {
		if (typeof segment === 'number') return `${acc}[${segment}]`
		if (/^[A-Za-z_$][\w$]*$/.test(segment)) return `${acc}.${segment}`
		return `${acc}[${JSON.stringify(segment)}]`
	}, '$')
}

const getParentPath = (path: string): string => {
	const segments = parsePathSegments(path)
	if (segments.length === 0) return '$'
	return buildPathFromSegments(segments.slice(0, -1))
}

const isMissingRequiredMessage = (message: string): boolean => /Missing required field/i.test(message)
const isGenericItemsIssue = (message: string): boolean => /Schema validation failed:\s*items/i.test(message)

const buildSampleByType = (type: string): unknown => {
	if (type === 'string') return 'string'
	if (type === 'integer' || type === 'number') return 0
	if (type === 'boolean') return false
	if (type === 'array') return []
	if (type === 'object') return {}
	return null
}

const resolveSuggestionApplyValue = (hint: OpenApiValidationState['suggestions'][number]): unknown => {
	if (hint.type === 'array' && hint.enumRawValues?.length) return hint.enumRawValues
	if (hint.enumRawValues?.length) return hint.enumRawValues[0]
	if (hint.sampleValue !== undefined) return hint.sampleValue
	if (hint.type) return buildSampleByType(hint.type)
	return null
}

const formatCompactFieldSnippet = (path: string, value: unknown): string => {
	const key = getPathLeafKey(path)
	return `"${key}": ${JSON.stringify(value)}`
}

const stringifyEnumLabel = (value: unknown): string => {
	if (typeof value === 'string') return value
	try {
		return JSON.stringify(value)
	} catch {
		return String(value)
	}
}

const truncateLabel = (label: string, max = 40): string => {
	if (label.length <= max) return label
	return `${label.slice(0, max - 1)}…`
}

const buildEnumPreview = (enumRawValues: unknown[], previewCount = 3): string => {
	if (!enumRawValues.length) return ''
	const shown = enumRawValues.slice(0, previewCount).map((item) => truncateLabel(stringifyEnumLabel(item)))
	const remaining = Math.max(0, enumRawValues.length - shown.length)
	const suffix = remaining > 0 ? ` (+${remaining} more)` : ''
	return `${shown.join(', ')}${suffix}`
}

const buildEnumActions = (enumRawValues: unknown[] | undefined): Array<{ label: string; value: unknown }> | undefined => {
	if (!Array.isArray(enumRawValues) || enumRawValues.length === 0) return undefined
	return enumRawValues.map((value) => ({
		label: truncateLabel(stringifyEnumLabel(value), 32),
		value,
	}))
}

const formatIssueMessage = (issue: OpenApiValidationState['issues'][number]): string => {
	const raw = String(issue.message ?? '').trim()
	if (!raw) return 'Schema validation issue'

	if (/^type mismatch:/i.test(raw)) {
		return raw.replace(/^type mismatch:\s*/i, 'Type mismatch — ')
	}

	if (/^value is not in enum/i.test(raw)) {
		if (issue.enumRawValues?.length) {
			return `Enum mismatch — allowed: ${buildEnumPreview(issue.enumRawValues)}`
		}
		return raw.replace(/^value is not in enum\s*/i, 'Enum mismatch — allowed: ')
	}

	if (/^required property is missing$/i.test(raw)) {
		return 'Missing required field'
	}

	return raw.charAt(0).toUpperCase() + raw.slice(1)
}

const formatSuggestionMessage = (hint: OpenApiValidationState['suggestions'][number]): string => {
	const applyValue = resolveSuggestionApplyValue(hint)
	const snippet = formatCompactFieldSnippet(hint.path, applyValue)
	return hint.required
		? `Apply adds required field ${snippet}`
		: `Apply adds optional field ${snippet}`
}

const buildIssueQuickFix = (
	issue: OpenApiValidationState['issues'][number],
	parsedResponse: unknown,
): AutoResizeCodeMirrorDiagnostic['quickFix'] | undefined => {
	if (!issue.enumRawValues?.length) return undefined
	const schemaType = issue.schemaType
	const schemaIsArray = typeof schemaType === 'string'
		? schemaType === 'array'
		: Array.isArray(schemaType) && schemaType.includes('array')
	const currentValue = getValueByPath(parsedResponse, issue.path)
	const value = schemaIsArray || Array.isArray(currentValue)
		? issue.enumRawValues
		: issue.enumRawValues[0]
	return {
		type: 'set-value',
		path: issue.path,
		value,
		createParents: true,
	}
}

const buildSuggestionQuickFix = (
	hint: OpenApiValidationState['suggestions'][number],
): AutoResizeCodeMirrorDiagnostic['quickFix'] => ({
	type: 'set-value',
	path: hint.path,
	value: resolveSuggestionApplyValue(hint),
	createParents: true,
})

const buildEnumHintQuickFix = (
	hint: OpenApiValidationState['enumHints'][number],
): AutoResizeCodeMirrorDiagnostic['quickFix'] | undefined => {
	if (!hint.enumRawValues.length) return undefined
	return {
		type: 'set-value',
		path: hint.path,
		value: hint.enumRawValues[0],
		createParents: true,
	}
}

const PHRASE_INTERVAL_MS = 1800

const GeneratingLabel: React.FC<{ phase: AIGenerationPhase }> = ({ phase }) => {
	const t = useGlobalStore((s) => s.t)
	const phrases = phase === 'initial' ? t.ai_phrase_generating : t.ai_phrase_retrying
	const [index, setIndex] = React.useState(0)

	// Restart the phrase cycle when the phase changes, so the first phrase
	// belongs to the new phase (e.g. "Optimising…" right after a retry).
	React.useEffect(() => {
		setIndex(0)
		const timer = setInterval(() => {
			setIndex((prev) => (prev + 1) % phrases.length)
		}, PHRASE_INTERVAL_MS)
		return () => clearInterval(timer)
	}, [phrases])

	return <span className={panesS.generatingPhrase}>{phrases[index]}</span>
}

const GenerateSplitButton: React.FC<{ isDark: boolean; ai: IBuildAddMockPanesAIOptions }> = ({ isDark, ai }) => {
	const t = useGlobalStore((s) => s.t)

	const MODE_OPTIONS: Array<{ key: AIGenerationMode; icon: SemanticICONS; text: string; description: string }> = [
		{ key: 'happy', icon: 'magic', text: t.ai_mode_happy, description: t.ai_mode_happy_desc },
		{ key: 'corner', icon: 'random', text: t.ai_mode_corner, description: t.ai_mode_corner_desc },
		{ key: 'error', icon: 'warning circle', text: t.ai_mode_error, description: t.ai_mode_error_desc },
	]

	const current = MODE_OPTIONS.find((opt) => opt.key === ai.mode) ?? MODE_OPTIONS[0]
	const modeItems = MODE_OPTIONS.map((opt) => {
		const isErrorDisabled = opt.key === 'error' && ai.errorDisabled
		return {
			key: opt.key,
			value: opt.key,
			disabled: isErrorDisabled,
			icon: opt.icon,
			text: opt.text,
			title: isErrorDisabled ? ai.errorReason : opt.description,
		}
	})
	return (
		<Button.Group size="mini" className={panesS.generateGroup}>
			{ai.generating ? (
				<Button
					type="button"
					basic
					inverted={isDark}
					className={panesS.generateMain}
					onClick={ai.onCancel}
					title={t.ai_stopGeneration}
				>
					<Icon name="circle notch" loading />
					<GeneratingLabel phase={ai.generatingPhase} />
				</Button>
			) : ai.succeeded ? (
				<Button
					type="button"
					basic
					inverted={isDark}
					className={`${panesS.generateMain} ${panesS.generateDone}`}
					disabled
				>
					<Icon name="check" />
					{t.pane_generated}
				</Button>
			) : (
				<Button
					type="button"
					basic
					inverted={isDark}
					className={panesS.generateMain}
					disabled={!ai.ready}
					onClick={ai.onGenerate}
					title={ai.ready ? t.pane_generateTitle(current.text) : ai.reason}
				>
					<Icon name={current.icon} />
					{t.pane_generate}
				</Button>
			)}
			<Dropdown
				button
				basic
				floating
				className={`button icon ${panesS.modeDropdown} ${isDark ? panesS.modeDropdownDark : ''}`}
				trigger={<React.Fragment />}
				selectOnBlur={false}
				disabled={ai.generating}
				value={ai.mode}
				options={modeItems}
				onChange={(_, data) => ai.onModeChange(data.value as AIGenerationMode)}
				title={t.pane_generateModeTitle(current.text)}
			/>
		</Button.Group>
	)
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
) {
	const openApiDiagnostics: AutoResizeCodeMirrorDiagnostic[] = []
	let parsedResponse: unknown = undefined
	let hasJsonSyntaxError = false
	try {
		parsedResponse = values.response?.trim() ? JSON.parse(values.response) : undefined
	} catch {
		parsedResponse = undefined
		hasJsonSyntaxError = Boolean(values.response?.trim())
	}

	if (openApiValidation.status === 'ready') {
		const issues = openApiValidation.issues.map((issue) => ({
			path: issue.path,
			anchorPath: isMissingRequiredMessage(formatIssueMessage(issue)) ? getParentPath(issue.path) : issue.path,
			message: formatIssueMessage(issue),
			severity: 'error' as const,
			enumActions: buildEnumActions(issue.enumRawValues),
			quickFix: buildIssueQuickFix(issue, parsedResponse),
		}))

		const suggestions = openApiValidation.suggestions.map((hint) => ({
			path: hint.path,
			anchorPath: hint.required ? getParentPath(hint.path) : hint.path,
			message: formatSuggestionMessage(hint),
			severity: hint.required ? ('error' as 'error' | 'warning') : ('warning' as 'error' | 'warning'),
			quickFix: buildSuggestionQuickFix(hint),
			required: hint.required,
		}))

		const requiredSuggestionPaths = new Set(
			suggestions
				.filter((suggestion) => suggestion.required)
				.map((suggestion) => suggestion.path),
		)

		const filteredIssues = issues.filter((issue) => {
			if (isGenericItemsIssue(issue.message)) {
				const itemPrefix = `${issue.path}[`
				const objectPrefix = `${issue.path}.`
				const hasChildIssue = issues.some((candidate) => (
					candidate !== issue
					&& (candidate.path.startsWith(itemPrefix) || candidate.path.startsWith(objectPrefix))
				))
				if (hasChildIssue) return false
			}

			if (!isMissingRequiredMessage(issue.message)) return true
			if (requiredSuggestionPaths.has(issue.path)) return true
			if (!requiredSuggestionPaths.size) return true
			if (issue.path === '$') return false
			const prefix = `${issue.path}.`
			for (const suggestionPath of requiredSuggestionPaths) {
				if (suggestionPath.startsWith(prefix)) return false
			}
			return true
		})

		const issueByPath = new Map(filteredIssues.map((issue) => [issue.path, issue]))
		for (const suggestion of suggestions) {
			const issue = issueByPath.get(suggestion.path)
			if (issue && suggestion.required && isMissingRequiredMessage(issue.message)) {
				const suggestedValue = suggestion.quickFix?.value ?? null
				const compactSuggestion = formatCompactFieldSnippet(suggestion.path, suggestedValue)
				issue.message = `${issue.message}. Apply adds ${compactSuggestion}`
				issue.quickFix = suggestion.quickFix
				issue.anchorPath = suggestion.anchorPath
				continue
			}
			openApiDiagnostics.push({
				path: suggestion.path,
				anchorPath: suggestion.anchorPath,
				message: suggestion.message,
				severity: suggestion.severity,
				quickFix: suggestion.quickFix,
			})
		}

		openApiDiagnostics.push(...filteredIssues)

		const occupiedPaths = new Set(openApiDiagnostics.map((diagnostic) => diagnostic.path))
		for (const hint of openApiValidation.enumHints) {
			if (!hint.path || hint.path === '$' || occupiedPaths.has(hint.path)) continue
			if (!Array.isArray(hint.enumRawValues) || hint.enumRawValues.length === 0) continue
			openApiDiagnostics.push({
				path: hint.path,
				anchorPath: hint.path,
				message: `Enum values available: ${buildEnumPreview(hint.enumRawValues)}`,
				severity: 'warning',
				enumActions: buildEnumActions(hint.enumRawValues),
				quickFix: buildEnumHintQuickFix(hint),
			})
			occupiedPaths.add(hint.path)
		}
	}

	const warningCount = openApiDiagnostics.filter((diagnostic) => diagnostic.severity === 'warning').length
	const errorCount = openApiDiagnostics.filter((diagnostic) => diagnostic.severity !== 'warning').length
		+ (hasJsonSyntaxError ? 1 : 0)
	const diagnosticsSummary = (warningCount + errorCount) > 0
		? `warnings: ${warningCount} errors: ${errorCount}`
		: ''

	const t = useGlobalStore.getState().t

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
			menuItem: t.pane_tabResponse,
			render: () => (
				<Tab.Pane attached={false} inverted={isDark}>
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
								readOnly={ai.generating}
								onChange={(val: string) => setValues((prev) => ({ ...prev, response: val, responseTooLargeBytes: undefined }))}
							/>
						</div>
					</Form.Field>
				</Tab.Pane>
			),
		},
		{
			menuItem: t.pane_tabHeaders,
			render: () => (
				<Tab.Pane attached={false} inverted={isDark}>
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
				</Tab.Pane>
			),
		},
	]
}
