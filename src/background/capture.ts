import type { ILog } from '@/interface/mock'
import { McpAccessError } from '@/services/mcp-access-error'
import { sanitizeTraffic } from '@/services/traffic-redaction'

export type Detail = NonNullable<ReturnType<typeof sanitizeTraffic>> & {
	id: number
	eventId?: string
	time: number
	documentId: string | null
}
type PanelQuery = { tabId: number; origin: string; method?: string; path?: string; limit?: number; requestId?: number }
let readPanel: (query: PanelQuery) => Promise<Detail[] | null> = async () => null
export function setPanelTrafficReader(reader: typeof readPanel) { readPanel = reader }
interface Capture {
	durationMs: number
	id: string
	owner: string
	tabId: number
	origin: string
	until: number
	expires: number
	entries: Detail[]
	next: number
	dropped: number
	bytes: number
	method: string
	path: string
	stopped: boolean
	timer: ReturnType<typeof setTimeout>
}
export interface CaptureAccess {
	scope: string
	tabId: number
	origin: string
	authorize(): Promise<void>
}
const captures = new Map<string, Capture>()
const histories = new Map<
	number,
	{ origin: string; entries: Detail[]; next: number; dropped: number; bytes: number }
>()
const HISTORY_TTL = 300000
function pruneHistory(tabId: number) {
	const history = histories.get(tabId)
	if (!history) return
	while (
		history.entries.length &&
		(history.entries.length > 100 ||
			history.bytes > 2 * 1024 * 1024 ||
			history.entries[0].time < Date.now() - HISTORY_TTL)
	) {
		const removed = history.entries.shift()
		if (!removed) break
		history.bytes -= JSON.stringify(removed).length * 2
		history.dropped++
	}
}
export function navigateCaptures(tabId: number, origin: string | null) {
	if (
		(histories.has(tabId) && histories.get(tabId)?.origin !== origin) ||
		[...captures.values()].some((item) => item.tabId === tabId && item.origin !== origin)
	)
		clearTabCaptures(tabId)
}
let changed: (tabId: number) => void = () => {}
let recordingStatus = isMcpCaptureEnabled
export function onCaptureChanged(callback: (tabId: number) => void, isRecording = isMcpCaptureEnabled) {
	changed = callback
	recordingStatus = isRecording
}
export function isMcpCaptureEnabled(tabId: number) {
	return [...captures.values()].some(
		(item) => item.tabId === tabId && !item.stopped && Date.now() < item.until,
	)
}
function stop(item: Capture) {
	item.stopped = true
	clearTimeout(item.timer)
	changed(item.tabId)
	item.timer = setTimeout(() => {
		captures.delete(item.id)
		changed(item.tabId)
	}, Math.max(0, item.expires - Date.now()))
}
export function revokeCapturePermissions(permissions: Record<string, unknown>) {
	for (const [tabId, history] of histories)
		if (!Object.hasOwn(permissions, history.origin)) histories.delete(tabId)
	for (const item of captures.values())
		if (!Object.hasOwn(permissions, item.origin)) clearTabCaptures(item.tabId)
}
export function revokeCaptures(owner: string, tabId?: number) {
	for (const item of captures.values())
		if (item.owner === owner && (tabId === undefined || item.tabId === tabId)) {
			clearTimeout(item.timer)
			captures.delete(item.id)
			changed(item.tabId)
		}
}
export function clearTabCaptures(tabId: number) {
	histories.delete(tabId)
	for (const item of captures.values())
		if (item.tabId === tabId) {
			clearTimeout(item.timer)
			captures.delete(item.id)
			changed(tabId)
		}
}
export function recordCapture(
	tabId: number,
	senderOrigin: string | null,
	raw: unknown,
	documentId: string | null = null,
) {
	if (!raw || typeof raw !== 'object' || !senderOrigin) return
	try {
		const entry = sanitizeTraffic(raw as ILog)
		if (entry) {
			let history = histories.get(tabId)
			if (!history || history.origin !== senderOrigin) {
				const oldest = histories.keys().next().value
				if (histories.size >= 32 && oldest !== undefined) histories.delete(oldest)
				history = { origin: senderOrigin, entries: [], next: 1, dropped: 0, bytes: 0 }
				histories.set(tabId, history)
			}
			const eventId = typeof (raw as ILog).id === 'string' || typeof (raw as ILog).id === 'number' ? String((raw as ILog).id).slice(0, 256) : undefined
			const detail = { ...entry, eventId, id: history.next++, time: Date.now(), documentId }
			history.entries.push(detail)
			history.bytes += JSON.stringify(detail).length * 2
			pruneHistory(tabId)
		}
	} catch {
		/* Do not retain unfiltered data. */
	}
	for (const item of captures.values()) {
		if (
			item.tabId !== tabId ||
			item.origin !== senderOrigin ||
			item.stopped ||
			Date.now() >= item.until
		)
			continue
		try {
			const entry = sanitizeTraffic(raw as ILog)
			if (
				!entry ||
				(item.method && entry.request.method !== item.method) ||
				(item.path && new URL(entry.request.url).pathname !== item.path)
			)
				continue
			const detail: Detail = { ...entry, id: item.next++, time: Date.now(), documentId }
			const size = JSON.stringify(detail).length * 2
			if (size > 1024 * 1024) {
				item.dropped++
				continue
			}
			item.entries.push(detail)
			item.bytes += size
			while (item.entries.length > 100 || item.bytes > 2 * 1024 * 1024) {
				const removed = item.entries.shift()
				if (removed) item.bytes -= JSON.stringify(removed).length * 2
				item.dropped++
			}
		} catch {
			/* Malformed page data must not break capture or leak raw values. */
		}
	}
}
const object = (raw: unknown): raw is Record<string, unknown> =>
	!!raw && typeof raw === 'object' && !Array.isArray(raw)
export async function handleCaptureCommand(
	command: string,
	raw: unknown,
	access: CaptureAccess,
): Promise<Record<string, unknown>> {
	try {
		await access.authorize()
		if (!object(raw)) throw new Error('INVALID_ARGUMENTS')
		if (command === 'get_request_fields') {
			if (
				Object.keys(raw).length !== 3 ||
				typeof raw.captureId !== 'string' ||
				!Number.isSafeInteger(raw.requestId) ||
				!Array.isArray(raw.paths) ||
				!raw.paths.length ||
				raw.paths.length > 20 ||
				raw.paths.some(
					(path) =>
						!Array.isArray(path) ||
						path.length > 16 ||
						path.some((key) => typeof key !== 'string' || key.length > 128),
				)
			)
				throw new Error('INVALID_ARGUMENTS')
			const result = await handleCaptureCommand(
				'get_request_details',
				{ captureId: raw.captureId, requestId: raw.requestId },
				access,
			)
			if (!('entry' in result) || !result.entry) return result
			const entry = result.entry as Detail
			let data: unknown
			try {
				data = JSON.parse(entry.response?.body ?? '')
			} catch {
				data = undefined
			}
			const fields = raw.paths.map((path: string[]) => {
				let value = data
				for (const key of path)
					value =
						value && typeof value === 'object' && Object.hasOwn(value, key)
							? (value as Record<string, unknown>)[key]
							: undefined
				return { path, available: value !== undefined, ...(value === undefined ? {} : { value }) }
			})
			return {
				kind: 'request_fields',
				requestId: raw.requestId,
				bodyState: entry.response?.bodyState ?? 'unavailable',
				redacted: entry.redacted,
				fields,
			}
		}
		pruneHistory(access.tabId)
		if (command === 'search_requests') {
			if (
				Object.keys(raw).some((key) => !['method', 'path', 'limit'].includes(key)) ||
				typeof raw.method !== 'string' ||
				typeof raw.path !== 'string' ||
				!Number.isInteger(raw.limit) ||
				Number(raw.limit) < 1 ||
				Number(raw.limit) > 50
			)
				throw new Error('INVALID_ARGUMENTS')
			const history = histories.get(access.tabId)
			const panelEntries = await readPanel({ tabId: access.tabId, origin: access.origin,
				method: raw.method, path: raw.path, limit: Number(raw.limit) })
			const backgroundEntries = history?.origin === access.origin
				? history.entries.filter((entry) =>
					(!raw.method || entry.request.method === raw.method) &&
					(!raw.path || new URL(entry.request.url).pathname === raw.path))
				: []
			// An open panel may have recording switched off while MCP capture is active.
			// Preserve its older Logs and also expose traffic recorded by the background.
			const panelKeys = new Set((panelEntries ?? []).filter((entry) => entry.eventId !== undefined)
				.map((entry) => JSON.stringify([entry.documentId, entry.eventId])))
			const extraEntries = backgroundEntries.filter((entry) => entry.eventId === undefined ||
				!panelKeys.has(JSON.stringify([entry.documentId, entry.eventId])))
			const entries = [...(panelEntries ?? []), ...extraEntries]
				.sort((a, b) => a.time - b.time).slice(-Number(raw.limit))

			await access.authorize()
			return {
				kind: 'traffic_history',
				source: panelEntries === null ? 'background' : extraEntries.length ? 'logs+background' : 'logs',
				captureId: 'history',
				tabId: access.tabId,
				recording: recordingStatus(access.tabId),
				// Background eviction does not mean the panel lost those same records.
				dropped: panelEntries === null ? history?.dropped ?? 0 : null,
				backgroundDropped: history?.dropped ?? 0,
				matchedPanelRecords: panelEntries?.length ?? null,
				matchedBackgroundRecords: backgroundEntries.length,
				entries: entries.map((entry) => ({
					id: entry.id,
					time: entry.time,
					documentId: entry.documentId,
					method: entry.request.method,
					url: entry.request.url,
					query: entry.request.query,
					status: entry.response?.status ?? null,
					isMocked: entry.isMocked,
					bodyState: entry.response?.bodyState ?? 'unavailable',
					redacted: entry.redacted,
				})),
			}
		}
		if (command === 'get_request_details' && raw.captureId === 'history') {
			if (
				Object.keys(raw).some((key) => !['captureId', 'requestId'].includes(key)) ||
				!Number.isSafeInteger(raw.requestId)
			)
				throw new Error('INVALID_ARGUMENTS')
			const history = histories.get(access.tabId)
			const panelEntries = await readPanel({ tabId: access.tabId, origin: access.origin, requestId: Number(raw.requestId) })
			const entry = panelEntries?.[0] ?? (
				history?.origin === access.origin
					? history.entries.find((entry) => entry.id === raw.requestId)
					: undefined)
			if (!entry) throw new Error('REQUEST_NOT_FOUND')
			await access.authorize()
			return { kind: 'request_details', captureId: 'history', tabId: access.tabId, entry }
		}
		if (command === 'start_capture') {
			const durationMs = raw.durationMs
			if (
				Object.keys(raw).some((key) => !['durationMs', 'method', 'path'].includes(key)) ||
				typeof durationMs !== 'number' ||
				!Number.isInteger(durationMs) ||
				durationMs < 1000 ||
				durationMs > 120000 ||
				typeof raw.method !== 'string' ||
				!['', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(raw.method) ||
				typeof raw.path !== 'string' ||
				(raw.path !== '' &&
					(!raw.path.startsWith('/') || raw.path.length > 2048 || /[?#]/.test(raw.path)))
			)
				throw new Error('INVALID_ARGUMENTS')
			const active = [...captures.values()].find(
				(item) => item.owner === access.scope && !item.stopped && Date.now() < item.until,
			)
			if (active) {
				if (
					active.tabId === access.tabId &&
					active.origin === access.origin &&
					active.durationMs === durationMs &&
					active.method === raw.method &&
					active.path === raw.path
				)
					return {
						kind: 'capture',
						captureId: active.id,
						expiresAt: active.expires,
						recordingUntil: active.until,
					}
				throw new Error('CAPTURE_ACTIVE')
			}
			revokeCaptures(access.scope)
			const id = crypto.randomUUID(),
				now = Date.now()
			const item: Capture = {
				durationMs,
				id,
				owner: access.scope,
				tabId: access.tabId,
				origin: access.origin,
				until: now + durationMs,
				expires: now + 300000,
				entries: [],
				next: 1,
				dropped: 0,
				bytes: 0,
				method: raw.method,
				path: raw.path,
				stopped: false,
				timer: setTimeout(() => {
					const current = captures.get(id)
					if (current) stop(current)
				}, durationMs),
			}
			captures.set(id, item)
			changed(access.tabId)
			return { kind: 'capture', captureId: id, expiresAt: item.expires, recordingUntil: item.until }
		}
		const keys =
			command === 'stop_capture'
				? ['captureId']
				: command === 'get_capture_requests'
				? ['captureId', 'afterId', 'limit']
				: command === 'get_request_details'
				? ['captureId', 'requestId']
				: []
		if (
			!keys.length ||
			Object.keys(raw).length !== keys.length ||
			Object.keys(raw).some((key) => !keys.includes(key)) ||
			typeof raw.captureId !== 'string'
		)
			throw new Error('INVALID_ARGUMENTS')
		const item = captures.get(raw.captureId)
		if (
			!item ||
			item.owner !== access.scope ||
			item.tabId !== access.tabId ||
			item.origin !== access.origin ||
			Date.now() >= item.expires
		)
			throw new Error('CAPTURE_NOT_FOUND')
		if (command === 'stop_capture') {
			stop(item)
			return { kind: 'capture_stopped', captureId: item.id }
		}
		if (command === 'get_request_details') {
			if (!Number.isSafeInteger(raw.requestId)) throw new Error('INVALID_ARGUMENTS')
			const entry = item.entries.find((entry) => entry.id === raw.requestId)
			if (!entry) throw new Error('REQUEST_NOT_FOUND')
			await access.authorize()
			return { kind: 'request_details', captureId: item.id, entry }
		}
		if (
			!Number.isSafeInteger(raw.afterId) ||
			Number(raw.afterId) < 0 ||
			!Number.isInteger(raw.limit) ||
			Number(raw.limit) < 1 ||
			Number(raw.limit) > 50
		)
			throw new Error('INVALID_ARGUMENTS')
		const entries = item.entries
			.filter((entry) => entry.id > Number(raw.afterId))
			.slice(0, Number(raw.limit))
		await access.authorize()
		return {
			kind: 'capture_requests',
			captureId: item.id,
			recording: !item.stopped && Date.now() < item.until,
			dropped: item.dropped,
			nextCursor: entries.at(-1)?.id ?? raw.afterId,
			entries: entries.map((entry) => ({
				id: entry.id,
				time: entry.time,
				documentId: entry.documentId,
				method: entry.request.method,
				url: entry.request.url,
				status: entry.response?.status ?? null,
				isMocked: entry.isMocked,
				redacted: entry.redacted,
			})),
		}
	} catch (error) {
		const codes = [
			'INVALID_ARGUMENTS',
			'ACCESS_DENIED',
			'CAPTURE_ACTIVE',
			'CAPTURE_NOT_FOUND',
			'REQUEST_NOT_FOUND',
		]
		const code =
			error instanceof Error && codes.includes(error.message) ? error.message : 'CAPTURE_ERROR'
		return {
			kind: 'error',
			code,
			message: error instanceof McpAccessError ? error.publicMessage : code,
			retryable: false,
		}
	}
}
