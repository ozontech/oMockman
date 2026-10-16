import type { ICollectionNode } from './collection'
import type { IMockResponseRaw, IStore } from './mock'
import type { RecordLike } from './openapi'

import type { OmitStrict } from '@/interface/utility'

/**
 * Types for AI mock generation.
 * Works with any OpenAI-compatible API: public, corporate or local.
 * Keys are kept by the service worker apart from the store (see background/secrets.ts) and are
 * only ever sent to the origin they were entered for. The panel sees a mask of a key, not the key.
 */

export type AIRoleType = 'system' | 'user' | 'assistant'

export interface IAIMessage {
	role: AIRoleType
	content: string
}

/**
 * One AI connection. Several can be configured and switched between.
 * The id is generated on creation and is the stable identifier everywhere.
 */
export interface IAIProviderConfig {
	id: string
	name: string
	baseURL: string
	/** A mask of the saved key, e.g. `sk-…a1b2`; unset while no key is saved. */
	apiKeyMask?: string
	model: string
	/** Defaults to 'Authorization'. Some gateways use 'x-api-key', 'api-key' etc. */
	authHeader?: string
	/** Defaults to 'Bearer '. Some providers expect no prefix at all. */
	authPrefix?: string
	/** Arbitrary extra headers (project id, org id, beta flags, ...). */
	extraHeaders?: Array<{ name: string; value: string }>
	temperature?: number
	maxTokens?: number
	/** The provider supports OpenAI `response_format: { type: 'json_object' }`. */
	supportsJsonMode?: boolean
	/** The provider supports SSE streaming. Reserved for later. */
	supportsStreaming?: boolean
	/** Allows plain http to a localhost endpoint. */
	allowLocalHttp?: boolean
	/**
	 * Shell commands that produce the key (for example a CLI call).
	 * Shown with a copy button next to the key field.
	 */
	setupHint?: string
	createdOn: number
}

/** What the service worker hands to the AI client: the config plus the key it keeps. */
export type IAIProviderWithKey = IAIProviderConfig & { apiKey: string }

export interface IAISettings {
	enabled: boolean
	activeProviderId: string | null
	providers: IAIProviderConfig[]
	/** Optional global system prompt applied to every generation. */
	globalSystemPrompt?: string
}

/**
 * Options for a single model request.
 */
export interface IAIChatRequestOptions {
	/** Overrides the provider default. */
	temperature?: number
	/** Overrides the provider default. */
	maxTokens?: number
	/** Overrides the provider's model. */
	model?: string
	/** Ask for strict JSON output where the provider supports it. */
	jsonMode?: boolean
	signal?: AbortSignal
}

/** A successful chat completion. */
export interface IAIChatResponseOk {
	ok: true
	content: string
	model: string
	usage?: {
		promptTokens: number
		completionTokens: number
		totalTokens: number
	}
	/** Trace id reported by the provider. */
	traceId?: string
}

export type AIErrorCode =
	| 'token_invalid'
	| 'rate_limited'
	| 'network'
	| 'bad_response'
	| 'response_truncated'
	| 'aborted'
	| 'provider_misconfigured'
	| 'unknown'

export interface IAIChatResponseError {
	ok: false
	error: {
		code: AIErrorCode
		message: string
		status?: number
		traceId?: string
	}
}

export type AIChatResponse = IAIChatResponseOk | IAIChatResponseError

export type AIGenerationMode = 'happy' | 'corner' | 'error'

/** What the model writes: the mock response, or the request body sent to the server. */
export type AIGenerationTarget = 'response' | 'request'

export interface IBuildPromptInput {
	mock: IMockResponseRaw
	/** Generation mode: clean data / corner cases / error response. */
	mode?: AIGenerationMode
	/** Retry after the token limit cut the answer off: ask for something shorter. */
	compactRetry?: boolean
	/** Containing collection, if any, for collection-level prompt rules. */
	collection?: ICollectionNode
	/** Global system prompt from the AI settings. */
	globalSystemPrompt?: string
	openApiOperation?: RecordLike
	/** Defaults to the response. */
	target?: AIGenerationTarget
}

export interface IOpenAIChatCompletionResponse {
	model?: string
	choices?: Array<{
		message?: { content?: string | null }
		/** "length" - cut off by the token limit; "stop" - finished normally. */
		finish_reason?: string | null
	}>
	usage?: {
		prompt_tokens?: number
		completion_tokens?: number
		total_tokens?: number
	}
}

export interface IAIChatRequestBody {
	model: string
	messages: IAIMessage[]
	temperature: number
	max_tokens: number
	response_format?: { type: 'json_object' }
}

export type AIGenerationPhase = 'initial' | 'retrying'

export type AIGenerationState =
	| { status: 'idle' }
	| { status: 'generating'; phase: AIGenerationPhase }
	| { status: 'success' }
	| { status: 'error'; message: string; traceId?: string }

export interface IUseAIGenerationInput {
	store: IStore
	values: IMockResponseRaw
	openApiOperation?: RecordLike
	target?: AIGenerationTarget
	onResult: (response: string) => void
}

export interface IUseAIGenerationResult {
	state: AIGenerationState
	generate: (mode?: AIGenerationMode) => Promise<void>
	cancel: () => void
	clearError: () => void
}

export interface IBuildAddMockPanesAIOptions {
	ready: boolean
	reason: string
	generating: boolean
	generatingPhase: AIGenerationPhase
	/** Short-lived success state: flashes the field and the button. */
	succeeded: boolean
	error: string
	errorTraceId?: string
	mode: AIGenerationMode
	errorDisabled: boolean
	errorReason: string
	/** The request body gets its own mode descriptions. */
	target?: AIGenerationTarget
	onModeChange: (mode: AIGenerationMode) => void
	onGenerate: () => void
	onCancel: () => void
}

/**
 * What a JSON preset may carry.
 */
export type PresetImport = Pick<
	IAIProviderConfig,
	'name' | 'baseURL' | 'model'
> & Partial<Pick<
	IAIProviderConfig,
	| 'authHeader'
	| 'authPrefix'
	| 'extraHeaders'
	| 'temperature'
	| 'maxTokens'
	| 'supportsJsonMode'
	| 'supportsStreaming'
	| 'setupHint'
>>

export type ProviderInput = OmitStrict<IAIProviderConfig, 'id' | 'createdOn'>
export type ProviderPatch = Partial<ProviderInput>

export type ProviderSubmitInput = Pick<IAIProviderConfig,
	| 'name' | 'baseURL' | 'model'
	| 'authHeader' | 'authPrefix' | 'extraHeaders'
	| 'temperature' | 'maxTokens' | 'supportsJsonMode' | 'supportsStreaming'
	| 'allowLocalHttp' | 'setupHint'
> & {
	/** A key typed into the form; empty keeps the saved one. */
	apiKey: string
}

export type ProviderDraft = {
	name: string
	baseURL: string
	apiKey: string
	model: string
	authHeader: string
	authPrefix: string
	temperature: string
	maxTokens: string
	supportsJsonMode: boolean
	supportsStreaming: boolean
	allowLocalHttp: boolean
	extraHeaders: Array<{ id: string; name: string; value: string }>
	/** Comes from a preset; not user editable, preserved on edits. */
	setupHint?: string
}

export interface IProviderFormProps {
	open: boolean
	onClose: () => void
	onSubmit: (provider: ProviderSubmitInput) => Promise<void>
	editing?: IAIProviderConfig | null
	isDark: boolean
	systemPrompt: string
	onSaveSystemPrompt: (next: string | undefined) => void
}

export type ProviderFormState =
	| { mode: 'closed' }
	| { mode: 'add' }
	| { mode: 'edit'; provider: IAIProviderConfig }

export interface IProvidersListProps {
	providers: IAIProviderConfig[]
	activeProviderId: string | null
	onSelectActive: (id: string) => void
	onEdit: (provider: IAIProviderConfig) => void
	onRemove: (provider: IAIProviderConfig) => void
	isDark: boolean
}

export interface IImportPresetProps {
	open: boolean
	onClose: () => void
	onImport: (preset: PresetImport) => Promise<void>
	isDark: boolean
}

export interface IApiKeyFieldProps {
	value: string
	onChange: (next: string) => void
	/** Mask of the saved key: the field may then stay empty to keep it. */
	savedMask?: string
	/** The saved key belongs to another origin than the URL in the form. */
	needsNewKey?: boolean
}

export interface ISetupHintProps {
	setupHint?: string
}

export interface ISystemPromptSectionProps {
	isDark: boolean
	value: string
	onSave: (next: string | undefined) => void
}

export interface ITestConnectionButtonProps {
	provider: IAIProviderConfig
	/** A key typed into the form just now; without it the saved key of `providerId` is used. */
	apiKey?: string
	providerId?: string
	disabled?: boolean
	isDark?: boolean
}

export type TestConnectionState =
	| { status: 'idle' }
	| { status: 'pending' }
	| { status: 'ok'; durationMs: number; model: string }
	| { status: 'fail'; message: string; traceId?: string }
