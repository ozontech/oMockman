import { create } from 'zustand'

import type { Lang } from '@/panel/app/i18n/translations'
import { translations } from '@/panel/app/i18n/translations'

export enum ViewEnum {
	MOCKS = 'MOCKS',
	LOGS = 'LOGS',
}

export type ColorScheme = 'light' | 'dark' | 'system'

export interface GlobalStoreState {
	view: ViewEnum
	setView: (view: ViewEnum) => void

	search: string
	setSearch: (s: string) => void

	recording: boolean
	toggleRecording: () => void

	loggingEnabled: boolean
	toggleLogging: () => void

	allMocksEnabled: boolean
	toggleAllMocks: () => void

	/** Saved preference (light / dark / system). Actual rendered scheme is resolved separately. */
	scheme: ColorScheme
	setScheme: (scheme: ColorScheme) => void
	/** Resolved scheme for rendering (light | dark — never system). */
	resolvedScheme: 'light' | 'dark'
	toggleScheme: () => void

	lang: Lang
	setLang: (lang: Lang) => void
	t: typeof translations['en']

	meta: {
		host: string
		tab?: chrome.tabs.Tab
		active: boolean
		storeKey: string
	}
	setMeta: (m: GlobalStoreState['meta']) => void

	importQueue?: Array<Record<string, unknown>>
	pushImportQueue: (items: Array<Record<string, unknown>>) => void
	shiftImportQueue: () => Record<string, unknown> | undefined
}

function getSystemDark(): boolean {
	return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
}

function resolveScheme(scheme: ColorScheme): 'light' | 'dark' {
	if (scheme === 'system') return getSystemDark() ? 'dark' : 'light'
	return scheme
}

function getInitialScheme(): ColorScheme {
	if (typeof window !== 'undefined') {
		const ls = localStorage.getItem('mockman.theme') as ColorScheme | null
		if (ls === 'light' || ls === 'dark' || ls === 'system') return ls
		if (getSystemDark()) return 'dark'
	}
	return 'light'
}

function getInitialLang(): Lang {
	if (typeof window !== 'undefined') {
		const ls = localStorage.getItem('mockman.lang') as Lang | null
		if (ls === 'en' || ls === 'ru') return ls
	}
	return 'en'
}

function applyScheme(resolved: 'light' | 'dark') {
	if (typeof window !== 'undefined') {
		document.body.classList.toggle('dark', resolved === 'dark')
	}
}

const initialScheme = getInitialScheme()
const initialResolved = resolveScheme(initialScheme)
applyScheme(initialResolved)

const initialLang = getInitialLang()

export const useGlobalStore = create<GlobalStoreState>((set, get) => ({
	view: ViewEnum.MOCKS,
	setView: (view) => set({ view }),

	search: '',
	setSearch: (s) => set({ search: s }),

	recording: false,
	toggleRecording: () => set({ recording: !get().recording }),

	loggingEnabled: true,
	toggleLogging: () => set({ loggingEnabled: !get().loggingEnabled }),

	allMocksEnabled: true,
	toggleAllMocks: () => set({ allMocksEnabled: !get().allMocksEnabled }),

	scheme: initialScheme,
	resolvedScheme: initialResolved,
	setScheme: (scheme) => {
		const resolved = resolveScheme(scheme)
		if (typeof window !== 'undefined') {
			document.body.classList.add('mm-theme-anim')
			window.setTimeout(() => document.body.classList.remove('mm-theme-anim'), 350)
			localStorage.setItem('mockman.theme', scheme)
			applyScheme(resolved)
		}
		set({ scheme, resolvedScheme: resolved })
	},
	toggleScheme: () => {
		const current = get().resolvedScheme
		get().setScheme(current === 'dark' ? 'light' : 'dark')
	},

	lang: initialLang,
	t: translations[initialLang],
	setLang: (lang) => {
		if (typeof window !== 'undefined') {
			localStorage.setItem('mockman.lang', lang)
		}
		set({ lang, t: translations[lang] })
	},

	meta: {
		host: '',
		active: false,
		storeKey: '',
	},
	setMeta: (meta) => set({ meta }),

	importQueue: [],
	pushImportQueue: (items) => set({ importQueue: [...(get().importQueue ?? []), ...items] }),
	shiftImportQueue: () => {
		const q = [...(get().importQueue ?? [])]
		const first = q.shift()
		set({ importQueue: q })
		return first
	},
}))
