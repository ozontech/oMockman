import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.stubGlobal('chrome', {
	runtime: {
		sendMessage: vi.fn(),
	},
})

const { fetchFullResponseHeaders } = await import('../../contentScript/headers')

describe('fetchFullResponseHeaders', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('returns headers on a successful response', async () => {
		const mockHeaders = [
			{ name: 'Content-Type', value: 'application/json' },
			{ name: 'X-Custom', value: 'value' },
		]
		;(chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockImplementation(
			(msg, callback) => callback({ headers: mockHeaders }),
		)

		const result = await fetchFullResponseHeaders('http://example.com/api', 'GET')

		expect(result).toEqual(mockHeaders)
	})

	it('returns null for an empty header array', async () => {
		(chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockImplementation(
			(_, callback) => callback({ headers: [] }),
		)

		const result = await fetchFullResponseHeaders('http://example.com/api', 'POST')

		expect(result).toBeNull()
	})

	it('returns null when the response has no headers', async () => {
		(chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockImplementation(
			(_, callback) => callback({}),
		)

		const result = await fetchFullResponseHeaders('http://example.com/api', 'GET')

		expect(result).toBeNull()
	})

	it('returns null on error', async () => {
		(chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockImplementation(() => {
			throw new Error('Test error')
		})

		const result = await fetchFullResponseHeaders('http://example.com/api', 'GET')

		expect(result).toBeNull()
	})

	it('passes the URL to sendMessage', async () => {
		(chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockImplementation(
			(msg, callback) => callback({ headers: [{ name: 'X-Test', value: '1' }] }),
		)

		await fetchFullResponseHeaders('http://example.com/api/test', 'GET')

		expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				url: 'http://example.com/api/test',
			}),
			expect.any(Function),
		)
	})
})
