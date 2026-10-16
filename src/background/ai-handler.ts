import { buildErrorResponse, chatCompletion } from '@/services/ai'
import { deleteProviderKey, getProviderKey, setProviderKey } from '@/background/secrets'
import type { KeyLookup } from '@/background/secrets'
import { getStoredAIProvider } from '@/background/store-access'
import { AI_MESSAGE_TYPE } from '@/interface/message'
import type { IAIProviderConfig, IAIProviderWithKey } from '@/interface/ai'
import type {
	AIKeyRuntimeResponse,
	AIRuntimeRequest,
	AIRuntimeResponse,
	IAIChatRuntimeRequest,
	IAIDeleteKeyRuntimeRequest,
	IAISetKeyRuntimeRequest,
	IAITestConnectionRuntimeRequest,
} from '@/interface/message'

/**
 * Handles AI messages from the panel and forwards them to the OpenAI client.
 * The answer is always a structured response, never a thrown error.
 *
 * Keys come from background/secrets.ts only: a message can set a key, never read one, and a
 * saved key is used only for the origin it was entered for.
 */

const TEST_CONNECTION_PROBE_MESSAGE = 'ping'
const TEST_CONNECTION_MAX_TOKENS = 1

const AI_TYPES = new Set<string>(Object.values(AI_MESSAGE_TYPE))

function isAIRuntimeRequest(value: unknown): value is AIRuntimeRequest {
	if (!value || typeof value !== 'object') return false
	const type = (value as { type?: unknown }).type
	return typeof type === 'string' && AI_TYPES.has(type)
}

function describeKeyProblem(lookup: Exclude<KeyLookup, { ok: true }>): AIRuntimeResponse {
	if (lookup.reason === 'origin_mismatch') {
		return buildErrorResponse(
			'provider_misconfigured',
			`The saved API key belongs to ${lookup.origin ?? 'another server'}. Enter the key again for the new server URL.`,
		)
	}
	return buildErrorResponse('provider_misconfigured', 'No API key saved for this connection. Add it in Settings → AI.')
}

/** The connection with its key and nothing else from the caller: no key field rides along. */
function withKey(provider: IAIProviderConfig, apiKey: string): IAIProviderWithKey {
	const clean: IAIProviderConfig & { apiKey?: unknown } = { ...provider }
	delete clean.apiKey
	return { ...clean, apiKey }
}

async function handleChat(request: IAIChatRuntimeRequest): Promise<AIRuntimeResponse> {
	if (!Array.isArray(request.messages) || request.messages.length === 0) {
		return buildErrorResponse('provider_misconfigured', 'Messages array is empty')
	}
	const provider = await getStoredAIProvider(String(request.providerId ?? ''))
	if (!provider) {
		return buildErrorResponse('provider_misconfigured', 'Unknown AI connection. Re-select it in Settings → AI.')
	}
	const key = await getProviderKey(provider.id, provider.baseURL)
	if (!key.ok) return describeKeyProblem(key)
	return chatCompletion(withKey(provider, key.key), request.messages, request.options)
}

async function handleTestConnection(
	request: IAITestConnectionRuntimeRequest,
): Promise<AIRuntimeResponse> {
	if (!request.provider || typeof request.provider !== 'object') {
		return buildErrorResponse('provider_misconfigured', 'No connection to test')
	}
	const typed = typeof request.apiKey === 'string' ? request.apiKey.trim() : ''
	let apiKey = typed
	if (!apiKey) {
		const key = await getProviderKey(String(request.providerId ?? ''), String(request.provider.baseURL ?? ''))
		if (!key.ok) return describeKeyProblem(key)
		apiKey = key.key
	}

	const provider = withKey(request.provider, apiKey)
	const response = await chatCompletion(
		provider,
		[{ role: 'user', content: TEST_CONNECTION_PROBE_MESSAGE }],
		{ maxTokens: TEST_CONNECTION_MAX_TOKENS },
	)
	if (!response.ok && (
		response.error.code === 'response_truncated'
		|| (response.error.code === 'bad_response' && response.error.message.includes('Empty completion'))
	)) {
		return { ok: true, content: '', model: provider.model }
	}
	return response
}

async function handleSetKey(request: IAISetKeyRuntimeRequest): Promise<AIKeyRuntimeResponse> {
	return setProviderKey(String(request.providerId ?? ''), String(request.apiKey ?? ''), String(request.baseURL ?? ''))
}

async function handleDeleteKey(request: IAIDeleteKeyRuntimeRequest): Promise<AIKeyRuntimeResponse> {
	await deleteProviderKey(String(request.providerId ?? ''))
	return { ok: true }
}

function run(request: AIRuntimeRequest): Promise<AIRuntimeResponse | AIKeyRuntimeResponse> {
	switch (request.type) {
		case AI_MESSAGE_TYPE.chat:
			return handleChat(request)
		case AI_MESSAGE_TYPE.testConnection:
			return handleTestConnection(request)
		case AI_MESSAGE_TYPE.setKey:
			return handleSetKey(request)
		case AI_MESSAGE_TYPE.deleteKey:
			return handleDeleteKey(request)
	}
}

export function tryHandleAIMessage(
	request: unknown,
	sendResponse: (response: AIRuntimeResponse | AIKeyRuntimeResponse) => void,
): boolean {
	if (!isAIRuntimeRequest(request)) return false

	run(request)
		.then(sendResponse)
		.catch((error: unknown) => {
			const message = error instanceof Error ? error.message : 'Unexpected handler error'
			sendResponse(request.type === AI_MESSAGE_TYPE.setKey || request.type === AI_MESSAGE_TYPE.deleteKey
				? { ok: false, error: message }
				: buildErrorResponse('unknown', message))
		})

	return true
}
