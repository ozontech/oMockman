import type { AIChatResponse, IAIChatRequestOptions, IAIMessage, IAIProviderConfig } from './ai'
import type { ILog } from './mock'

import type { OmitStrict } from '@/interface/utility'

export type Process = 'CONTENT' | 'PANEL' | 'ALL' | 'BACKGROUND'

export interface IEventMessage {
	to: Process
	from: Process
	extensionName: 'MOCKMAN'
	id?: number | string
	sourceTabId?: number
	type?: 'LOG' | 'NOTIFICATION' | 'INIT' | 'PONG'
	message: ILog | Record<string, unknown> | string | number
}

// Extension APIs only: the page can read and write the window channel.
export const TUNNEL = {
	'CONTENT:PANEL': 'runtime',
	'PANEL:CONTENT': 'runtime',
} as const

/**
 * Message types between the panel and the service worker for the AI features.
 */

export const AI_MESSAGE_TYPE = {
	chat: 'AI_CHAT',
	testConnection: 'AI_TEST_CONNECTION',
} as const

export interface IAIChatRuntimeRequest {
	type: typeof AI_MESSAGE_TYPE.chat
	/** Resolved from storage by the worker, so a message cannot inject an endpoint or key. */
	providerId: string
	messages: IAIMessage[]
	options?: OmitStrict<IAIChatRequestOptions, 'signal'>
}

export interface IAITestConnectionRuntimeRequest {
	type: typeof AI_MESSAGE_TYPE.testConnection
	provider: IAIProviderConfig
}

export type AIRuntimeRequest = IAIChatRuntimeRequest | IAITestConnectionRuntimeRequest

export type AIRuntimeResponse = AIChatResponse
