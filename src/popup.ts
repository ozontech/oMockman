/**
 * The extension popup: a switch for all mocks, how to open the panel, the version and the docs.
 *
 * It shares the panel's origin, so it follows the theme and the language picked there. With
 * "system" or nothing picked, popup.html follows prefers-color-scheme on its own.
 */
import { STORE_KEY } from '@/background/store-access'
import { DOCS_URL } from '@/services/docs'

export const THEME_STORAGE_KEY = 'mockman.theme'
const LANG_STORAGE_KEY = 'mockman.lang'

type Lang = 'en' | 'ru'

const TEXT: Record<Lang, {
	on: string
	off: string
	noStore: string
	hintBefore: string
	hintAfter: string
	docs: string
}> = {
	en: {
		on: 'Mocking on',
		off: 'Mocking off',
		noStore: 'Open the panel to start',
		hintBefore: 'Panel: ',
		hintAfter: ' → Mockman tab',
		docs: 'Docs',
	},
	ru: {
		on: 'Моки включены',
		off: 'Моки выключены',
		noStore: 'Откройте панель, чтобы начать',
		hintBefore: 'Панель: ',
		hintAfter: ' → вкладка Mockman',
		docs: 'Документация',
	},
}

type StoredStore = Record<string, unknown> & { active?: unknown }

export interface PopupStorage {
	get: (keys: string[], callback: (items: Record<string, unknown>) => void) => void
	set: (items: Record<string, unknown>, callback: () => void) => void
}

export interface PopupDeps {
	storage: PopupStorage
	/** Called back whenever the store changes elsewhere, e.g. in an open panel. */
	onStoreChanged?: (listener: () => void) => void
	lastError?: () => { message?: string } | undefined
	version: string
	lang: Lang
}

export function applyStoredTheme(root: HTMLElement, storage: Pick<Storage, 'getItem'> | undefined): void {
	let theme: string | null = null
	try {
		theme = storage?.getItem(THEME_STORAGE_KEY) ?? null
	} catch {
		return
	}
	if (theme === 'light' || theme === 'dark') root.dataset.theme = theme
	else delete root.dataset.theme
}

function readStore(deps: PopupDeps): Promise<StoredStore | null> {
	return new Promise((resolve) => {
		try {
			deps.storage.get([STORE_KEY], (items) => {
				const store = items?.[STORE_KEY]
				resolve(store && typeof store === 'object' ? (store as StoredStore) : null)
			})
		} catch {
			resolve(null)
		}
	})
}

/**
 * Reads the store right before writing it: the panel may have changed it since the popup opened,
 * and a stale copy would undo that. False when there is no store yet or the write failed.
 */
export async function setMockingActive(deps: PopupDeps, active: boolean): Promise<boolean> {
	const store = await readStore(deps)
	if (!store) return false
	return new Promise((resolve) => {
		try {
			deps.storage.set({ [STORE_KEY]: { ...store, active } }, () => resolve(!deps.lastError?.()))
		} catch {
			resolve(false)
		}
	})
}

export async function initPopup(doc: Document, deps: PopupDeps): Promise<void> {
	const text = TEXT[deps.lang]
	const toggle = doc.getElementById('mocking-toggle') as HTMLInputElement | null
	const row = doc.getElementById('mocking-row')
	const label = doc.getElementById('mocking-label')
	const hint = doc.getElementById('hint')
	const version = doc.getElementById('version')
	const docs = doc.getElementById('docs') as HTMLAnchorElement | null

	if (hint) {
		const key = doc.createElement('kbd')
		key.textContent = 'F12'
		hint.replaceChildren(text.hintBefore, key, text.hintAfter)
	}
	if (version) version.textContent = deps.version ? `v${deps.version}` : ''
	if (docs) {
		docs.href = DOCS_URL
		docs.textContent = text.docs
	}
	if (!toggle || !row || !label) return

	let rendered = false
	const render = (store: StoredStore | null): void => {
		const available = store !== null
		const active = store?.active === true
		toggle.disabled = !available
		toggle.checked = active
		row.setAttribute('aria-disabled', String(!available))
		row.classList.toggle('on', available && active)
		const next = !available ? text.noStore : active ? text.on : text.off
		if (rendered && label.textContent === next) return
		const animate = rendered
		rendered = true
		label.textContent = next
		if (!animate) return
		// Restart the fade-in on every change, not only the first.
		label.classList.remove('changed')
		void label.offsetWidth
		label.classList.add('changed')
	}

	render(await readStore(deps))

	toggle.addEventListener('change', () => {
		const next = toggle.checked
		toggle.disabled = true
		void setMockingActive(deps, next).then(async (ok) => {
			// On a failed write show what is really stored, not what was clicked.
			render(ok ? { active: next } : await readStore(deps))
		})
	})

	deps.onStoreChanged?.(() => {
		void readStore(deps).then(render)
	})
}

if (typeof document !== 'undefined') {
	let local: Storage | undefined
	try {
		local = window.localStorage
	} catch {
		local = undefined
	}
	applyStoredTheme(document.documentElement, local)

	const ext = (globalThis as unknown as { chrome?: typeof chrome }).chrome
	if (ext?.storage?.local) {
		let lang: Lang = 'en'
		try {
			lang = local?.getItem(LANG_STORAGE_KEY) === 'ru' ? 'ru' : 'en'
		} catch {
			lang = 'en'
		}
		const start = () => void initPopup(document, {
			storage: ext.storage.local as unknown as PopupStorage,
			onStoreChanged: (listener) => ext.storage.onChanged.addListener((changes, area) => {
				if (area === 'local' && changes[STORE_KEY]) listener()
			}),
			lastError: () => ext.runtime?.lastError,
			version: ext.runtime?.getManifest?.().version ?? '',
			lang,
		})
		if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start)
		else start()
	}
}
