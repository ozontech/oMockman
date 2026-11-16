import React from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MethodEnum } from '@/interface'
import { en } from '@/panel/app/i18n/translations'
import { Mocks } from '@/panel/app/mocks/mocks'
import { getDefaultStore } from '@/panel/app/service'
import { useChromeStore, useGlobalStore } from '@/panel/app/store'

vi.mock('@/panel/app/mocks/hooks/mocks-action', () => ({
	useMockActions: () => ({ toggleMock: vi.fn(), editMock: vi.fn(), duplicateMock: vi.fn(), deleteMock: vi.fn() }),
	useGlobalMocksToggle: () => ({ allMocksEnabled: true, handleToggleAllMocks: vi.fn() }),
	useCollectionActions: () => ({
		renameCollection: vi.fn(), createCollection: vi.fn(), deleteCollection: vi.fn(), toggleCollectionMocking: vi.fn(),
	}),
}))

describe('collection row', () => {
	beforeEach(() => {
		useGlobalStore.setState({ search: '', t: en })
		useChromeStore.setState({
			selectedMock: undefined,
			expandedCollections: [],
			store: {
				...getDefaultStore(),
				mocks: [{
					id: 'mock', name: 'Test mock', method: MethodEnum.GET, url: '/api/test',
					status: 200, active: true, description: '', response: '{}', collectionId: 'child',
				}],
				collectionTree: {
					root: [{ type: 'collection', id: 'parent' }],
					nodes: {
						parent: {
							id: 'parent', name: 'Parent', parentId: null, active: true, createdOn: 1,
							entries: [{ type: 'collection', id: 'child' }],
						},
						child: {
							id: 'child', name: 'Child', parentId: 'parent', active: true, createdOn: 1,
							entries: [{ type: 'mock', id: 'mock' }],
						},
					},
				},
			},
		})
	})

	it.each(['name', 'counter', 'arrow', 'empty cell', 'row'])('toggles once when clicking the %s', async (area) => {
		render(<Mocks />)
		const row = screen.getByTestId('collection-row')
		const targets = {
			name: within(row).getByText('Parent'),
			counter: within(row).getByText('1'),
			arrow: within(row).getByTitle(en.mocks_expand),
			'empty cell': within(row).getAllByRole('cell')[2],
			row,
		}
		expect(row).toHaveAttribute('data-expanded', 'false')
		expect(within(row).getByRole('button', { name: en.mocks_expand })).toBeInTheDocument()
		fireEvent.click(targets[area as keyof typeof targets])
		expect(useChromeStore.getState().expandedCollections).toEqual(['parent'])
		expect(row).toHaveAttribute('data-expanded', 'true')
		fireEvent.click(targets[area as keyof typeof targets])
		await waitFor(() => expect(row).toHaveAttribute('data-expanded', 'false'))
		expect(useChromeStore.getState().expandedCollections).toEqual([])
	})

	it('does not add keyboard navigation to the row', () => {
		render(<Mocks />)
		const row = screen.getByTestId('collection-row')
		expect(row).not.toHaveAttribute('tabindex')
		fireEvent.keyDown(row, { key: 'Enter' })
		fireEvent.keyDown(row, { key: ' ' })
		expect(row).toHaveAttribute('data-expanded', 'false')
	})

	it.each([false, true])('preserves expanded=%s when cancelling collection deletion', (expanded) => {
		useChromeStore.setState({ expandedCollections: expanded ? ['parent'] : [] })
		render(<Mocks />)
		const row = screen.getAllByTestId('collection-row')[0]
		fireEvent.click(within(row).getByTitle(en.col_delete('Parent')))
		fireEvent.click(screen.getByText(en.col_deleteBody('Parent')))
		expect(row).toHaveAttribute('data-expanded', String(expanded))
		fireEvent.click(screen.getByRole('button', { name: en.col_cancel }))
		expect(row).toHaveAttribute('data-expanded', String(expanded))
		expect(useChromeStore.getState().expandedCollections).toEqual(expanded ? ['parent'] : [])
	})

	it('does not toggle on action buttons or while editing the name', () => {
		render(<Mocks />)
		const row = screen.getByTestId('collection-row')
		fireEvent.click(within(row).getByTitle(en.mocks_disableCollection))
		fireEvent.click(within(row).getByTitle(en.col_addOptions))
		fireEvent.click(within(row).getByTitle(en.col_delete('Parent')))
		expect(row).toHaveAttribute('data-expanded', 'false')
		fireEvent.click(within(row).getByTitle(en.mocks_editRow('Parent')))
		const input = within(row).getByRole('textbox')
		fireEvent.click(input)
		fireEvent.keyDown(input, { key: ' ' })
		fireEvent.click(row)
		expect(row).toHaveAttribute('data-expanded', 'false')
		fireEvent.keyDown(input, { key: 'Enter' })
		expect(row).toHaveAttribute('data-expanded', 'false')
	})

	it('keeps nested collections independent and opens a mock without toggling its collection', async () => {
		render(<Mocks />)
		fireEvent.click(screen.getByText('Parent'))
		fireEvent.click(screen.getByText('Child'))
		expect(useChromeStore.getState().expandedCollections).toEqual(['parent', 'child'])
		fireEvent.click(screen.getByText('Test mock'))
		expect(useChromeStore.getState().selectedMock?.id).toBe('mock')
		expect(useChromeStore.getState().expandedCollections).toEqual(['parent', 'child'])
		fireEvent.click(screen.getByText('Child'))
		await waitFor(() => expect(screen.queryByText('Test mock')).toBeNull())
		expect(useChromeStore.getState().expandedCollections).toEqual(['parent'])
	})

	it('keeps the filtered counter when expanding search results', () => {
		render(<Mocks />)
		act(() => useGlobalStore.setState({ search: 'not found' }))
		const row = screen.getByTestId('collection-row')
		expect(within(row).getByText('0')).toBeInTheDocument()
		fireEvent.click(row)
		expect(row).toHaveAttribute('data-expanded', 'true')
		expect(screen.queryByText('Test mock')).toBeNull()
	})
})
