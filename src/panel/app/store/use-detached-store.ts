import { create } from 'zustand'

import type { ILog, IMockResponse } from '@/interface/mock'

interface DetachedMock {
	id: string
	mock: Partial<IMockResponse>
}

interface DetachedLog {
	id: string
	log: ILog
}

interface DetachedStoreState {
	detachedMocks: DetachedMock[]
	detachedLogs: DetachedLog[]

	addDetachedMock: (mock: Partial<IMockResponse>) => string
	removeDetachedMock: (id: string) => void

	addDetachedLog: (log: ILog) => string
	removeDetachedLog: (id: string) => void
}

let counter = 0
const genDetachedId = () => `detached-${++counter}-${Date.now()}`

export const useDetachedStore = create<DetachedStoreState>((set) => ({
	detachedMocks: [],
	detachedLogs: [],

	addDetachedMock: (mock) => {
		const id = genDetachedId()
		set((state) => ({
			detachedMocks: [...state.detachedMocks, { id, mock }],
		}))
		return id
	},

	removeDetachedMock: (id) => {
		set((state) => ({
			detachedMocks: state.detachedMocks.filter((m) => m.id !== id),
		}))
	},

	addDetachedLog: (log) => {
		const id = genDetachedId()
		set((state) => ({
			detachedLogs: [...state.detachedLogs, { id, log }],
		}))
		return id
	},

	removeDetachedLog: (id) => {
		set((state) => ({
			detachedLogs: state.detachedLogs.filter((l) => l.id !== id),
		}))
	},
}))
