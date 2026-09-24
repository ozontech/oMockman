import { create } from 'zustand'

import type { ILog } from '@/interface/mock'

export interface LogStoreState {
	logs: ILog[]
	isClearing: boolean

	addLog: (log: ILog) => void
	updateLog: (log: ILog) => void
	upsertLog: (log: ILog) => void
	clearLogs: () => void

	selectedLog?: ILog
	setSelectedLog: (log?: ILog) => void
}

export const useLogStore = create<LogStoreState>((set, get) => ({
	logs: [],
	isClearing: false,

	addLog: (log: ILog): void => {
		set({ logs: [log, ...get().logs] })
	},

	updateLog: (log: ILog): void => {
		set({ logs: get().logs.map((item) => (item.id === log.id ? log : item)) })
	},

	upsertLog: (log: ILog): void => {
		set((state) => {
			const idx = state.logs.findIndex(({ id }) => id === log.id)
			if (idx === -1) {
				return { logs: [log, ...state.logs] }
			}
			const next = state.logs.slice()
			next[idx] = log
			return { logs: next }
		})
	},

	clearLogs: (): void => {
		set({ isClearing: true })
		setTimeout(() => {
			set({ logs: [], selectedLog: undefined, isClearing: false })
		}, 200)
	},

	selectedLog: undefined,

	setSelectedLog: (log?: ILog): void => {
		set({ selectedLog: log })
	},
}))
