import { create } from 'zustand'

import type { ISendRequest } from '@/interface/bridge'
import type { HeadersSource } from '@/panel/app/service/send-request'

/** The request open in the send window, from Logs or from a mock; none while the window is closed. */
export interface SendStoreState {
	draft?: ISendRequest
	/**
	 * Where to show the window: the body of the window the user clicked in. A mock form opened in a
	 * separate window gets it there, not behind it in the panel. None means the panel.
	 */
	mountNode?: HTMLElement
	/** Set for a draft built from a mock: whether its headers, the token among them, were found. */
	headersFrom?: HeadersSource
	openSend: (draft: ISendRequest, mountNode?: HTMLElement, headersFrom?: HeadersSource) => void
	closeSend: () => void
}

export const useSendStore = create<SendStoreState>((set) => ({
	draft: undefined,
	mountNode: undefined,
	headersFrom: undefined,
	openSend: (draft, mountNode, headersFrom) => set({ draft, mountNode, headersFrom }),
	closeSend: () => set({ draft: undefined, mountNode: undefined, headersFrom: undefined }),
}))
