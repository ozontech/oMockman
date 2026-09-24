import { BRIDGE_HANDSHAKE } from '@/interface/bridge'
import type { BridgeInjectMessage, IBridgeMockAnswer } from '@/interface/bridge'

export interface BridgeHarness {
	received: BridgeInjectMessage[]
	logs: Array<{ id?: string; message: unknown }>
	setLogging: (enabled: boolean) => void
	bumpEpoch: (epoch: number) => void
	setGate: (open: boolean) => void
	/** Resolves once the injected side has the verdict, as it does in a browser. */
	ready: Promise<void>
}

/** The gate opens by default; pass `{ gate: false }` for an origin with nothing allowed. */
export function attachFakeContentSide(
	answer: (method: string, url: string) => IBridgeMockAnswer | null = () => null,
	options: { gate?: boolean } = {},
): BridgeHarness {
	const channel = new MessageChannel()
	const received: BridgeInjectMessage[] = []
	const logs: Array<{ id?: string; message: unknown }> = []

	channel.port1.onmessage = (evt: MessageEvent) => {
		const message = evt.data as BridgeInjectMessage
		received.push(message)
		if (message.k === 'match') {
			channel.port1.postMessage({
				k: 'match:res',
				id: message.id,
				mock: answer(message.method, message.url),
			})
		}
		if (message.k === 'log') {
			logs.push({ id: message.id, message: message.message })
		}
	}
	channel.port1.start?.()

	window.dispatchEvent(
		new MessageEvent('message', {
			data: { type: BRIDGE_HANDSHAKE },
			source: window,
			ports: [channel.port2],
		}),
	)

	channel.port1.postMessage({ k: 'gate', open: options.gate !== false })

	return {
		received,
		logs,
		setLogging: (enabled: boolean) => channel.port1.postMessage({ k: 'logging', enabled }),
		bumpEpoch: (epoch: number) => channel.port1.postMessage({ k: 'epoch', epoch }),
		setGate: (open: boolean) => channel.port1.postMessage({ k: 'gate', open }),
		ready: flushMicrotasks(),
	}
}

/** A MessagePort delivery can need more than one turn of the loop: one `setTimeout(0)` was flaky. */
export const flushMicrotasks = async (turns = 5): Promise<void> => {
	for (let i = 0; i < turns; i += 1) {
		await new Promise((resolve) => setTimeout(resolve, 0))
	}
}
