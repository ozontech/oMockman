import { buildErrorResponse, chatCompletion } from '@/services/ai'
import { getStoredAIProvider } from '@/background/store-access'
import { AI_MESSAGE_TYPE } from '@/interface/message'
import type {
	AIRuntimeRequest,
	AIRuntimeResponse,
	IAIChatRuntimeRequest,
	IAITestConnectionRuntimeRequest,
} from '@/interface/message'

/**
 * Handles AI messages from the panel and forwards them to the OpenAI client.
 * The answer is always a structured response, never a thrown error.
 */

const TEST_CONNECTION_PROBE_MESSAGE = 'ping'
const TEST_CONNECTION_MAX_TOKENS = 1

function isAIRuntimeRequest(value: unknown): value is AIRuntimeRequest {
	if (!value || typeof value !== 'object') return false
	const type = (value as { type?: unknown }).type
	return type === AI_MESSAGE_TYPE.chat || type === AI_MESSAGE_TYPE.testConnection
}

async function handleChat(request: IAIChatRuntimeRequest): Promise<AIRuntimeResponse> {
	if (!Array.isArray(request.messages) || request.messages.length === 0) {
		return buildErrorResponse('provider_misconfigured', 'Messages array is empty')
	}
	const provider = await getStoredAIProvider(String(request.providerId ?? ''))
	if (!provider) {
		return buildErrorResponse('provider_misconfigured', 'Unknown AI connection. Re-select it in Settings → AI.')
	}
	return chatCompletion(provider, request.messages, request.options)
}

async function handleTestConnection(
	request: IAITestConnectionRuntimeRequest,
): Promise<AIRuntimeResponse> {
	const response = await chatCompletion(
		request.provider,
		[{ role: 'user', content: TEST_CONNECTION_PROBE_MESSAGE }],
		{ maxTokens: TEST_CONNECTION_MAX_TOKENS },
	)
	if (!response.ok && (
		response.error.code === 'response_truncated'
		|| (response.error.code === 'bad_response' && response.error.message.includes('Empty completion'))
	)) {
		return { ok: true, content: '', model: request.provider.model }
	}
	return response
}

export function tryHandleAIMessage(
	request: unknown,
	sendResponse: (response: AIRuntimeResponse) => void,
): boolean {
	if (!isAIRuntimeRequest(request)) return false

	const work: Promise<AIRuntimeResponse> = request.type === AI_MESSAGE_TYPE.chat
		? handleChat(request)
		: handleTestConnection(request)

	work
		.then(sendResponse)
		.catch((error: unknown) => {
			const message = error instanceof Error ? error.message : 'Unexpected handler error'
			sendResponse(buildErrorResponse('unknown', message))
		})

	return true
}
