import type { ILog } from '@/interface/mock'
import { sanitizeTraffic } from '@/services/traffic-redaction'

// Metadata is attached only to logs delivered by the background, never page payloads.
const sources = new WeakMap<ILog, { tabId: number; origin: string; documentId: string | null; id: number }>()
let nextId = Date.now() * 1000 + Math.floor(Math.random() * 1000)

export function rememberLogSource(log: ILog, tabId: number, origin: string, documentId: string | null) {
	sources.set(log, { tabId, origin, documentId, id: nextId++ })
}

export function readPanelTraffic(logs: ILog[], query: {
	tabId: number; origin: string; method?: string; path?: string; limit?: number; requestId?: number
}) {
	const entries = []
	for (const log of logs) {
		const source = sources.get(log)
		if (!log.request || !source || source.tabId !== query.tabId || source.origin !== query.origin) continue
		if (query.requestId !== undefined && query.requestId !== source.id) continue
		try {
			if (query.method && log.request.method !== query.method) continue
			if (query.path && new URL(log.request.url).pathname !== query.path) continue
			const entry = sanitizeTraffic(log)
			if (entry) entries.push({ ...entry, eventId: log.id === undefined ? undefined : String(log.id).slice(0, 256), id: source.id, time: log.time ?? 0, documentId: source.documentId })
		} catch { /* A malformed log must not prevent reading the remaining records. */ }
		if (entries.length >= Math.min(50, Math.max(1, query.limit ?? 1))) break
	}
	return entries.reverse()
}
