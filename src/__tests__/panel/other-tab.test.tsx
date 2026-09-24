import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { OtherTab } from '@/panel/app/settings/tabs/other-tab'
import { translations } from '@/panel/app/i18n/translations'
import { useChromeStore, useGlobalStore } from '@/panel/app/store'
import type { IStore } from '@/interface/mock'
import type * as ActualModule from '@/panel/app/service'

const updateStoreInDB = vi.fn()
const toastApi = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }))

vi.mock('react-toastify', () => ({ toast: toastApi }))

vi.mock('@/panel/app/service', async (importOriginal) => {
	const actual = await importOriginal<typeof ActualModule>()
	return {
		...actual,
		storeActions: { ...actual.storeActions, updateStoreInDB: (...args: unknown[]) => updateStoreInDB(...args) },
	}
})

const t = translations.en

const store = (overrides: Partial<IStore> = {}): IStore => ({
	theme: 'light',
	active: false,
	mocks: [],
	totalMocksCreated: 0,
	collectionTree: { root: [], nodes: {} },
	activityInfo: { promoted: false },
	env: { activeId: 'default', profiles: [{ id: 'default', name: 'default', vars: {} }] },
	...overrides,
} as IStore)

const localToggle = (): HTMLInputElement =>
	screen.getByTestId('allow-local-openapi').querySelector('input') as HTMLInputElement

describe('OtherTab', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		updateStoreInDB.mockImplementation(async (next: IStore) => ({ store: next, urlMap: {}, dynamicUrlMap: {} }))
		useChromeStore.setState({ store: store(), urlMap: {}, dynamicUrlMap: {} })
		useGlobalStore.setState({ scheme: 'light', lang: 'en', t: translations.en })
	})

	it('shows local OpenAPI sources as disabled by default', () => {
		render(<OtherTab isDark={false} />)

		expect(screen.getByText(t.other_security)).toBeInTheDocument()
		expect(localToggle()).not.toBeChecked()
		expect(screen.getByTestId('settings-save')).toBeDisabled()
	})

	it('persists the opt-in only after save', async () => {
		render(<OtherTab isDark={false} />)

		fireEvent.click(localToggle())
		expect(updateStoreInDB).not.toHaveBeenCalled()
		expect(screen.getByTestId('settings-save')).toBeEnabled()

		fireEvent.click(screen.getByTestId('settings-save'))

		await waitFor(() => expect(updateStoreInDB).toHaveBeenCalledTimes(1))
		expect((updateStoreInDB.mock.calls[0][0] as IStore).security).toEqual({ allowLocalOpenApi: true })
	})

	it('reflects an opt-in that is already stored', () => {
		useChromeStore.setState({ store: store({ security: { allowLocalOpenApi: true } }), urlMap: {}, dynamicUrlMap: {} })
		render(<OtherTab isDark={false} />)

		expect(localToggle()).toBeChecked()
	})

	it('turns the opt-in back off', async () => {
		useChromeStore.setState({ store: store({ security: { allowLocalOpenApi: true } }), urlMap: {}, dynamicUrlMap: {} })
		render(<OtherTab isDark={false} />)

		fireEvent.click(localToggle())
		fireEvent.click(screen.getByTestId('settings-save'))

		await waitFor(() => expect(updateStoreInDB).toHaveBeenCalledTimes(1))
		expect((updateStoreInDB.mock.calls[0][0] as IStore).security).toEqual({ allowLocalOpenApi: false })
	})

	it('saves the theme without touching the store', async () => {
		render(<OtherTab isDark={false} />)

		fireEvent.click(screen.getByTestId('theme-dark'))
		fireEvent.click(screen.getByTestId('settings-save'))

		await waitFor(() => expect(useGlobalStore.getState().scheme).toBe('dark'))
		expect(updateStoreInDB).not.toHaveBeenCalled()
	})

	it('switches the interface language', async () => {
		render(<OtherTab isDark={false} />)

		fireEvent.click(screen.getByLabelText(t.other_languageRu, { selector: 'input' }))
		fireEvent.click(screen.getByTestId('settings-save'))

		await waitFor(() => expect(useGlobalStore.getState().lang).toBe('ru'))
	})

	it('reports a failed save and does not claim success', async () => {
		const { StorageWriteError } = await import('@/panel/app/service/storage-error')
		updateStoreInDB.mockRejectedValue(new StorageWriteError('QUOTA_BYTES quota exceeded'))
		render(<OtherTab isDark={false} />)

		fireEvent.click(localToggle())
		fireEvent.click(screen.getByTestId('settings-save'))

		await waitFor(() => expect(toastApi.error).toHaveBeenCalledWith(
			'Could not save to extension storage: QUOTA_BYTES quota exceeded',
		))
		expect(toastApi.success).not.toHaveBeenCalled()
	})
})
