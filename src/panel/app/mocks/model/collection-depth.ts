import type { ICollectionEntry, ICollectionNode } from '@/interface/collection'

export function getCollectionDepth(nodes: Record<string, ICollectionNode>, collectionId: string): number {
	let depth = 0
	let cur = nodes[collectionId]
	while (cur?.parentId) {
		depth += 1
		cur = nodes[cur.parentId]
		if (depth > 50) break
	}
	return depth
}

export function getMaxDescendantDepth(nodes: Record<string, ICollectionNode>, collectionId: string): number {
	let max = 0
	const stack: Array<{ id: string; depth: number }> = [{ id: collectionId, depth: 0 }]
	const visited = new Set<string>()
	while (stack.length) {
		const cur = stack.pop() as { id: string; depth: number }
		if (visited.has(cur.id)) continue
		visited.add(cur.id)
		max = Math.max(max, cur.depth)
		const node = nodes[cur.id]
		if (!node) continue
		for (const ent of node.entries as ICollectionEntry[]) {
			if (ent.type === 'collection') {
				stack.push({ id: ent.id, depth: cur.depth + 1 })
			}
		}
	}
	return max
}

export function canMoveCollectionTo(params: {
	nodes: Record<string, ICollectionNode>
	collectionId: string
	targetContainerId: string | null
	maxDepth: number
}): boolean {
	const { nodes, collectionId, targetContainerId, maxDepth } = params
	if (!targetContainerId) return true
	const targetDepth = getCollectionDepth(nodes, targetContainerId)
	const subtreeDepth = getMaxDescendantDepth(nodes, collectionId)
	return (targetDepth + 1 + subtreeDepth) <= maxDepth
}
