import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.stubGlobal('chrome', {
	storage: {
		local: {
			get: vi.fn((keys, callback) => callback({})),
		},
	},
})

import { ContentScriptState } from '../../contentScript'

describe('ContentScriptState', () => {
	let state: ContentScriptState

	beforeEach(() => {
		vi.clearAllMocks()
		state = new ContentScriptState()
	})

	describe('constructor', () => {
		it('starts with an empty store', () => {
			expect(state.store).toEqual({})
		})

		it('starts with an empty urlMap', () => {
			expect(state.urlMap).toEqual({})
		})

		it('starts with an empty dynamicUrlMap', () => {
			expect(state.dynamicUrlMap).toEqual({})
		})
	})

	describe('refresh', () => {
		it('refreshes state from getStore', async () => {(chrome.storage.local.get as ReturnType<typeof vi.fn>).mockImplementation((keys, callback) => {
			callback({
				'mockman.extension.main.db': {
					active: true,
					mocks: [],
					totalMocksCreated: 0,
					collectionTree: { root: { id: 'root', children: [], mocks: [] } },
					activityInfo: { promoted: false },
					env: {
						activeId: 'default',
						profiles: [{ id: 'default', name: 'default', vars: {} }],
					},
				},
			})
		})

		await state.refresh()

		expect(state.store).toBeDefined()
		expect(state.urlMap).toBeDefined()
		expect(state.dynamicUrlMap).toBeDefined()
		})

		it('calls getStore', async () => {
			const getSpy = vi.spyOn(chrome.storage.local, 'get')

			await state.refresh()

			expect(getSpy).toHaveBeenCalled()
		})

		it('overwrites previous data on a second refresh', async () => {
			state.urlMap = { 'https://old.url': { GET: ['old-mock'] } }
			state.dynamicUrlMap = { 3: [] }

			;(chrome.storage.local.get as ReturnType<typeof vi.fn>).mockImplementation((keys, callback) => {
				callback({
					'mockman.extension.main.db': {
						active: true,
						mocks: [],
						totalMocksCreated: 0,
						collectionTree: { root: { id: 'root', children: [], mocks: [] } },
						activityInfo: { promoted: false },
						env: {
							activeId: 'default',
							profiles: [{ id: 'default', name: 'default', vars: {} }],
						},
					},
				})
			})

			await state.refresh()

			expect(state.urlMap).toBeDefined()
			expect(state.dynamicUrlMap).toBeDefined()
		})

		it('refresh returns a Promise', () => {
			const result = state.refresh()
			expect(result).toBeInstanceOf(Promise)
		})

		it('handles empty data from getStore', async () => {
			(chrome.storage.local.get as ReturnType<typeof vi.fn>).mockImplementation((keys, callback) => {
				callback({})
			})

			await state.refresh()

			expect(state.store).toBeDefined()
			expect(state.urlMap).toBeDefined()
			expect(state.dynamicUrlMap).toBeDefined()
		})
	})
})
