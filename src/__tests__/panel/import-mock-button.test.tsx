import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ImportMockButton } from '@/panel/app/header/import-mock-button'
import { IMPORT_LIMITS } from '@/services/mock-import'
import type * as ActualModule from '@/panel/app/service'

const updateStoreInDB = vi.fn()
const getStore = vi.fn()
const addMocks = vi.fn()
const importCollectionBundle = vi.fn()
const refreshContentStore = vi.fn()
const toastError = vi.fn()

vi.mock('@/panel/app/service', async (importOriginal) => {
	const actual = await importOriginal<typeof ActualModule>()
	return {
		...actual,
		storeActions: {
			...actual.storeActions,
			getStore: () => getStore(),
			addMocks: (...args: unknown[]) => addMocks(...args),
			importCollectionBundle: (...args: unknown[]) => importCollectionBundle(...args),
			updateStoreInDB: (...args: unknown[]) => updateStoreInDB(...args),
			refreshContentStore: (...args: unknown[]) => refreshContentStore(...args),
		},
	}
})

vi.mock('react-toastify', () => ({
	toast: {
		error: (...args: unknown[]) => toastError(...args),
		success: vi.fn(),
		info: vi.fn(),
	},
}))

const validMock = {
	name: 'users',
	method: 'GET',
	url: 'https://example.com/api/users',
	status: 200,
	response: '{"users":[]}',
}

const pickFile = async (content: string, name = 'mocks.json'): Promise<void> => {
	const clicks: HTMLInputElement[] = []
	const originalClick = HTMLInputElement.prototype.click
	HTMLInputElement.prototype.click = function (this: HTMLInputElement) {
		clicks.push(this)
	}
	try {
		fireEvent.click(screen.getByTestId('import-mock-button'))
	} finally {
		HTMLInputElement.prototype.click = originalClick
	}

	const input = clicks[0]
	expect(input).toBeDefined()
	const file = new File([content], name, { type: 'application/json' })
	Object.defineProperty(input, 'files', { value: [file], configurable: true })
	input.onchange?.(new Event('change') as never)
}

describe('ImportMockButton', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		getStore.mockResolvedValue({ store: { mocks: [], collectionTree: { root: [], nodes: {} } } })
		updateStoreInDB.mockResolvedValue({
			store: { mocks: [], collectionTree: { root: [], nodes: {} }, active: false, theme: 'light', totalMocksCreated: 0, activityInfo: { promoted: false } },
			urlMap: {},
			dynamicUrlMap: {},
		})
		addMocks.mockImplementation((store) => store)
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	it('shows a preview and writes nothing before confirmation', async () => {
		render(<ImportMockButton />)

		await pickFile(JSON.stringify([validMock]))

		await waitFor(() => expect(screen.getByTestId('import-preview')).toBeInTheDocument())
		expect(screen.getByText('https://example.com/api/users')).toBeInTheDocument()
		expect(updateStoreInDB).not.toHaveBeenCalled()
	})

	it('stores the mocks only after the user confirms', async () => {
		render(<ImportMockButton />)

		await pickFile(JSON.stringify([validMock]))
		await waitFor(() => expect(screen.getByTestId('import-confirm')).toBeInTheDocument())
		fireEvent.click(screen.getByTestId('import-confirm'))

		await waitFor(() => expect(updateStoreInDB).toHaveBeenCalledTimes(1))
		expect(addMocks).toHaveBeenCalled()
		expect(refreshContentStore).toHaveBeenCalled()
	})

	it('writes nothing when the user cancels', async () => {
		render(<ImportMockButton />)

		await pickFile(JSON.stringify([validMock]))
		await waitFor(() => expect(screen.getByTestId('import-cancel')).toBeInTheDocument())
		fireEvent.click(screen.getByTestId('import-cancel'))

		await waitFor(() => expect(screen.queryByTestId('import-preview')).not.toBeInTheDocument())
		expect(updateStoreInDB).not.toHaveBeenCalled()
	})

	it('rejects a file that is not JSON', async () => {
		render(<ImportMockButton />)

		await pickFile('this is not json')

		await waitFor(() => expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/valid JSON/)))
		expect(screen.queryByTestId('import-preview')).not.toBeInTheDocument()
	})

	it('rejects a file with nothing importable', async () => {
		render(<ImportMockButton />)

		await pickFile(JSON.stringify([]))

		await waitFor(() => expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/Nothing to import/)))
	})

	it('rejects too many mocks', async () => {
		render(<ImportMockButton />)

		const many = Array.from({ length: IMPORT_LIMITS.maxMocks + 1 }, (_, i) => ({
			...validMock,
			name: `mock-${i}`,
			url: `https://example.com/api/${i}`,
		}))
		await pickFile(JSON.stringify(many))

		await waitFor(() => expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/Too many mocks/)))
		expect(updateStoreInDB).not.toHaveBeenCalled()
	})

	it('rejects an oversized mock body', async () => {
		render(<ImportMockButton />)

		await pickFile(JSON.stringify([
			{ ...validMock, response: 'x'.repeat(IMPORT_LIMITS.maxResponseBytes + 10) },
		]))

		await waitFor(() => expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/response body is too large/)))
	})

	it('imports a collection bundle through the bundle path', async () => {
		importCollectionBundle.mockImplementation((store) => store)
		render(<ImportMockButton />)

		await pickFile(JSON.stringify({
			type: 'mockman.export',
			version: 1,
			mocks: [validMock],
			collectionTree: {
				root: [{ id: 'c1', type: 'collection' }],
				nodes: { c1: { id: 'c1', name: 'Imported', parentId: null, active: true, createdOn: 1, entries: [] } },
			},
		}))

		await waitFor(() => expect(screen.getByTestId('import-confirm')).toBeInTheDocument())
		fireEvent.click(screen.getByTestId('import-confirm'))

		await waitFor(() => expect(importCollectionBundle).toHaveBeenCalled())
	})
})
