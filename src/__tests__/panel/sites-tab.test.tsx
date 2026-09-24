import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { IStore } from '@/interface/mock'
import { translations } from '@/panel/app/i18n/translations'
import { SitesTab } from '@/panel/app/settings/tabs/sites-tab'
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
const OTHER = 'https://other.example.com'

const store = (overrides: Partial<IStore> = {}): IStore => ({
	theme: 'light',
	active: true,
	mocks: [],
	totalMocksCreated: 0,
	collectionTree: { root: [], nodes: {} },
	activityInfo: { promoted: false },
	env: { activeId: 'default', profiles: [{ id: 'default', name: 'default', vars: {} }] },
	sitePermissions: {},
	...overrides,
} as unknown as IStore)

const autoGrantToggle = (): HTMLInputElement =>
	screen.getByTestId('site-access-auto-grant').querySelector('input') as HTMLInputElement

const lastSavedStore = (): IStore =>
	(persistStoreChange.mock.calls.at(-1)?.[0] as unknown as { updatedStore: IStore }).updatedStore

describe('SitesTab', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		useChromeStore.setState({ store: store(), urlMap: {}, dynamicUrlMap: {} })
		useGlobalStore.setState({ t, meta: { host: '', active: true, storeKey: '', tab: { id: 7 } } } as never)
	})

	it('starts with auto-grant off and nothing to save', () => {
		render(<SitesTab isDark={false} />)

		expect(autoGrantToggle()).not.toBeChecked()
		expect(screen.getByTestId('site-access-save')).toBeDisabled()
	})

	it('does not write anything until Save is pressed', () => {
		render(<SitesTab isDark={false} />)

		fireEvent.click(autoGrantToggle())

		// The switch moved, but the store is untouched: this is the whole point of the button.
		expect(autoGrantToggle()).toBeChecked()
		expect(persistStoreChange).not.toHaveBeenCalled()
		expect(screen.getByTestId('site-access-save')).toBeEnabled()
	})

	it('writes the change on Save', async () => {
		render(<SitesTab isDark={false} />)

		fireEvent.click(autoGrantToggle())
		fireEvent.click(screen.getByTestId('site-access-save'))

		await waitFor(() => expect(persistStoreChange).toHaveBeenCalledTimes(1))
		expect(lastSavedStore().autoGrantSites).toBe(true)
	})

	it('turns auto-grant back off through Save', async () => {
		useChromeStore.setState({ store: store({ autoGrantSites: true }), urlMap: {}, dynamicUrlMap: {} })
		render(<SitesTab isDark={false} />)

		expect(autoGrantToggle()).toBeChecked()
		fireEvent.click(autoGrantToggle())
		fireEvent.click(screen.getByTestId('site-access-save'))

		await waitFor(() => expect(persistStoreChange).toHaveBeenCalledTimes(1))
		expect(lastSavedStore().autoGrantSites).toBe(false)
	})

	it('disables Save again once the draft matches the stored value', () => {
		render(<SitesTab isDark={false} />)

		fireEvent.click(autoGrantToggle())
		expect(screen.getByTestId('site-access-save')).toBeEnabled()

		fireEvent.click(autoGrantToggle())
		expect(screen.getByTestId('site-access-save')).toBeDisabled()
	})

	it('stages a revoke instead of applying it straight away', () => {
		useChromeStore.setState({
			store: store({ sitePermissions: { [ORIGIN]: { grantedOn: 1 } } }),
			urlMap: {},
			dynamicUrlMap: {},
		})
		render(<SitesTab isDark={false} />)

		expect(screen.getByText(ORIGIN)).toBeInTheDocument()
		fireEvent.click(screen.getByTestId(`site-access-revoke-${ORIGIN}`))

		// The site is still listed and still granted; only Save makes it real.
		expect(persistStoreChange).not.toHaveBeenCalled()
		expect(screen.getByText(ORIGIN)).toBeInTheDocument()
		expect(screen.getByTestId('site-access-save')).toBeEnabled()
	})

	it('applies a staged revoke on Save', async () => {
		useChromeStore.setState({
			store: store({ sitePermissions: { [ORIGIN]: { grantedOn: 1 }, [OTHER]: { grantedOn: 2 } } }),
			urlMap: {},
			dynamicUrlMap: {},
		})
		render(<SitesTab isDark={false} />)

		fireEvent.click(screen.getByTestId(`site-access-revoke-${ORIGIN}`))
		fireEvent.click(screen.getByTestId('site-access-save'))

		await waitFor(() => expect(persistStoreChange).toHaveBeenCalledTimes(1))
		const saved = lastSavedStore()
		expect(saved.sitePermissions?.[ORIGIN]).toBeUndefined()
		// The site that was not marked must survive untouched.
		expect(saved.sitePermissions?.[OTHER]).toBeTruthy()
	})

	it('takes a staged revoke back before it is saved', () => {
		useChromeStore.setState({
			store: store({ sitePermissions: { [ORIGIN]: { grantedOn: 1 } } }),
			urlMap: {},
			dynamicUrlMap: {},
		})
		render(<SitesTab isDark={false} />)

		fireEvent.click(screen.getByTestId(`site-access-revoke-${ORIGIN}`))
		expect(screen.getByTestId('site-access-save')).toBeEnabled()

		fireEvent.click(screen.getByTestId(`site-access-revoke-${ORIGIN}`))

		// Back to where it started: nothing staged, nothing to save.
		expect(screen.getByTestId('site-access-save')).toBeDisabled()
		expect(persistStoreChange).not.toHaveBeenCalled()
	})

	it('does not offer a revoke while auto-grant is on', () => {
		// Revoking would be undone on the next visit, so the button is closed off and explained.
		useChromeStore.setState({
			store: store({ autoGrantSites: true, sitePermissions: { [ORIGIN]: { grantedOn: 1 } } }),
			urlMap: {},
			dynamicUrlMap: {},
		})
		render(<SitesTab isDark={false} />)

		expect(screen.getByTestId(`site-access-revoke-${ORIGIN}`)).toBeDisabled()
		expect(screen.getByTestId('site-access-revoke-blocked')).toBeInTheDocument()
	})

	it('frees the revoke button as soon as auto-grant is unticked', () => {
		useChromeStore.setState({
			store: store({ autoGrantSites: true, sitePermissions: { [ORIGIN]: { grantedOn: 1 } } }),
			urlMap: {},
			dynamicUrlMap: {},
		})
		render(<SitesTab isDark={false} />)

		fireEvent.click(autoGrantToggle())

		// The draft is enough: both changes then go out together on one Save.
		expect(screen.getByTestId(`site-access-revoke-${ORIGIN}`)).toBeEnabled()
		expect(screen.queryByTestId('site-access-revoke-blocked')).toBeNull()
	})

	it('turns auto-grant off and revokes a site in one Save', async () => {
		useChromeStore.setState({
			store: store({ autoGrantSites: true, sitePermissions: { [ORIGIN]: { grantedOn: 1 } } }),
			urlMap: {},
			dynamicUrlMap: {},
		})
		render(<SitesTab isDark={false} />)

		fireEvent.click(autoGrantToggle())
		fireEvent.click(screen.getByTestId(`site-access-revoke-${ORIGIN}`))
		fireEvent.click(screen.getByTestId('site-access-save'))

		await waitFor(() => expect(persistStoreChange).toHaveBeenCalledTimes(1))
		const saved = lastSavedStore()
		expect(saved.autoGrantSites).toBe(false)
		expect(saved.sitePermissions?.[ORIGIN]).toBeUndefined()
	})

	it('drops a staged revoke if auto-grant is ticked afterwards', async () => {
		useChromeStore.setState({
			store: store({ sitePermissions: { [ORIGIN]: { grantedOn: 1 } } }),
			urlMap: {},
			dynamicUrlMap: {},
		})
		render(<SitesTab isDark={false} />)

		fireEvent.click(screen.getByTestId(`site-access-revoke-${ORIGIN}`))
		fireEvent.click(autoGrantToggle())
		fireEvent.click(screen.getByTestId('site-access-save'))

		// Save must not apply a revoke the user can no longer see staged.
		await waitFor(() => expect(persistStoreChange).toHaveBeenCalledTimes(1))
		const saved = lastSavedStore()
		expect(saved.autoGrantSites).toBe(true)
		expect(saved.sitePermissions?.[ORIGIN]).toBeTruthy()
	})

	it('keeps a site recorded between render and Save', async () => {
		// The auto-grant hook can write while this tab is open. Save must build on the store as
		// it is at that moment, or the freshly recorded site would be written back out.
		useChromeStore.setState({
			store: store({ sitePermissions: { [ORIGIN]: { grantedOn: 1 } } }),
			urlMap: {},
			dynamicUrlMap: {},
		})
		render(<SitesTab isDark={false} />)

		fireEvent.click(autoGrantToggle())
		// No re-render in between: this is the window where a stale snapshot does the damage.
		useChromeStore.setState({
			store: store({ sitePermissions: { [ORIGIN]: { grantedOn: 1 }, [OTHER]: { grantedOn: 2 } } }),
			urlMap: {},
			dynamicUrlMap: {},
		})
		fireEvent.click(screen.getByTestId('site-access-save'))

		await waitFor(() => expect(persistStoreChange).toHaveBeenCalledTimes(1))
		expect(Object.keys(lastSavedStore().sitePermissions ?? {}).sort()).toEqual([ORIGIN, OTHER])
	})

	it('says so when no site has been granted access', () => {
		render(<SitesTab isDark={false} />)

		expect(screen.getByTestId('site-access-none')).toBeInTheDocument()
		expect(screen.queryByTestId('site-access-entries')).toBeNull()
	})
})
