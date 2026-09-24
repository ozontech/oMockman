import type { Row } from './types'

import type { ICollectionEntry, ICollectionTree } from '@/interface/collection'
import type { IMockResponse } from '@/interface/mock'

export function buildFilteredRows(
	collectionTree: ICollectionTree,
	mocks: IMockResponse[],
	expanded: Set<string>,
	query: string,
): Row[] {
	const rows: Row[] = []
	const search = query.trim().toLowerCase()
	const byId = new Map<string, IMockResponse>(mocks.map((m) => [m.id, m]))

	const matches = (mock: IMockResponse): boolean => {
		if (!search) return true
		return (
			(mock.name ?? '').toLowerCase().includes(search) ||
			(mock.url ?? '').toLowerCase().includes(search) ||
			(mock.method ?? '').toLowerCase().includes(search) ||
			String(mock.status ?? '').includes(search)
		)
	}

	const visit = (entries: ICollectionEntry[], level: number, parentCollectionId: string | null): void => {
		for (let idx = 0; idx < entries.length; idx += 1) {
			const entry = entries[idx]
			if (entry.type === 'collection') {
				const node = collectionTree.nodes[entry.id]
				if (!node) continue
				rows.push({
					id: `col:${node.id}`,
					rowType: 'collection',
					level,
					node,
					parentCollectionId,
					indexInParent: idx,
				})
				if (expanded.has(node.id)) visit(node.entries, level + 1, node.id)
				continue
			}
			const mock = byId.get(entry.id)
			if (mock && matches(mock)) {
				rows.push({
					id: mock.id,
					rowType: 'mock',
					level,
					mock,
					parentCollectionId,
					indexInParent: idx,
				})
			}
		}
	}

	visit(collectionTree.root, 0, null)

	return rows
}
