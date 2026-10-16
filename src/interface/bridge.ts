/**
 * Private channel between the content script and the injected script. Only the
 * handshake, which carries a MessagePort, goes over window.postMessage: mock data
 * never enters the page's world.
 */

import type { IRequestPatch } from './mock'

export const BRIDGE_HANDSHAKE = 'MOCKMAN_PORT'

export interface IBridgeMockAnswer {
	status: number
	response: string
	headers: Array<{ name: string; value: string }>
	delay?: number
	/** Set: the request goes to the network, changed as below, and nothing is served. */
	network?: {
		requestPatch?: IRequestPatch
		/** Set on the real response, replacing a header of the same name. */
		responseHeaders?: Array<{ name: string; value: string }>
	}
}

/** A request the panel asks the page to send, as the page would: its origin, its cookies. */
export interface ISendRequest {
	method: string
	url: string
	headers: Array<{ name: string; value: string }>
	body?: string
	/** `credentials: 'include'`; off for an API that does not allow credentials in CORS. */
	withCredentials: boolean
}

export type SendFailure = 'invalid' | 'not_allowed' | 'unavailable' | 'network' | 'timeout'

export type ISendResult =
	| {
		ok: true
		status: number
		statusText: string
		/** Only what CORS exposes to the page, unless the background had the full set. */
		headers: Array<{ name: string; value: string }>
		body: string
		/** Over the body limit: not read. */
		tooLarge?: boolean
		/** A binary body: not read. */
		binary?: boolean
		size?: number
		durationMs: number
		/** After redirects. */
		url: string
	}
	| { ok: false; reason: SendFailure; error: string }

export type BridgeInjectMessage =
	| { k: 'ack' }
	/** `logId` ties the answer to the request's log, so the panel can tell which scenario rule served it. */
	| { k: 'match'; id: number; method: string; url: string; logId?: string }
	| { k: 'log'; id?: string; message: unknown }
	| { k: 'send:res'; id: number; result: ISendResult }

export type BridgeContentMessage =
	/** `noCache`: a scenario may answer this endpoint later, so "not mocked" must not be remembered. */
	| { k: 'match:res'; id: number; mock: IBridgeMockAnswer | null; noCache?: boolean }
	| { k: 'send'; id: number; request: ISendRequest }
	| { k: 'epoch'; epoch: number }
	| { k: 'logging'; enabled: boolean }
	| { k: 'gate'; open: boolean }
