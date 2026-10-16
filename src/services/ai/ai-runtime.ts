import { AI_MESSAGE_TYPE } from '../../interface/message'

import { buildErrorResponse } from './ai-errors'

import type { OmitStrict } from '@/interface/utility'
import type {
	AIKeyRuntimeResponse,
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

function sendToWorker(request: AIRuntimeRequest): Promise<unknown> {
	const runtime = (globalThis as unknown as { chrome?: typeof chrome }).chrome?.runtime
	if (!runtime?.sendMessage) {
		return Promise.reject(new Error('chrome.runtime.sendMessage is unavailable'))
	}
	return new Promise<unknown>((resolve, reject) => {
		runtime.sendMessage(request, (resp: unknown) => {
			const lastError = runtime.lastError
			if (lastError) {
				reject(new Error(lastError.message ?? 'sendMessage failed'))
				return
			}
			resolve(resp)
		})
	})
}

async function sendAIRuntimeMessage(request: AIRuntimeRequest): Promise<AIRuntimeResponse> {
	try {
		const response = await sendToWorker(request)
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

async function sendKeyMessage(request: AIRuntimeRequest): Promise<AIKeyRuntimeResponse> {
	try {
		const response = await sendToWorker(request) as AIKeyRuntimeResponse | undefined
		if (!response || typeof response.ok !== 'boolean') return { ok: false, error: 'Background returned a malformed response' }
		return response
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : 'Background did not respond' }
	}
}

/** Hands a key to the service worker, which keeps it bound to the origin of `baseURL`. */
export function aiSetKey(providerId: string, apiKey: string, baseURL: string): Promise<AIKeyRuntimeResponse> {
	return sendKeyMessage({ type: AI_MESSAGE_TYPE.setKey, providerId, apiKey, baseURL })
}

export function aiDeleteKey(providerId: string): Promise<AIKeyRuntimeResponse> {
	return sendKeyMessage({ type: AI_MESSAGE_TYPE.deleteKey, providerId })
}
