import { afterEach, expect, it, vi } from 'vitest'

import { readPanelTraffic, rememberLogSource } from '@/panel/app/service/traffic-history'
import type { ILog } from '@/interface/mock'
import {
	clearTabCaptures,
	setPanelTrafficReader,
	handleCaptureCommand,
	isMcpCaptureEnabled,
	recordCapture,
	revokeCaptures,
} from '@/background/capture'

const origin = 'https://app.example.test'
const access = { scope: 'agent', tabId: 1, origin, authorize: async () => {} }
const log = {
	request: {
		url: 'https://api.example.test/tasks?secret=hidden',
		method: 'GET',
		headers: [{ name: 'Authorization', value: 'hidden' }],
		body: '{"token":"hidden"}',
	},
	response: { status: 200, response: '{"items":[1],"email":"hidden"}', headers: [] },
}
afterEach(() => {
	revokeCaptures('agent')
	setPanelTrafficReader(async () => null)
	vi.useRealTimers()
})
it('records filtered traffic with cursors and details, isolates owners and stops consumers', async () => {
	const capture = (await handleCaptureCommand(
		'start_capture',
		{ durationMs: 1000, method: 'GET', path: '/tasks' },
		access,
	)) as { captureId: string }
	expect(isMcpCaptureEnabled(1)).toBe(true)
	expect(
		await handleCaptureCommand(
			'start_capture',
			{ durationMs: 1000, method: 'GET', path: '/tasks' },
			access,
		),
	).toEqual(capture)
	recordCapture(2, origin, log)
	recordCapture(1, 'https://other.test', log)
	recordCapture(1, origin, log)
	const page = await handleCaptureCommand(
		'get_capture_requests',
		{ captureId: capture.captureId, afterId: 0, limit: 50 },
		access,
	)
	expect(page).toMatchObject({ entries: [{ id: 1, url: 'https://api.example.test/tasks' }], nextCursor: 1 })
	const detail = await handleCaptureCommand(
		'get_request_details',
		{ captureId: capture.captureId, requestId: 1 },
		access,
	)
	expect(JSON.stringify(detail)).not.toContain('hidden')
	expect(detail).toMatchObject({
		entry: { redacted: true, response: { body: '{"items":[1],"email":"[REDACTED]"}' } },
	})
	expect(
		await handleCaptureCommand(
			'get_request_details',
			{ captureId: capture.captureId, requestId: 1 },
			{ ...access, scope: 'other' },
		),
	).toMatchObject({ code: 'CAPTURE_NOT_FOUND' })
	await handleCaptureCommand('stop_capture', { captureId: capture.captureId }, access)
	expect(isMcpCaptureEnabled(1)).toBe(false)
	recordCapture(1, origin, log)
	expect(
		await handleCaptureCommand(
			'get_capture_requests',
			{ captureId: capture.captureId, afterId: 1, limit: 50 },
			access,
		),
	).toMatchObject({ entries: [], recording: false })
})
it('bounds retention, reports evictions and expires without another command', async () => {
	vi.useFakeTimers()
	const capture = (await handleCaptureCommand(
		'start_capture',
		{ durationMs: 1000, method: '', path: '' },
		access,
	)) as { captureId: string }
	for (let i = 0; i < 110; i++) recordCapture(1, origin, log)
	expect(
		await handleCaptureCommand(
			'get_capture_requests',
			{ captureId: capture.captureId, afterId: 0, limit: 1 },
			access,
		),
	).toMatchObject({ dropped: 10, entries: [{ id: 11 }] })
	vi.advanceTimersByTime(1001)
	expect(isMcpCaptureEnabled(1)).toBe(false)
	vi.advanceTimersByTime(300000)
	expect(
		await handleCaptureCommand(
			'get_capture_requests',
			{ captureId: capture.captureId, afterId: 0, limit: 50 },
			access,
		),
	).toMatchObject({ code: 'CAPTURE_NOT_FOUND' })
})

it('marks unavailable, binary, large and non-JSON bodies without returning their contents', async () => {
	const capture = (await handleCaptureCommand(
		'start_capture',
		{ durationMs: 1000, method: '', path: '' },
		access,
	)) as { captureId: string }
	for (const response of [
		{ status: 200, response: 'private binary', binary: true },
		{ status: 200, response: 'x'.repeat(65537) },
		{ status: 200, response: '<html>private text</html>' },
		{ status: 200 },
	])
		recordCapture(1, origin, { request: { url: `${origin}/tasks`, method: 'GET' }, response })
	for (const [index, bodyState] of [
		'unavailable',
		'too-large',
		'redacted',
		'unavailable',
	].entries()) {
		const detail = await handleCaptureCommand(
			'get_request_details',
			{ captureId: capture.captureId, requestId: index + 1 },
			access,
		)
		expect(detail).toMatchObject({ entry: { response: { bodyState } } })
		expect(JSON.stringify(detail)).not.toContain('private')
	}
})

it('finds existing panel traffic without starting a capture and projects response fields', async () => {
	const { clearTabCaptures, navigateCaptures } = await import('@/background/capture')
	clearTabCaptures(1)
	recordCapture(1, origin, log, 'document-before')
	const page = await handleCaptureCommand('search_requests', { method: 'GET', path: '/tasks', limit: 5 }, access)
	expect(page).toMatchObject({ captureId: 'history', recording: false, entries: [{ id: 1, documentId: 'document-before', isMocked: false }] })
	navigateCaptures(1, origin)
	expect(await handleCaptureCommand('get_request_fields', { captureId: 'history', requestId: 1, paths: [['items'], ['missing']] }, access)).toMatchObject({ fields: [{ path: ['items'], available: true, value: [1] }, { path: ['missing'], available: false }] })
	navigateCaptures(1, 'https://other.test')
	expect(await handleCaptureCommand('get_request_details', { captureId: 'history', requestId: 1 }, access)).toMatchObject({ code: 'REQUEST_NOT_FOUND' })
})
it('keeps capture through same-site navigation and returns bounded marked samples', async () => {
	const { clearTabCaptures, navigateCaptures } = await import('@/background/capture')
	clearTabCaptures(1)
	await handleCaptureCommand('start_capture', { durationMs: 1000, method: '', path: '' }, access)
	navigateCaptures(1, origin)
	expect(isMcpCaptureEnabled(1)).toBe(true)
	recordCapture(1, origin, { ...log, response: { status: 200, response: JSON.stringify({ items: Array.from({ length: 2000 }, (_, id) => ({ id, name: 'Long name'.repeat(10), token: 'private' })) }) } }, 'new-document')
	const detail = await handleCaptureCommand('get_request_details', { captureId: 'history', requestId: 1 }, access)
	expect(detail).toMatchObject({ entry: { documentId: 'new-document', response: { bodyState: 'sampled' } } })
	expect(JSON.stringify(detail)).not.toContain('private')
	expect(JSON.stringify(detail).length).toBeLessThan(65536)
})

it('preserves safe separately logged query values while masking secrets', async () => {
	const { clearTabCaptures } = await import('@/background/capture')
	clearTabCaptures(1)
	recordCapture(1, origin, { ...log, request: { ...log.request, url: 'https://api.example.test/tasks', queryParams: '{"status":"ready","token":"private","ids":["1","2"]}' } })
	expect(await handleCaptureCommand('get_request_details', { captureId: 'history', requestId: 1 }, access)).toMatchObject({ entry: { request: { query: { status: ['ready'], token: ['[REDACTED]'], ids: ['1', '2'] } } } })
})

it('reads retained panel Logs after history expiry, sanitizes and respects clearing and source scope', async () => {
	vi.useFakeTimers()
	clearTabCaptures(1)
	const retained = { ...log, time: Date.now() } as ILog
	rememberLogSource(retained, 1, origin, 'original-document')
	let logs = [retained]
	setPanelTrafficReader(async (query) => readPanelTraffic(logs, query))
	recordCapture(1, origin, log)
	vi.advanceTimersByTime(600000)
	const result = await handleCaptureCommand('search_requests', { method: '', path: '/tasks', limit: 5 }, access)
	expect(result).toMatchObject({ source: 'logs', entries: [{ documentId: 'original-document' }] })
	const requestId = (result.entries as { id: number }[])[0].id
	const details = await handleCaptureCommand('get_request_details', { captureId: 'history', requestId }, access)
	expect(details).toMatchObject({ entry: { response: { body: '{"items":[1],"email":"[REDACTED]"}' } } })
	expect(JSON.stringify(details)).not.toContain('hidden')
	for (const scope of [{ ...access, tabId: 2 }, { ...access, origin: 'https://other.test' }]) {
		expect(await handleCaptureCommand('search_requests', { method: '', path: '', limit: 5 }, scope)).toMatchObject({ entries: [] })
	}
	logs = []
	expect(await handleCaptureCommand('get_request_details', { captureId: 'history', requestId }, access)).toMatchObject({ code: 'REQUEST_NOT_FOUND' })
})

it('rechecks access after reading panel Logs', async () => {
	const authorize = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('ACCESS_DENIED'))
	setPanelTrafficReader(async () => [])
	expect(await handleCaptureCommand('search_requests', { method: '', path: '', limit: 5 }, { ...access, authorize })).toMatchObject({ code: 'ACCESS_DENIED' })
})

it('combines retained Logs with newer capture traffic and does not report background eviction as lost Logs', async () => {
	vi.useFakeTimers()
	clearTabCaptures(1)
	const retained = { ...log, id: 'retained', time: Date.now() } as ILog
	rememberLogSource(retained, 1, origin, 'doc')
	setPanelTrafficReader(async (query) => readPanelTraffic([retained], query))
	recordCapture(1, origin, retained, 'doc')
	const query = { method: '', path: '/tasks', limit: 5 }
	const initial = await handleCaptureCommand('search_requests', query, access)
	expect(initial).toMatchObject({ source: 'logs', dropped: null, matchedPanelRecords: 1 })
	expect(initial.entries).toHaveLength(1)
	vi.advanceTimersByTime(600000)
	recordCapture(1, origin, { ...log, id: 'captured-while-panel-paused' }, 'new-doc')
	const combined = await handleCaptureCommand('search_requests', query, access)
	expect(combined).toMatchObject({ source: 'logs+background', dropped: null, backgroundDropped: 1 })
	expect(combined.entries).toHaveLength(2)
	const ids = (combined.entries as { id: number }[]).map((entry) => entry.id)
	for (const requestId of ids) {
		expect(await handleCaptureCommand('get_request_details', { captureId: 'history', requestId }, access)).toMatchObject({ kind: 'request_details' })
	}
})


it.each([undefined, null, '1000', NaN, Infinity, -Infinity, -1, 0, 999, 1000.5, 120001, 2147483648])(
	'rejects invalid capture duration %s without allocating a timer',
	async (durationMs) => {
		vi.useFakeTimers()
		const timersBefore = vi.getTimerCount()
		expect(await handleCaptureCommand('start_capture', { durationMs, method: '', path: '' }, access))
			.toMatchObject({ kind: 'error', code: 'INVALID_ARGUMENTS' })
		expect(vi.getTimerCount()).toBe(timersBefore)
		expect(isMcpCaptureEnabled(access.tabId)).toBe(false)
	},
)

it.each([1000, 120000])('stops capture at the accepted duration boundary %i', async (durationMs) => {
	vi.useFakeTimers()
	const now = Date.now()
	const result = await handleCaptureCommand('start_capture', { durationMs, method: '', path: '' }, access)
	expect(result).toMatchObject({ kind: 'capture', recordingUntil: now + durationMs })
	vi.advanceTimersByTime(durationMs - 1)
	expect(isMcpCaptureEnabled(access.tabId)).toBe(true)
	vi.advanceTimersByTime(1)
	expect(isMcpCaptureEnabled(access.tabId)).toBe(false)
})
