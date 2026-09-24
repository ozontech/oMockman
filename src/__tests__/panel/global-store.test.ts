import { describe, it, expect, beforeEach } from 'vitest'

import { useGlobalStore, ViewEnum } from '../../panel/app/store/use-global-store'

describe('useGlobalStore', () => {
	beforeEach(() => {
		useGlobalStore.setState({
			view: ViewEnum.MOCKS,
			search: '',
			recording: false,
			loggingEnabled: true,
			allMocksEnabled: false,
			scheme: 'light',
			meta: { host: '', active: false, storeKey: '' },
			importQueue: [],
		})
	})

	describe('view', () => {
		it('setView changes view', () => {
			useGlobalStore.getState().setView(ViewEnum.LOGS)
			expect(useGlobalStore.getState().view).toBe(ViewEnum.LOGS)
		})
	})

	describe('search', () => {
		it('setSearch changes search', () => {
			useGlobalStore.getState().setSearch('test')
			expect(useGlobalStore.getState().search).toBe('test')
		})
	})

	describe('recording', () => {
		it('toggleRecording toggles recording', () => {
			expect(useGlobalStore.getState().recording).toBe(false)
			useGlobalStore.getState().toggleRecording()
			expect(useGlobalStore.getState().recording).toBe(true)
			useGlobalStore.getState().toggleRecording()
			expect(useGlobalStore.getState().recording).toBe(false)
		})
	})

	describe('loggingEnabled', () => {
		it('toggleLogging toggles loggingEnabled', () => {
			expect(useGlobalStore.getState().loggingEnabled).toBe(true)
			useGlobalStore.getState().toggleLogging()
			expect(useGlobalStore.getState().loggingEnabled).toBe(false)
		})
	})

	describe('allMocksEnabled', () => {
		it('toggleAllMocks toggles allMocksEnabled', () => {
			expect(useGlobalStore.getState().allMocksEnabled).toBe(false)
			useGlobalStore.getState().toggleAllMocks()
			expect(useGlobalStore.getState().allMocksEnabled).toBe(true)
		})
	})

	describe('scheme', () => {
		it('setScheme changes scheme', () => {
			useGlobalStore.getState().setScheme('dark')
			expect(useGlobalStore.getState().scheme).toBe('dark')
		})

		it('toggleScheme toggles scheme', () => {
			useGlobalStore.getState().setScheme('light')
			useGlobalStore.getState().toggleScheme()
			expect(useGlobalStore.getState().scheme).toBe('dark')
		})
	})

	describe('meta', () => {
		it('setMeta changes meta', () => {
			const newMeta = { host: 'example.com', active: true, storeKey: 'test' }
			useGlobalStore.getState().setMeta(newMeta)
			expect(useGlobalStore.getState().meta).toEqual(newMeta)
		})
	})

	describe('importQueue', () => {
		it('pushImportQueue adds to the queue', () => {
			useGlobalStore.getState().pushImportQueue([{ id: 1 }])
			expect(useGlobalStore.getState().importQueue).toHaveLength(1)
		})

		it('shiftImportQueue removes from the queue', () => {
			useGlobalStore.getState().pushImportQueue([{ id: 1 }, { id: 2 }])
			const item = useGlobalStore.getState().shiftImportQueue()
			expect(item).toEqual({ id: 1 })
			expect(useGlobalStore.getState().importQueue).toHaveLength(1)
		})

		it('shiftImportQueue returns undefined for an empty queue', () => {
			const item = useGlobalStore.getState().shiftImportQueue()
			expect(item).toBeUndefined()
		})
	})
})