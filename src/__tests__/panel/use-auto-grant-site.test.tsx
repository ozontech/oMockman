import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { IStore } from '@/interface/mock'
import { SiteAccessBanner } from '@/panel/app/blocks/site-access-banner'
import { useAutoGrantSite } from '@/panel/app/hooks/use-auto-grant-site'
import { translations } from '@/panel/app/i18n/translations'
import { useChromeStore, useGlobalStore } from '@/panel/app/store'
import type * as PanelService from '@/panel/app/service'

const toastApi = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }))
vi.mock('react-toastify', () => ({ toast: toastApi }))

/** `persistStoreChange` keeps its own reference to the store actions, so it is mocked whole. */
const persistStoreChange = vi.hoisted(() => vi.fn((args: { updatedStore: unknown }) => {
	void args
	return Promise.resolve(undefined)
}))
vi.mock('@/panel/app/service', async (importOriginal) => ({
	...(await importOriginal<typeof PanelService>()),
	persistStoreChange,
}))

const t = translations.en
const ORIGIN = 'https://app.example.com'
const OTHER_ORIGIN = 'https://other.example.com'

const store = (overrides: Partial<IStore> = {}): IStore => ({
	theme: 'light',
	active: true,
	totalMocksCreated: 0,
	mocks: [],
	collectionTree: { root: [], nodes: {} },
	activityInfo: { promoted: false },
	env: { activeId: 'default', profiles: [{ id: 'default', name: 'default', vars: {} }] },
	sitePermissions: {},
	...overrides,
} as unknown as IStore)

const lastSavedStore = (): IStore =>
	(persistStoreChange.mock.calls.at(-1)?.[0] as unknown as { updatedStore: IStore }).updatedStore

type UpdateListener = (tabId: number, changeInfo: { url?: string; status?: string }) => void

const stubOrigin = (origin: string | null) => {
	const state = { current: origin, listeners: new Set<UpdateListener>() }
	vi.stubGlobal('chrome', {
		runtime: {
			sendMessage: (_msg: unknown, cb: (r: { origin: string | null }) => void) => cb({ origin: state.current }),
			lastError: undefined,
		},
		tabs: {
			reload: vi.fn(),
			onUpdated: {
				addListener: (fn: UpdateListener) => state.listeners.add(fn),
				removeListener: (fn: UpdateListener) => state.listeners.delete(fn),
			},
		},
	})
	return {
		navigateTo(next: string | null, tabId = 7) {
			state.current = next
			for (const fn of state.listeners) fn(tabId, { url: next ?? 'about:blank' })
		},
		/**
		 * A plain reload of the same address. Chrome reports `status` but no `url`, because the
		 * url did not change — so this is the only signal the panel gets.
		 */
		reloadSamePage(next: string | null, tabId = 7) {
			state.current = next
			for (const fn of state.listeners) fn(tabId, { status: 'loading' })
		},
	}
}

/** Mirrors the app: the hook runs alongside the banner, not inside it. */
const Host: React.FC = () => {
	useAutoGrantSite()
	return <SiteAccessBanner />
}

describe('useAutoGrantSite', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.unstubAllGlobals()
		useGlobalStore.setState({ t, resolvedScheme: 'light', meta: { host: '', active: true, storeKey: '', tab: { id: 7 } } } as never)
	})

	it('records the current site so the list shows what was allowed', async () => {
		stubOrigin(ORIGIN)
		useChromeStore.setState({ store: store({ autoGrantSites: true }), urlMap: {}, dynamicUrlMap: {} })

		render(<Host />)

		await waitFor(() => expect(persistStoreChange).toHaveBeenCalledTimes(1))
		expect(lastSavedStore().sitePermissions?.[ORIGIN]).toBeTruthy()
	})

	it('keeps recording after the banner is gone', async () => {
		// The regression: with auto-grant on the banner never renders, so recording from inside
		// it stopped after the first site and the list only filled up on a DevTools restart.
		const nav = stubOrigin(ORIGIN)
		useChromeStore.setState({ store: store({ autoGrantSites: true }), urlMap: {}, dynamicUrlMap: {} })

		render(<Host />)
		await waitFor(() => expect(persistStoreChange).toHaveBeenCalledTimes(1))
		expect(screen.queryByTestId('site-access-banner')).toBeNull()

		useChromeStore.setState({
			store: store({ autoGrantSites: true, sitePermissions: { [ORIGIN]: { grantedOn: 1 } } }),
			urlMap: {},
			dynamicUrlMap: {},
		})
		nav.navigateTo(OTHER_ORIGIN)

		await waitFor(() => expect(persistStoreChange).toHaveBeenCalledTimes(2))
		expect(lastSavedStore().sitePermissions?.[OTHER_ORIGIN]).toBeTruthy()
	})

	it('records the site after a plain reload of the same page', async () => {
		// The regression: reloading does not change the url, so Chrome reports `status` only. The
		// panel used to ignore that, and the site reached the list only on a DevTools restart.
		const nav = stubOrigin(null)
		useChromeStore.setState({ store: store({ autoGrantSites: true }), urlMap: {}, dynamicUrlMap: {} })

		render(<Host />)
		await waitFor(() => expect(screen.queryByTestId('site-access-banner')).toBeNull())
		expect(persistStoreChange).not.toHaveBeenCalled()

		nav.reloadSamePage(ORIGIN)

		await waitFor(() => expect(persistStoreChange).toHaveBeenCalledTimes(1))
		expect(lastSavedStore().sitePermissions?.[ORIGIN]).toBeTruthy()
	})

	it('writes nothing while auto-grant is off', async () => {
		const nav = stubOrigin(ORIGIN)
		useChromeStore.setState({ store: store(), urlMap: {}, dynamicUrlMap: {} })

		render(<Host />)
		await waitFor(() => expect(screen.getByTestId('site-access-banner')).toBeTruthy())
		nav.navigateTo(OTHER_ORIGIN)

		await waitFor(() => expect(screen.getByText(t.siteAccess_bannerTitle(OTHER_ORIGIN))).toBeTruthy())
		expect(persistStoreChange).not.toHaveBeenCalled()
	})

	it('does not rewrite a site that is already recorded', async () => {
		stubOrigin(ORIGIN)
		useChromeStore.setState({
			store: store({ autoGrantSites: true, sitePermissions: { [ORIGIN]: { grantedOn: 1 } } }),
			urlMap: {},
			dynamicUrlMap: {},
		})

		render(<Host />)

		await waitFor(() => expect(screen.queryByTestId('site-access-banner')).toBeNull())
		expect(persistStoreChange).not.toHaveBeenCalled()
	})

	it('ignores a page that cannot be mocked', async () => {
		stubOrigin(null)
		useChromeStore.setState({ store: store({ autoGrantSites: true }), urlMap: {}, dynamicUrlMap: {} })

		render(<Host />)

		await waitFor(() => expect(screen.queryByTestId('site-access-banner')).toBeNull())
		expect(persistStoreChange).not.toHaveBeenCalled()
	})
})
