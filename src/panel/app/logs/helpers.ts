import type { ILog } from '@/interface/mock'

export const getRowColor = (log: ILog): string | undefined => {
	const s = log.response?.status
	return s !== undefined && (s === 0 || (s >= 500 && s < 600)) ? '#e06c75' : undefined
}

export const matchesSearch = (log: ILog, searchLower: string): boolean => {
	if (!searchLower) return true
	return (
		(log.request?.method?.toLowerCase() ?? '').includes(searchLower) ||
		(log.request?.url?.toLowerCase() ?? '').includes(searchLower) ||
		String(log.response?.status ?? '').includes(searchLower)
	)
}

