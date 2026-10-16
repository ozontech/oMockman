import { MessageService as base } from './index'

import type { IEventMessage } from '@/interface/message'
import type { ApplyMocksPayload } from '@/interface/xhr'
import { messageTopFrame } from '@/panel/app/service/tab-message'

export const MessageAPI = {
	notifyUpdateStore(tabId?: number) {
		if (typeof tabId === 'number') {
			base.send({ message: 'UPDATE_STORE', from: 'PANEL', to: 'CONTENT', type: 'NOTIFICATION', id: tabId })
		} else {
			base.send({ message: 'UPDATE_STORE', from: 'PANEL', to: 'CONTENT', type: 'NOTIFICATION' })
		}
	},

	/** A nudge to re-read the store right away; the storage change delivers the mocks either way. */
	applyMocksNow(tabId?: number, active?: boolean) {
		if (typeof tabId !== 'number') return
		const payload: ApplyMocksPayload = { kind: 'APPLY_MOCKS', active }
		void messageTopFrame(tabId, {
			message: payload,
			from: 'PANEL',
			to: 'CONTENT',
			type: 'NOTIFICATION',
			id: tabId,
			extensionName: 'MOCKMAN',
		})
	},

	initFromContent(host: string) {
		base.send({ message: host, type: 'INIT', from: 'CONTENT', to: 'PANEL' })
	},

	forwardLogToPanel(msg: IEventMessage) {
		base.send(msg)
	},
}
