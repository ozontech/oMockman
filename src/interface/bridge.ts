/**
 * Private channel between the content script and the injected script. Only the
 * handshake, which carries a MessagePort, goes over window.postMessage: mock data
 * never enters the page's world.
 */

export const BRIDGE_HANDSHAKE = 'MOCKMAN_PORT'

export interface IBridgeMockAnswer {
	status: number
	response: string
	headers: Array<{ name: string; value: string }>
	delay?: number
}

export type BridgeInjectMessage =
	| { k: 'ack' }
	| { k: 'match'; id: number; method: string; url: string }
	| { k: 'log'; id?: string; message: unknown }

export type BridgeContentMessage =
	| { k: 'match:res'; id: number; mock: IBridgeMockAnswer | null }
	| { k: 'epoch'; epoch: number }
	| { k: 'logging'; enabled: boolean }
	| { k: 'gate'; open: boolean }
