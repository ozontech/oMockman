import { describe, it, expect, vi } from 'vitest'

import { exportCollectionToJsonFile } from '../../panel/app/mocks/use-cases/export-collection'

import type { ICollectionTree, ICollectionNode } from '@/interface/collection'
import type { IMockResponse } from '@/interface/mock'
import { MethodEnum } from '@/interface/network'

describe('exportCollectionToJsonFile', () => {
	const createMock = (id: string, name: string): IMockResponse => ({
		id,
		name,
		url: '/api/test',
		method: MethodEnum.GET,
		status: 200,
		active: true,
		response: '{}',
		headers: [],
		createdOn: Date.now(),
		dynamic: false,
		description: '',
	})

	const createNode = (id: string, name: string, entries: Array<{ id: string; type: 'mock' | 'collection' }>, parentId: string | null = null): ICollectionNode => ({
		id,
		name,
		entries,
		parentId,
		active: true,
		createdOn: Date.now(),
	})

	const createCollectionTree = (
		nodes: Record<string, ICollectionNode>,
	): ICollectionTree => ({
		root: [],
		nodes,
	})

	it('calls downloadJsonFile with the right arguments', () => {
		const downloadJsonFile = vi.fn()
		const tree = createCollectionTree({
			'col-1': createNode('col-1', 'Test Collection', [
				{ id: 'm1', type: 'mock' },
			]),
		})
		const mocks = [createMock('m1', 'Mock 1')]

		exportCollectionToJsonFile({
			collectionTree: tree,
			mocks,
			collectionId: 'col-1',
			collectionName: 'Test Collection',
			downloadJsonFile,
		})

		expect(downloadJsonFile).toHaveBeenCalledWith('collection-Test_Collection.json', expect.objectContaining({
			type: 'mockman.export',
			version: 1,
			mocks: expect.any(Array),
		}))
	})

	it('does not call downloadJsonFile for a missing collection', () => {
		const downloadJsonFile = vi.fn()
		const tree = createCollectionTree({})

		exportCollectionToJsonFile({
			collectionTree: tree,
			mocks: [],
			collectionId: 'non-existent',
			collectionName: 'Test',
			downloadJsonFile,
		})

		expect(downloadJsonFile).not.toHaveBeenCalled()
	})

	it('calls downloadJsonFile for an empty collection', () => {
		const downloadJsonFile = vi.fn()
		const tree = createCollectionTree({
			'col-1': createNode('col-1', 'Empty Collection', []),
		})

		exportCollectionToJsonFile({
			collectionTree: tree,
			mocks: [],
			collectionId: 'col-1',
			collectionName: 'Empty Collection',
			downloadJsonFile,
		})

		expect(downloadJsonFile).toHaveBeenCalledWith('collection-Empty_Collection.json', expect.objectContaining({
			type: 'mockman.export',
			mocks: [],
		}))
	})

	it('builds a file name from a name with spaces', () => {
		const downloadJsonFile = vi.fn()
		const tree = createCollectionTree({
			'col-1': createNode('col-1', 'Test', []),
		})

		exportCollectionToJsonFile({
			collectionTree: tree,
			mocks: [],
			collectionId: 'col-1',
			collectionName: 'My Test Collection',
			downloadJsonFile,
		})

		expect(downloadJsonFile).toHaveBeenCalledWith('collection-My_Test_Collection.json', expect.any(Object))
	})

	it('includes mocks from nested collections in the export', () => {
		const downloadJsonFile = vi.fn()
		const tree = createCollectionTree({
			'col-1': createNode('col-1', 'Parent', [
				{ id: 'col-2', type: 'collection' },
				{ id: 'm1', type: 'mock' },
			]),
			'col-2': createNode('col-2', 'Child', [
				{ id: 'm2', type: 'mock' },
			], 'col-1'),
		})
		const mocks = [
			createMock('m1', 'Mock 1'),
			createMock('m2', 'Mock 2'),
		]

		exportCollectionToJsonFile({
			collectionTree: tree,
			mocks,
			collectionId: 'col-1',
			collectionName: 'Parent',
			downloadJsonFile,
		})

		const bundle = downloadJsonFile.mock.calls[0]
		expect(bundle).toBeDefined()
		expect(bundle[1].mocks).toHaveLength(2)
	})
})