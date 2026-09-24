import { useMemo } from 'react'

import type { ICollectionEntry, ICollectionTree } from '@/interface/collection'
import type { IMockResponse } from '@/interface/mock'

export function useCollectionMeta(tree: ICollectionTree, mocks: IMockResponse[]): {
	mocksById: Record<string, IMockResponse>
	collectionMockCounts: Record<string, number>
	collectionPathMap: Record<string, string>
	collectionHasActive: Record<string, boolean>
	collectionBranchEnabled: Record<string, boolean>
	collectionToggleAllowed: Record<string, boolean>
} {
	const mocksById = useMemo(() => {
		const map: Record<string, IMockResponse> = {}
		for (const m of mocks) map[m.id] = m
		return map
	}, [mocks])

	const meta = useMemo(() => {
		const counts: Record<string, number> = {}
		const paths: Record<string, string> = {}
		const hasActive: Record<string, boolean> = {}
		const branchEnabledMap: Record<string, boolean> = {}
		const toggleAllowedMap: Record<string, boolean> = {}

		const visit = (
			collectionId: string,
			parentPath: string | null,
			ancestorsEnabled: boolean,
		): { total: number; active: boolean } => {
			const node = tree.nodes[collectionId]
			if (!node) return { total: 0, active: false }

			const ownEnabled = node.active !== false
			const branchEnabled = ancestorsEnabled && ownEnabled
			branchEnabledMap[collectionId] = branchEnabled
			toggleAllowedMap[collectionId] = ancestorsEnabled

			const currentPath = parentPath ? `${parentPath} / ${node.name}` : node.name
			paths[collectionId] = currentPath

			let total = 0
			let active = false
			for (const ent of node.entries as ICollectionEntry[]) {
				if (ent.type === 'mock') {
					const mock = mocksById[ent.id]
					if (mock) {
						total += 1
						if (mock.active && branchEnabled) active = true
					}
				} else {
					const res = visit(ent.id, currentPath, branchEnabled)
					total += res.total
					if (res.active) active = true
				}
			}
			counts[collectionId] = total
			hasActive[collectionId] = active
			return { total, active }
		}

		for (const rootEntry of tree.root) {
			if (rootEntry.type === 'collection') {
				visit(rootEntry.id, null, true)
			}
		}

		return {
			collectionMockCounts: counts,
			collectionPathMap: paths,
			collectionHasActive: hasActive,
			collectionBranchEnabled: branchEnabledMap,
			collectionToggleAllowed: toggleAllowedMap,
		}
	}, [tree.nodes, tree.root, mocksById])

	return { mocksById, ...meta }
}
