import { describe, it, expect, vi, afterEach } from 'vitest'

vi.stubGlobal('chrome', {
	storage: {
		onChanged: {
			addListener: vi.fn(),
			removeListener: vi.fn(),
		},
	},
})

describe('useStorageSync', () => {
	afterEach(() => {
		vi.clearAllMocks()
	})

	it('loads the module without errors', async () => {
		const { useStorageSync } = await import('../../panel/app/hooks/use-storage-sync')
		expect(useStorageSync).toBeDefined()
		expect(typeof useStorageSync).toBe('function')
	})
})