import type { OmitStrict } from '@/interface/utility'
import { TUNNEL } from '@/interface/message'
import type { IEventMessage } from '@/interface/message'
import { getContentPort } from '@/contentScript/port'

export type TunnelKey = keyof typeof TUNNEL

type SendProps = OmitStrict<IEventMessage, 'extensionName'>

export function send(props: SendProps): void {
	if (!TUNNEL[`${props.to}:${props.from}` as TunnelKey]) {
		return
	}

	const envelope: IEventMessage = { ...props, extensionName: 'MOCKMAN' }

	try {
		chrome.runtime.sendMessage(envelope, () => void chrome.runtime.lastError)
	} catch {
		try {
			getContentPort().postMessage(envelope)
		} catch (portError: unknown) {
			void portError
		}
	}
}

export function listen(
	self: IEventMessage['from'],
	handler: (
		msg: IEventMessage,
		sender?: chrome.runtime.MessageSender,
		respond?: (res?: unknown) => void,
	) => void,
): () => void {

	const runtimeCb = (msg: IEventMessage, sender: chrome.runtime.MessageSender, respond: (res?: unknown) => void) => {
		if ((msg as IEventMessage)?.to === self) {
			handler(msg, sender, respond)
		}
	}

	chrome.runtime.onMessage.addListener(runtimeCb)

	return () => {
		chrome.runtime.onMessage.removeListener(runtimeCb)
	}
}

export const MessageService = { send, listen }
