import { buildErrorResponse, classifyHttpError, classifyThrownError } from './ai-errors'

import { checkOutboundUrl, isLoopbackHost, readTextCapped } from '@/services/net-guard'
import type {
	AIChatResponse,
	IAIChatRequestBody,
	IAIChatRequestOptions,
	IAIMessage,
	IAIProviderConfig,
	IOpenAIChatCompletionResponse,
} from '@/interface/ai'

const DEFAULT_AUTH_HEADER = 'Authorization'
const DEFAULT_AUTH_PREFIX = 'Bearer '
const DEFAULT_TEMPERATURE = 0.7
const DEFAULT_MAX_TOKENS = 8000
const REQUEST_TIMEOUT_MS = 60_000
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024

const TRACE_HEADER_CANDIDATES = ['x-o3-trace-id', 'x-request-id', 'x-trace-id'] as const

function readTraceId(headers: Headers): string | undefined {
	for (const name of TRACE_HEADER_CANDIDATES) {
		const value = headers.get(name)
		if (value) return value
	}
	return undefined
}

function buildHeaders(provider: IAIProviderConfig): Record<string, string> {
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		Accept: 'application/json',
	}

	const authHeader = provider.authHeader?.trim() || DEFAULT_AUTH_HEADER
	const authPrefix = provider.authPrefix ?? DEFAULT_AUTH_PREFIX
	headers[authHeader] = `${authPrefix}${provider.apiKey}`

	for (const entry of provider.extraHeaders ?? []) {
		const name = entry.name?.trim()
		if (!name) continue
		headers[name] = entry.value ?? ''
	}

	return headers
}

function hasNonLatin1(text: string): boolean {
	for (let i = 0; i < text.length; i += 1) {
		if (text.charCodeAt(i) > 0xff) return true
	}
	return false
}

function findNonLatin1Header(headers: Record<string, string>): string | null {
	for (const [name, value] of Object.entries(headers)) {
		if (hasNonLatin1(name) || hasNonLatin1(value)) return name
	}
	return null
}

function resolveEndpoint(baseURL: string): string {
	const trimmed = baseURL.replace(/\/+$/, '')
	return `${trimmed}/chat/completions`
}

function buildRequestBody(
	provider: IAIProviderConfig,
	messages: IAIMessage[],
	options: IAIChatRequestOptions | undefined,
): IAIChatRequestBody {
	const body: IAIChatRequestBody = {
		model: options?.model ?? provider.model,
		messages,
		temperature: options?.temperature ?? provider.temperature ?? DEFAULT_TEMPERATURE,
		max_tokens: options?.maxTokens ?? provider.maxTokens ?? DEFAULT_MAX_TOKENS,
	}

	const wantsJson = options?.jsonMode ?? false
	if (wantsJson && provider.supportsJsonMode !== false) {
		body.response_format = { type: 'json_object' }
	}

	return body
}

function validateProvider(provider: IAIProviderConfig): string | null {
	if (!provider.baseURL?.trim()) return 'Provider baseURL is empty'
	if (!provider.apiKey?.trim()) return 'Provider apiKey is empty'
	if (!provider.model?.trim()) return 'Provider model is empty'

	// https only: the key travels in a header. Local http needs an explicit opt-in.
	const allowLocal = provider.allowLocalHttp === true
	const checked = checkOutboundUrl(provider.baseURL, {
		allowInsecureHttp: allowLocal,
		allowLoopback: allowLocal,
	})
	if (!checked.ok) {
		switch (checked.reason) {
			case 'invalid_url':
				return 'Provider baseURL must be a valid URL'
			case 'unsupported_protocol':
				return 'Only https (or http on localhost) baseURL is supported'
			case 'insecure_http':
				return 'Server URL must use https. Enable "Allow local http endpoint" to use a model server on localhost.'
			case 'private_host':
				return 'Server URL points to a private or local address. Enable "Allow local http endpoint" for a local model server.'
		}
	}
	if (allowLocal && checked.ok && checked.url.protocol === 'http:' && !isLoopbackHost(checked.url.hostname)) {
		return 'Plain http is only allowed for localhost endpoints'
	}
	return null
}

// Only the start of an error body is shown or scanned for hints.
const MAX_ERROR_BODY_BYTES = 64 * 1024

async function safeReadText(response: Response): Promise<string> {
	try {
		return await readTextCapped(response, MAX_ERROR_BODY_BYTES)
	} catch {
		return ''
	}
}

function extractContent(payload: IOpenAIChatCompletionResponse): string {
	const choice = payload.choices?.[0]
	return choice?.message?.content ?? ''
}

/**
 * Performs one request against an OpenAI-compatible API.
 */
export async function chatCompletion(
	provider: IAIProviderConfig,
	messages: IAIMessage[],
	options?: IAIChatRequestOptions,
): Promise<AIChatResponse> {
	const misconfig = validateProvider(provider)
	if (misconfig) return buildErrorResponse('provider_misconfigured', misconfig)

	const endpoint = resolveEndpoint(provider.baseURL)
	const headers = buildHeaders(provider)
	const badHeader = findNonLatin1Header(headers)
	if (badHeader) {
		return buildErrorResponse(
			'provider_misconfigured',
			`Header "${badHeader}" contains non-Latin-1 characters (e.g. Cyrillic). API keys and headers must be ASCII — check for accidental localized or invisible characters.`,
		)
	}
	const body = buildRequestBody(provider, messages, options)

	const timeoutController = new AbortController()
	const timeoutTimer = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS)
	const signals = [timeoutController.signal, options?.signal].filter(Boolean) as AbortSignal[]
	const signal = signals.length > 1 && typeof AbortSignal.any === 'function'
		? AbortSignal.any(signals)
		: signals[0]

	let response: Response
	try {
		response = await fetch(endpoint, {
			method: 'POST',
			headers,
			body: JSON.stringify(body),
			signal,
			// A redirect could send the api key to a different host.
			redirect: 'error',
			credentials: 'omit',
			cache: 'no-store',
		})
	} catch (error) {
		clearTimeout(timeoutTimer)
		const code = classifyThrownError(error)
		const message = code === 'aborted'
			? timeoutController.signal.aborted ? 'Request timed out' : 'Request was cancelled'
			: error instanceof Error
				? error.message
				: 'Network error'
		return buildErrorResponse(code, message)
	}

	// The timer stays armed until the body is read: a stalled body must not hang the worker.
	const traceId = readTraceId(response.headers)

	if (!response.ok) {
		const text = await safeReadText(response)
		clearTimeout(timeoutTimer)
		const code = classifyHttpError(response.status, text)
		const trimmed = text.trim().slice(0, 400) || `HTTP ${response.status}`
		return buildErrorResponse(code, trimmed, { status: response.status, traceId })
	}

	let payload: IOpenAIChatCompletionResponse
	try {
		payload = JSON.parse(await readTextCapped(response, MAX_RESPONSE_BYTES)) as IOpenAIChatCompletionResponse
	} catch (error) {
		const message = timeoutController.signal.aborted
			? 'Request timed out'
			: error instanceof Error ? error.message : 'Failed to parse response JSON'
		return buildErrorResponse('bad_response', message, { status: response.status, traceId })
	} finally {
		clearTimeout(timeoutTimer)
	}

	const content = extractContent(payload)
	if (!content) {
		return buildErrorResponse('bad_response', 'Empty completion in response', {
			status: response.status,
			traceId,
		})
	}

	if (payload.choices?.[0]?.finish_reason === 'length') {
		return buildErrorResponse('response_truncated', 'Response was cut off by the token limit', {
			status: response.status,
			traceId,
		})
	}

	return {
		ok: true,
		content,
		model: payload.model ?? body.model,
		usage: payload.usage
			? {
				promptTokens: payload.usage.prompt_tokens ?? 0,
				completionTokens: payload.usage.completion_tokens ?? 0,
				totalTokens: payload.usage.total_tokens ?? 0,
			}
			: undefined,
		traceId,
	}
}
