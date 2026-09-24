export interface IOpenApiFetchResultOk {
	ok: true
	sourceUrl: string
	spec: Record<string, unknown>
}

export interface IOpenApiFetchResultError {
	ok: false
	error: string
}

export type IOpenApiFetchResult = IOpenApiFetchResultOk | IOpenApiFetchResultError

export interface OpenApiValidationIssue {
	path: string
	message: string
	enumRawValues?: unknown[]
	schemaType?: string | string[]
}

export interface OpenApiValidationSuggestion {
	path: string
	type: string
	required: boolean
	enumValues: string[]
	enumRawValues?: unknown[]
	sampleValue?: unknown
}

export interface OpenApiValidationEnumHint {
	path: string
	enumRawValues: unknown[]
}

export interface OpenApiValidationState {
	status: 'idle' | 'loading' | 'ready' | 'error'
	message: string
	sourceUrl?: string
	issues: OpenApiValidationIssue[]
	suggestions: OpenApiValidationSuggestion[]
	enumHints: OpenApiValidationEnumHint[]
	suggestionsTruncated: boolean
	responseSchema?: RecordLike
}

export type RecordLike = Record<string, unknown>

export interface OpenApiSuggestionCollectContext {
	deadlineTs: number
	truncated: boolean
}
