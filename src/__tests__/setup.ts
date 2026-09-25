import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

const mockBrowser = {
	runtime: {
		sendMessage: vi.fn().mockResolvedValue({ ok: true, sourceUrl: '', spec: {} }),
	},
}

vi.stubGlobal('browser', mockBrowser)

vi.stubGlobal('chrome', {
	runtime: {
		sendMessage: vi.fn((_message, callback) => {
			if (callback) callback({ ok: true, sourceUrl: '', spec: {} })
		}),
		onMessage: {
			addListener: vi.fn(),
			removeListener: vi.fn(),
		},
		lastError: null,
	},
})

vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query) => ({
	matches: false,
	media: query,
	onchange: null,
	addListener: vi.fn(),
	removeListener: vi.fn(),
	addEventListener: vi.fn(),
	removeEventListener: vi.fn(),
	dispatchEvent: vi.fn(),
})))

vi.stubGlobal('ResizeObserver', vi.fn().mockImplementation(() => ({
	observe: vi.fn(),
	unobserve: vi.fn(),
	disconnect: vi.fn(),
})))

vi.stubGlobal('IntersectionObserver', vi.fn().mockImplementation(() => ({
	observe: vi.fn(),
	unobserve: vi.fn(),
	disconnect: vi.fn(),
	takeRecords: vi.fn(),
	root: null,
	rootMargin: '',
	thresholds: [],
})))
