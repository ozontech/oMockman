import { create } from 'zustand'

import type { ILog } from '@/interface/mock'

/** The panel keeps the newest logs only: by count, and by the size of the bodies they hold. */
export const MAX_LOGS = 300
export const MAX_LOG_BODY_CHARS = 100 * 1024 * 1024

const bodyChars = (log: ILog): number =>
	(log.request?.body?.length ?? 0) + (log.response?.response?.length ?? 0)

/** Drops the oldest logs, which are at the end, until both limits hold. */
export function trimLogs(logs: ILog[]): ILog[] {
	let total = 0
	for (let i = 0; i < logs.length; i += 1) {
		total += bodyChars(logs[i])
		if (i >= MAX_LOGS || (total > MAX_LOG_BODY_CHARS && i > 0)) return logs.slice(0, i)
	}
	return logs
}

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
		set({ logs: trimLogs([log, ...get().logs]) })
	},

	updateLog: (log: ILog): void => {
		set({ logs: get().logs.map((item) => (item.id === log.id ? log : item)) })
	},

	upsertLog: (log: ILog): void => {
		set((state) => {
			const idx = state.logs.findIndex(({ id }) => id === log.id)
			if (idx === -1) {
				return { logs: trimLogs([log, ...state.logs]) }
			}
			const next = state.logs.slice()
			next[idx] = log
			return { logs: trimLogs(next) }
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
