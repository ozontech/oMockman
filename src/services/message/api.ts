import { MessageService as base } from './index'

import type { IEventMessage } from '@/interface/message'
import type { ApplyMocksPayload } from '@/interface/xhr'

type ExtApi = typeof chrome

const ext = (
	(globalThis as unknown as { browser?: ExtApi }).browser
	?? (globalThis as unknown as { chrome?: ExtApi }).chrome
) as ExtApi | undefined

export const MessageAPI = {
	notifyUpdateStore(tabId?: number) {
		if (typeof tabId === 'number') {
			base.send({ message: 'UPDATE_STORE', from: 'PANEL', to: 'CONTENT', type: 'NOTIFICATION', id: tabId })
		} else {
			base.send({ message: 'UPDATE_STORE', from: 'PANEL', to: 'CONTENT', type: 'NOTIFICATION' })
		}
	},

	applyMocksNow(tabId?: number, active?: boolean) {
		const payload: ApplyMocksPayload = { kind: 'APPLY_MOCKS', active }
		if (typeof tabId === 'number') {
			try {
				const fn = ext?.tabs?.sendMessage as unknown as ((...args: unknown[]) => unknown) | undefined
				if (!fn) return

				const msg = {
					message: payload,
					from: 'PANEL',
					to: 'CONTENT',
					type: 'NOTIFICATION',
					id: tabId,
					extensionName: 'MOCKMAN',
				}
				const arity = (fn as unknown as { length: number }).length
				if (arity >= 3) {
					if (arity >= 4) fn(tabId, msg, undefined, () => void 0)
					else fn(tabId, msg, () => void 0)
					return
				}
				void Promise.resolve(fn(tabId, msg)).catch(() => void 0)
			} catch (e) {
				void e
			}
		}
	},

	initFromContent(host: string) {
		base.send({ message: host, type: 'INIT', from: 'CONTENT', to: 'PANEL' })
	},

	forwardLogToPanel(msg: IEventMessage) {
		base.send(msg)
	},
}
