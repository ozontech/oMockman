import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { IStore } from '@/interface/mock'
import type * as PanelService from '@/panel/app/service'
import { SiteAccessBanner } from '@/panel/app/blocks/site-access-banner'
import { translations } from '@/panel/app/i18n/translations'
import { useChromeStore, useGlobalStore } from '@/panel/app/store'

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

const reload = vi.fn()

type UpdateListener = (tabId: number, changeInfo: { url?: string }) => void

/**
 * The panel asks the background for the origin; the page never supplies it. `current` lets a
 * test change what the background answers, to mimic navigating to another site.
 */
const stubOrigin = (origin: string | null) => {
	const state = { current: origin, listeners: new Set<UpdateListener>() }
	vi.stubGlobal('chrome', {
		runtime: {
			sendMessage: (_msg: unknown, cb: (r: { origin: string | null }) => void) => cb({ origin: state.current }),
			lastError: undefined,
		},
		tabs: {
			reload,
			onUpdated: {
				addListener: (fn: UpdateListener) => state.listeners.add(fn),
				removeListener: (fn: UpdateListener) => state.listeners.delete(fn),
			},
		},
	})
	return {
		/** Mimics the browser navigating the inspected tab to another origin. */
		navigateTo(next: string | null, tabId = 7) {
			state.current = next
			for (const fn of state.listeners) fn(tabId, { url: next ?? 'about:blank' })
		},
	}
}

describe('SiteAccessBanner', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.unstubAllGlobals()
		useGlobalStore.setState({ t, resolvedScheme: 'light', meta: { host: '', active: true, storeKey: '', tab: { id: 7 } } } as never)
	})

	it('warns when the current site was never allowed', async () => {
		stubOrigin(ORIGIN)
		useChromeStore.setState({ store: store(), urlMap: {}, dynamicUrlMap: {} })

		render(<SiteAccessBanner />)

		await waitFor(() => expect(screen.getByTestId('site-access-banner')).toBeTruthy())
		expect(screen.getByText(t.siteAccess_bannerTitle(ORIGIN))).toBeTruthy()
	})

	it('stays out of the way once the site has access', async () => {
		stubOrigin(ORIGIN)
		useChromeStore.setState({
			store: store({ sitePermissions: { [ORIGIN]: { grantedOn: 1 } } }),
			urlMap: {},
			dynamicUrlMap: {},
		})

		render(<SiteAccessBanner />)

		await waitFor(() => expect(screen.queryByTestId('site-access-banner')).toBeNull())
	})

	it('says nothing on a page that cannot be mocked', async () => {
		stubOrigin(null)
		useChromeStore.setState({ store: store(), urlMap: {}, dynamicUrlMap: {} })

		render(<SiteAccessBanner />)

		await waitFor(() => expect(screen.queryByTestId('site-access-banner')).toBeNull())
	})

	it('grants the whole origin and reloads, so requests already sent are caught', async () => {
		stubOrigin(ORIGIN)
		useChromeStore.setState({ store: store(), urlMap: {}, dynamicUrlMap: {} })

		render(<SiteAccessBanner />)
		await waitFor(() => expect(screen.getByTestId('site-access-banner-action')).toBeTruthy())
		screen.getByTestId('site-access-banner-action').click()

		await waitFor(() => expect(persistStoreChange).toHaveBeenCalledTimes(1))
		const { updatedStore } = persistStoreChange.mock.calls[0][0] as unknown as { updatedStore: IStore }
		expect(updatedStore.sitePermissions?.[ORIGIN]).toBeTruthy()
		await waitFor(() => expect(reload).toHaveBeenCalledWith(7))
	})

	it('opens settings on the Site access tab from the banner link', async () => {
		stubOrigin(ORIGIN)
		useChromeStore.setState({ store: store(), urlMap: {}, dynamicUrlMap: {} })

		render(<SiteAccessBanner />)
		await waitFor(() => expect(screen.getByTestId('site-access-banner-settings')).toBeTruthy())
		screen.getByTestId('site-access-banner-settings').click()

		// Straight to the tab that holds the auto-grant switch, not the default one.
		await waitFor(() => expect(screen.getByTestId('site-access-auto-grant')).toBeTruthy())
	})

	it('keeps the settings modal open when the banner itself disappears', async () => {
		// Granting access from inside the modal hides the banner; the modal must not go with it.
		stubOrigin(ORIGIN)
		useChromeStore.setState({ store: store(), urlMap: {}, dynamicUrlMap: {} })

		const { rerender } = render(<SiteAccessBanner />)
		await waitFor(() => expect(screen.getByTestId('site-access-banner-settings')).toBeTruthy())
		screen.getByTestId('site-access-banner-settings').click()
		await waitFor(() => expect(screen.getByTestId('site-access-auto-grant')).toBeTruthy())

		useChromeStore.setState({ store: store({ autoGrantSites: true }), urlMap: {}, dynamicUrlMap: {} })
		rerender(<SiteAccessBanner />)

		await waitFor(() => expect(screen.queryByTestId('site-access-banner')).toBeNull())
		expect(screen.getByTestId('site-access-auto-grant')).toBeTruthy()
	})

	it('never renders two settings modals at once', async () => {
		// Open from the banner, let auto-grant hide the banner, then bring the banner back: the
		// modal must exist exactly once throughout, never as a second stacked copy.
		stubOrigin(ORIGIN)
		useChromeStore.setState({ store: store(), urlMap: {}, dynamicUrlMap: {} })

		const { rerender } = render(<SiteAccessBanner />)
		await waitFor(() => expect(screen.getByTestId('site-access-banner-settings')).toBeTruthy())
		screen.getByTestId('site-access-banner-settings').click()
		await waitFor(() => expect(screen.getAllByTestId('settings-close')).toHaveLength(1))

		useChromeStore.setState({ store: store({ autoGrantSites: true }), urlMap: {}, dynamicUrlMap: {} })
		rerender(<SiteAccessBanner />)
		await waitFor(() => expect(screen.queryByTestId('site-access-banner')).toBeNull())
		expect(screen.getAllByTestId('settings-close')).toHaveLength(1)

		useChromeStore.setState({ store: store(), urlMap: {}, dynamicUrlMap: {} })
		rerender(<SiteAccessBanner />)
		await waitFor(() => expect(screen.getByTestId('site-access-banner')).toBeTruthy())
		expect(screen.getAllByTestId('settings-close')).toHaveLength(1)
	})

	it('follows the tab to another site without a reload', async () => {
		// Navigating inside one tab keeps the same tabId, so the panel has to watch for it.
		const nav = stubOrigin(ORIGIN)
		useChromeStore.setState({
			store: store({ sitePermissions: { [ORIGIN]: { grantedOn: 1 } } }),
			urlMap: {},
			dynamicUrlMap: {},
		})

		render(<SiteAccessBanner />)
		await waitFor(() => expect(screen.queryByTestId('site-access-banner')).toBeNull())

		nav.navigateTo(OTHER_ORIGIN)

		// The new site has no grant, so the banner must appear and name it.
		await waitFor(() => expect(screen.getByTestId('site-access-banner')).toBeTruthy())
		expect(screen.getByText(t.siteAccess_bannerTitle(OTHER_ORIGIN))).toBeTruthy()
	})

	it('stays hidden while auto-grant is on', async () => {
		// Recording the site is the app's job now; the banner only has to keep quiet.
		stubOrigin(ORIGIN)
		useChromeStore.setState({ store: store({ autoGrantSites: true }), urlMap: {}, dynamicUrlMap: {} })

		render(<SiteAccessBanner />)

		await waitFor(() => expect(screen.queryByTestId('site-access-banner')).toBeNull())
		expect(persistStoreChange).not.toHaveBeenCalled()
	})
})
