import type { ICollectionEntry, ICollectionTree } from '@/interface/collection'
import type { IMockResponse } from '@/interface/mock'
import type { MockmanExportBundle } from '@/services/mock-import'

function buildCollectionExportBundle(input: {
	collectionTree: ICollectionTree
	mocks: IMockResponse[]
	collectionId: string
}): MockmanExportBundle | null {
	const { collectionTree, mocks, collectionId } = input
	const rootNode = collectionTree.nodes[collectionId]
	if (!rootNode) return null

	const mockMap = new Map(mocks.map((mock) => [mock.id, mock]))
	const collectedMocks = new Map<string, IMockResponse>()
	const nodes: Record<string, typeof rootNode> = {}

	const visit = (nodeId: string, parentId: string | null): void => {
		const node = collectionTree.nodes[nodeId]
		if (!node) return
		const entries: ICollectionEntry[] = []

		node.entries.forEach((entry) => {
			if (entry.type === 'collection') {
				visit(entry.id, nodeId)
				if (nodes[entry.id]) entries.push({ id: entry.id, type: 'collection' })
				return
			}

			const mock = mockMap.get(entry.id)
			if (!mock) return
			collectedMocks.set(mock.id, mock)
			entries.push({ id: entry.id, type: 'mock' })
		})

		nodes[nodeId] = { ...node, parentId, entries }
	}

	visit(collectionId, null)

	return {
		type: 'mockman.export',
		version: 1,
		collectionTree: {
			root: [{ id: collectionId, type: 'collection' }],
			nodes,
		},
		mocks: Array.from(collectedMocks.values()),
	}
}

function collectionExportFileName(collectionName: string): string {
	return `collection-${collectionName.replace(/\s+/g, '_')}.json`
}

export function exportCollectionToJsonFile(input: {
	collectionTree: ICollectionTree
	mocks: IMockResponse[]
	collectionId: string
	collectionName: string
	downloadJsonFile: (fileName: string, payload: unknown) => void
}): void {
	const bundle = buildCollectionExportBundle({
		collectionTree: input.collectionTree,
		mocks: input.mocks,
		collectionId: input.collectionId,
	})
	if (!bundle) return
	input.downloadJsonFile(collectionExportFileName(input.collectionName), bundle)
}
