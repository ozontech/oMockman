import type { IStore } from '@/interface/mock'

/** Delete only a managed collection; never cascade through manual content or external references. */
export function deleteScenario(raw: Partial<IStore>, collectionId: string, origin: string) {
	const store = structuredClone(raw) as IStore
	const node = store.collectionTree?.nodes[collectionId]
	if (!node?.automation || node.automation.origin !== origin) throw new Error('ACCESS_DENIED')
	if (node.active) throw new Error('SCENARIO_ACTIVE')
	const managed = new Set(Object.values(node.automation.mockIds))
	const managedRules = new Set(Object.values(node.automation.ruleIds))
	if (node.scenario?.rules.some((rule) => !managedRules.has(rule.id)))
		throw new Error('SCENARIO_REQUIRES_MANUAL_EDIT')
	if (
		node.entries.some((entry) => entry.type === 'collection' || !managed.has(entry.id)) ||
		store.mocks.some((mock) => mock.collectionId === collectionId && !managed.has(mock.id))
	)
		throw new Error('SCENARIO_REQUIRES_MANUAL_EDIT')
	if (store.mocks.some((mock) => managed.has(mock.id) && mock.collectionId !== collectionId))
		throw new Error('SCENARIO_REFERENCED')
	for (const other of Object.values(store.collectionTree.nodes)) {
		if (other.id === collectionId) continue
		if (
			other.parentId === collectionId ||
			other.entries.some((entry) => entry.type === 'mock' && managed.has(entry.id)) ||
			other.scenario?.rules.some(
				(rule) => 'mockId' in rule.respond && managed.has(rule.respond.mockId),
			)
		)
			throw new Error('SCENARIO_REFERENCED')
	}
	if (store.collectionTree.root.some((entry) => entry.type === 'mock' && managed.has(entry.id)))
		throw new Error('SCENARIO_REFERENCED')
	store.mocks = store.mocks.filter((mock) => !managed.has(mock.id))
	delete store.collectionTree.nodes[collectionId]
	store.collectionTree.root = store.collectionTree.root.filter(
		(entry) => entry.type !== 'collection' || entry.id !== collectionId,
	)
	for (const other of Object.values(store.collectionTree.nodes))
		other.entries = other.entries.filter(
			(entry) => entry.type !== 'collection' || entry.id !== collectionId,
		)
	return { store, result: { collectionId, mockIds: {}, ruleIds: {} } }
}
