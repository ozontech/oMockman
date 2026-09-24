import { AI_MESSAGE_TYPE } from '../../interface/message'

import { buildErrorResponse } from './ai-errors'

import type { OmitStrict } from '@/interface/utility'
import type {
	AIRuntimeRequest,
	AIRuntimeResponse,
	IAIChatRuntimeRequest,
	IAITestConnectionRuntimeRequest,
} from '@/interface/message'

function isAIRuntimeResponse(value: unknown): value is AIRuntimeResponse {
	if (!value || typeof value !== 'object') return false
	const candidate = value as { ok?: unknown }
	return typeof candidate.ok === 'boolean'
}

async function sendAIRuntimeMessage(request: AIRuntimeRequest): Promise<AIRuntimeResponse> {
	const runtime = (globalThis as unknown as { chrome?: typeof chrome }).chrome?.runtime
	if (!runtime?.sendMessage) {
		return buildErrorResponse('unknown', 'chrome.runtime.sendMessage is unavailable')
	}

	try {
		const response = await new Promise<unknown>((resolve, reject) => {
			runtime.sendMessage(request, (resp: unknown) => {
				const lastError = runtime.lastError
				if (lastError) {
					reject(new Error(lastError.message ?? 'sendMessage failed'))
					return
				}
				resolve(resp)
			})
		})
		if (!isAIRuntimeResponse(response)) {
			return buildErrorResponse('bad_response', 'Background returned a malformed response')
		}
		return response
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Background did not respond'
		return buildErrorResponse('unknown', message)
	}
}

export function aiChat(request: OmitStrict<IAIChatRuntimeRequest, 'type'>): Promise<AIRuntimeResponse> {
	return sendAIRuntimeMessage({ type: AI_MESSAGE_TYPE.chat, ...request })
}

export function aiTestConnection(
	request: OmitStrict<IAITestConnectionRuntimeRequest, 'type'>,
): Promise<AIRuntimeResponse> {
	return sendAIRuntimeMessage({ type: AI_MESSAGE_TYPE.testConnection, ...request })
}
