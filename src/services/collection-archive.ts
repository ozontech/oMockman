import { normalizeLibrary } from './library-normalize'
import type { BundleSaved, ScenarioBundle } from './scenario-bundle'
import { applyScenarioBundle, assertScenarioBundle } from './scenario-bundle'
import { readScenario } from './scenario-read'

import type { IStore } from '@/interface/mock'

export interface CollectionArchive {
	version: 1
	bundles: ScenarioBundle[]
}
export function assertArchive(value: unknown): asserts value is CollectionArchive {
	if (!value || typeof value !== 'object' || Array.isArray(value))
		throw new Error('INVALID_ARGUMENTS')
	const archive = value as CollectionArchive
	if (
		Object.keys(archive).some((key) => !['version', 'bundles'].includes(key)) ||
		archive.version !== 1 ||
		!Array.isArray(archive.bundles) ||
		!archive.bundles.length ||
		archive.bundles.length > 20
	)
		throw new Error('INVALID_ARGUMENTS')
	const keys = new Set<string>()
	for (const bundle of archive.bundles) {
		assertScenarioBundle(bundle)
		const key = JSON.stringify([bundle.task?.key, bundle.scenarioKey])
		if (keys.has(key)) throw new Error('INVALID_SCENARIO')
		keys.add(key)
	}
}

export function exportCollections(
	store: IStore,
	collectionId: string,
	origin: string,
): CollectionArchive {
	const bundles: ScenarioBundle[] = []
	const seen = new Set<string>()
	function visit(id: string) {
		if (seen.has(id) || seen.size >= 100) throw new Error('INVALID_SCENARIO')
		seen.add(id)
		const node = store.collectionTree.nodes[id]
		if (!node || (node.automation?.origin !== origin && node.task?.origin !== origin))
			throw new Error('ACCESS_DENIED')
		if (node.automation) {
			const view = readScenario(store, id, origin)
			if (view.redacted || view.unsupported.length || view.manualMockCount)
				throw new Error('SCENARIO_REQUIRES_MANUAL_EDIT')
			bundles.push(view.bundle)
		} else if (node.entries.some((entry) => entry.type === 'mock'))
			throw new Error('SCENARIO_REQUIRES_MANUAL_EDIT')
		for (const entry of node.entries) if (entry.type === 'collection') visit(entry.id)
	}
	visit(collectionId)
	const archive: CollectionArchive = { version: 1, bundles }
	assertArchive(archive)
	return archive
}

export function importCollections(
	raw: Partial<IStore>,
	archive: CollectionArchive,
	origin: string,
	mode: 'reject' | 'replace',
	prefix: string,
) {
	assertArchive(archive)
	if (
		!['reject', 'replace'].includes(mode) ||
		typeof prefix !== 'string' ||
		!/^[a-zA-Z0-9._/-]{0,64}$/.test(prefix)
	)
		throw new Error('INVALID_ARGUMENTS')
	let store = normalizeLibrary(raw)
	const results: BundleSaved[] = []
	const conflicts: string[] = []
	for (const source of archive.bundles) {
		const bundle = structuredClone(source)
		bundle.scenarioKey = prefix + bundle.scenarioKey
		if (bundle.task) bundle.task.key = prefix + bundle.task.key
		const existing = Object.values(store.collectionTree.nodes).find(
			(node) =>
				node.automation?.origin === origin &&
				node.automation.scenarioKey === bundle.scenarioKey &&
				(bundle.task
					? store.collectionTree.nodes[node.parentId ?? '']?.task?.key === bundle.task.key
					: !store.collectionTree.nodes[node.parentId ?? '']?.task),
		)
		if (existing) conflicts.push(existing.id)
		const applied = applyScenarioBundle(store, bundle, origin)
		store = applied.store
		results.push(applied.result)
	}
	return {
		store,
		conflicts,
		result: { ...results[0], imported: results.map((item) => item.collectionId) },
	}
}
