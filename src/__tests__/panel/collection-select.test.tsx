import React, { useState } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ICollectionTree } from '@/interface/collection'
import type { IMockResponse, IStore } from '@/interface/mock'
import { MethodEnum } from '@/interface/network'
import { en } from '@/panel/app/i18n/translations'
import { AddMockForm } from '@/panel/app/mocks/addMock/add-mock-form'
import { buildCollectionOptions, CollectionSelect } from '@/panel/app/mocks/addMock/collection-select'
import { getDefaultStore } from '@/panel/app/service'
import type * as Service from '@/panel/app/service'
import { useGlobalStore } from '@/panel/app/store'

const saved = vi.hoisted((): IStore[] => [])

vi.mock('@/panel/app/service', async (importOriginal) => ({
	...(await importOriginal<typeof Service>()),
	persistStoreChange: vi.fn(async ({ updatedStore }: { updatedStore: IStore }) => { saved.push(updatedStore) }),
}))

// The editor's layout is unrelated to choosing where the mock is saved.
vi.mock('@/panel/app/common/auto-resize-codemirror', () => ({
	AutoResizeCodeMirror: React.forwardRef(function MockEditor() { return <div /> }),
}))

const tree: ICollectionTree = {
	root: [{ id: 'parent', type: 'collection' }, { id: 'other', type: 'collection' }],
	nodes: {
		parent: {
			id: 'parent', name: 'Parent', parentId: null, active: true, createdOn: 1,
			entries: [{ id: 'child', type: 'collection' }],
		},
		child: {
			id: 'child', name: 'Child', parentId: 'parent', active: true, createdOn: 1,
			entries: [{ id: 'leaf', type: 'collection' }],
		},
		leaf: { id: 'leaf', name: 'Leaf', parentId: 'child', active: true, createdOn: 1, entries: [] },
		other: { id: 'other', name: 'Child', parentId: null, active: false, createdOn: 1, entries: [] },
	},
}

const draft = { name: 'Users', url: '/api/users', method: MethodEnum.GET, status: 200, active: true, description: '', response: '{}' }

function Selector({ collectionTree = tree, initialValue = null }: { collectionTree?: ICollectionTree; initialValue?: string | null }) {
	const [value, setValue] = useState(initialValue)
	return <CollectionSelect tree={collectionTree} value={value} onChange={setValue} />
}

async function selectCollection(path: string): Promise<void> {
	fireEvent.click(screen.getByTestId('mock-collection-select'))
	fireEvent.click(await screen.findByRole('option', { name: path }))
}

function clearCollection(): void {
	fireEvent.click(screen.getByTestId('mock-collection-select').querySelector('.clear.icon')!)
}

function renderForm(selectedMock: Partial<IMockResponse> = draft, options: { store?: IStore; onClose?: () => void; isDetached?: boolean } = {}) {
	return render(<AddMockForm
		store={options.store ?? { ...getDefaultStore(), active: true, collectionTree: tree }}
		selectedMock={selectedMock}
		setSelectedMock={vi.fn()}
		setStoreProperties={vi.fn()}
		onClose={options.onClose ?? vi.fn()}
		isDetached={options.isDetached}
	/>)
}

beforeEach(() => {
	saved.length = 0
	useGlobalStore.setState({ t: en, importQueue: [], resolvedScheme: 'light' })
})

describe('collection selector', () => {
	it('lists complete paths in tree order, including empty and disabled collections', () => {
		expect(buildCollectionOptions(tree).map(({ value, text }) => [value, text])).toEqual([
			['parent', 'Parent'], ['child', 'Parent/Child'], ['leaf', 'Parent/Child/Leaf'], ['other', 'Child'],
		])
	})

	it('starts empty, allows choosing a nested collection and clearing it', async () => {
		render(<Selector />)
		expect(screen.getByText(en.mock_noCollection)).toBeInTheDocument()
		await selectCollection('Parent/Child/Leaf')
		expect(screen.getByTestId('mock-collection-select')).toHaveAttribute('title', 'Parent/Child/Leaf')
		clearCollection()
		expect(screen.getByText(en.mock_noCollection)).toBeInTheDocument()
	})

	it('searches full paths without case sensitivity and reports no matches', async () => {
		render(<Selector />)
		fireEvent.click(screen.getByTestId('mock-collection-select'))
		const search = screen.getByRole('textbox', { name: en.mock_fieldCollection })
		fireEvent.change(search, { target: { value: 'PARENT/chi' } })
		await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(2))
		expect(screen.getByRole('option', { name: 'Parent/Child/Leaf' })).toBeInTheDocument()
		fireEvent.change(search, { target: { value: 'missing' } })
		await screen.findByText(en.mock_collectionNoResults)
	})

	it('does not choose the highlighted collection when leaving the dropdown without selecting', () => {
		const onChange = vi.fn()
		render(<CollectionSelect tree={tree} value={null} onChange={onChange} />)
		fireEvent.click(screen.getByTestId('mock-collection-select'))
		fireEvent.blur(screen.getByRole('textbox', { name: en.mock_fieldCollection }))
		fireEvent.click(document.body)
		expect(onChange).not.toHaveBeenCalled()
		expect(screen.getByText(en.mock_noCollection)).toBeInTheDocument()
	})

	it('updates the selected path after renaming and moving a collection, keeping its ID', () => {
		const { rerender } = render(<Selector initialValue="child" />)
		const renamed = { ...tree, nodes: { ...tree.nodes, parent: { ...tree.nodes.parent, name: 'Renamed' } } }
		rerender(<Selector initialValue="child" collectionTree={renamed} />)
		expect(screen.getByTestId('mock-collection-select')).toHaveAttribute('title', 'Renamed/Child')
		const moved: ICollectionTree = {
			root: [...tree.root, { type: 'collection', id: 'child' }],
			nodes: { ...renamed.nodes, parent: { ...renamed.nodes.parent, entries: [] }, child: { ...tree.nodes.child, parentId: null } },
		}
		rerender(<Selector initialValue="child" collectionTree={moved} />)
		expect(screen.getByTestId('mock-collection-select')).toHaveAttribute('title', 'Child')
	})

	it('clears the selection when its collection is removed', () => {
		const onChange = vi.fn()
		const { rerender } = render(<CollectionSelect tree={tree} value="child" onChange={onChange} />)
		rerender(<CollectionSelect tree={{ root: [], nodes: {} }} value="child" onChange={onChange} />)
		expect(onChange).toHaveBeenCalledWith(null)
		expect(screen.getByText(en.mock_noCollection)).toBeInTheDocument()
	})

	it('shows an empty result when no collections exist', async () => {
		render(<Selector collectionTree={{ root: [], nodes: {} }} />)
		fireEvent.click(screen.getByTestId('mock-collection-select'))
		expect(await screen.findByText(en.mock_collectionNoResults)).toBeInTheDocument()
	})
})

describe('mock form collection saving', () => {
	it.each([false, true])('saves a new mock into the selected subcollection (detached: %s)', async (isDetached) => {
		renderForm(draft, { isDetached })
		await selectCollection('Parent/Child/Leaf')
		fireEvent.click(screen.getByTestId('mock-save-button'))
		await waitFor(() => expect(saved).toHaveLength(1))
		const [mock] = saved[0].mocks
		expect(mock.collectionId).toBe('leaf')
		expect(saved[0].collectionTree.nodes.leaf.entries).toContainEqual({ type: 'mock', id: mock.id })
	})

	it('saves to the root when no collection is selected', async () => {
		renderForm()
		fireEvent.click(screen.getByTestId('mock-save-button'))
		await waitFor(() => expect(saved).toHaveLength(1))
		const [mock] = saved[0].mocks
		expect(mock.collectionId).toBeNull()
		expect(saved[0].collectionTree.root).toContainEqual({ type: 'mock', id: mock.id })
	})

	it('preselects the collection supplied by its Add Mock action', () => {
		renderForm({ ...draft, collectionId: 'child' })
		expect(screen.getByTestId('mock-collection-select')).toHaveAttribute('title', 'Parent/Child')
	})

	it.each(['leaf', null])('moves an existing mock to %s on save', async (destination) => {
		const mock: IMockResponse = { ...draft, id: 'existing', collectionId: 'parent' }
		const store = {
			...getDefaultStore(), active: true, mocks: [mock], collectionTree: {
				...tree, nodes: { ...tree.nodes, parent: { ...tree.nodes.parent, entries: [...tree.nodes.parent.entries, { type: 'mock' as const, id: mock.id }] } },
			},
		}
		renderForm(mock, { store })
		expect(screen.getByTestId('mock-collection-select')).toHaveAttribute('title', 'Parent')
		if (destination) await selectCollection('Parent/Child/Leaf')
		else clearCollection()
		fireEvent.click(screen.getByTestId('mock-save-button'))
		await waitFor(() => expect(saved).toHaveLength(1))
		expect(saved[0].mocks[0].collectionId).toBe(destination)
		expect(saved[0].collectionTree.nodes.parent.entries).not.toContainEqual({ type: 'mock', id: mock.id })
		const entries = destination ? saved[0].collectionTree.nodes[destination].entries : saved[0].collectionTree.root
		expect(entries).toContainEqual({ type: 'mock', id: mock.id })
	})

	it('does not save a selection on cancel and starts empty when reopened', async () => {
		const onClose = vi.fn()
		const { unmount } = renderForm(draft, { onClose })
		await selectCollection('Parent/Child')
		fireEvent.click(screen.getByText(en.mock_close, { selector: 'button' }))
		expect(onClose).toHaveBeenCalled()
		expect(saved).toHaveLength(0)
		unmount()
		renderForm()
		expect(within(screen.getByTestId('mock-collection-select')).getByText(en.mock_noCollection)).toBeInTheDocument()
	})
})
