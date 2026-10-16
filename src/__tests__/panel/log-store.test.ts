import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ILog } from '@/interface/mock'
import { MAX_LOG_BODY_CHARS, MAX_LOGS, trimLogs, useLogStore } from '@/panel/app/store/use-log-store'

const log = (id: number, bodyChars = 0): ILog => ({
	id,
	request: { url: '/api', method: 'GET', headers: [] },
	response: { status: 200, response: 'x'.repeat(bodyChars), headers: [] },
})

describe('trimLogs', () => {
	it('keeps the newest logs up to the count limit', () => {
		const logs = Array.from({ length: MAX_LOGS + 5 }, (_, i) => log(i))

		const trimmed = trimLogs(logs)

		expect(trimmed).toHaveLength(MAX_LOGS)
		expect(trimmed[0].id).toBe(0)
	})

	it('drops the oldest logs once their bodies are over budget', () => {
		const half = MAX_LOG_BODY_CHARS / 2
		const trimmed = trimLogs([log(1, half), log(2, half), log(3, 10)])

		expect(trimmed.map(({ id }) => id)).toEqual([1, 2])
	})

	it('keeps the newest log even when it alone is over budget', () => {
		expect(trimLogs([log(1, MAX_LOG_BODY_CHARS + 1), log(2)]).map(({ id }) => id)).toEqual([1])
	})
})

describe('useLogStore', () => {
	afterEach(() => {
		vi.useRealTimers()
		useLogStore.setState({ logs: [], isClearing: false })
	})

	it('caps the logs on upsert', () => {
		useLogStore.setState({ logs: Array.from({ length: MAX_LOGS }, (_, i) => log(i + 1)) })

		useLogStore.getState().upsertLog(log(0))

		const { logs } = useLogStore.getState()
		expect(logs).toHaveLength(MAX_LOGS)
		expect(logs[0].id).toBe(0)
		expect(logs.at(-1)?.id).toBe(MAX_LOGS - 1)
	})
})
