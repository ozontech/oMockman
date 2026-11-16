import { expect, it } from 'vitest'

import { createLibraryWriter } from '@/background/library-writer'
import { getActiveMockWithPath, getMockPaths } from '@/contentScript/match'
import { exportCollections, importCollections } from '@/services/collection-archive'
import { defaultLibrary } from '@/services/library-normalize'
import { getURLMapWithStore } from '@/services/library-read'
import type { ScenarioBundle } from '@/services/scenario-bundle'
import { applyScenarioBundle } from '@/services/scenario-bundle'
import { patchScenario } from '@/services/scenario-patch'
import { readScenario } from '@/services/scenario-read'
import { validateBundle } from '@mockman/automation-protocol'

const origin = 'https://app.test'
const bundle = (key = 'long-names'): ScenarioBundle => ({
	scenarioKey: key,
	task: { key: 'TASK-42', name: 'Task UI' },
	collection: { name: key },
	mocks: [
		{
			key: 'fallback',
			method: 'POST',
			url: 'https://api.test/tasks/:id',
			response: { status: 200, headers: [], body: '{"items":[]}' },
		},
		{
			key: 'filtered',
			method: 'POST',
			url: 'https://api.test/tasks/:id',
			priority: 10,
			when: {
				query: { mode: 'long' },
				params: { id: '42' },
				body: [{ path: ['filter', 'active'], equals: true }],
			},
			response: { status: 200, headers: [], body: '{"items":[1]}' },
		},
	],
	scenario: { enabled: false, rules: [] },
})
it('reuses task folders and stable case IDs after renaming, without touching sibling cases', () => {
	const first = applyScenarioBundle(defaultLibrary(), bundle(), origin)
	const sibling = applyScenarioBundle(first.store, bundle('empty'), origin)
	const parentId = first.store.collectionTree.nodes[first.result.collectionId].parentId as string
	sibling.store.collectionTree.nodes[parentId].name = 'Renamed task'
	const update = bundle()
	update.collection.name = 'Renamed case'
	const next = applyScenarioBundle(sibling.store, update, origin)
	expect(next.result.collectionId).toBe(first.result.collectionId)
	expect(next.store.collectionTree.root).toHaveLength(1)
	expect(next.store.collectionTree.nodes[parentId].entries).toHaveLength(2)
	expect(next.store.collectionTree.nodes[parentId].name).toBe('Renamed task')
	expect(next.store.collectionTree.nodes[sibling.result.collectionId]).toEqual(
		sibling.store.collectionTree.nodes[sibling.result.collectionId],
	)
	expect(readScenario(next.store, next.result.collectionId, origin).bundle.task?.key).toBe(
		'TASK-42',
	)
})
it('exports a task subtree, remaps IDs and previews conflicts without modifying the source', async () => {
	const first = applyScenarioBundle(defaultLibrary(), bundle(), origin)
	const second = applyScenarioBundle(first.store, bundle('empty'), origin)
	const archive = exportCollections(
		second.store,
		second.store.collectionTree.nodes[first.result.collectionId].parentId as string,
		origin,
	)
	expect(archive.bundles).toHaveLength(2)
	const imported = importCollections(defaultLibrary(), archive, origin, 'reject', '')
	expect(imported.result.imported).toHaveLength(2)
	expect(imported.result.collectionId).not.toBe(first.result.collectionId)
	expect(imported.store.sitePermissions).toEqual({})
	expect(Object.values(imported.store.collectionTree.nodes).every((node) => !node.active)).toBe(
		true,
	)
	const before = structuredClone(imported.store)
	const preview = importCollections(imported.store, archive, origin, 'reject', '')
	expect(preview.conflicts).toHaveLength(2)
	expect(imported.store).toEqual(before)
	const writer = createLibraryWriter(
		{
			read: async () => imported.store,
			write: async () => {
				throw new Error('must not write')
			},
		},
		() => 1000,
	)
	await expect(
		writer.execute(
			{ operationId: crypto.randomUUID(), issuedAt: 1000, expiresAt: 2000 },
			{ type: 'archive', archive, origin, mode: 'reject', prefix: '', expectedRevision: 0 },
		),
	).rejects.toThrow('IMPORT_CONFLICT')
	expect(importCollections(imported.store, archive, origin, 'reject', 'copy/').conflicts).toEqual(
		[],
	)
})
it('matches query, path and JSON conditions on every call, with priority and per-mock enablement', () => {
	const source = bundle()
	expect(validateBundle(source).valid).toBe(true)
	const saved = applyScenarioBundle(defaultLibrary(), source, origin)
	const collection = saved.store.collectionTree.nodes[saved.result.collectionId]
	collection.parentId = null
	collection.active = true
	const maps = getURLMapWithStore(saved.store)
	const find = (url: string, body: string) =>
		getActiveMockWithPath(getMockPaths(url, 'POST', maps), saved.store, { url, body }).mock?.id
	expect(find('https://api.test/tasks/42?mode=long', '{"filter":{"active":true}}')).toBe(
		saved.result.mockIds.filtered,
	)
	expect(find('https://api.test/tasks/42?mode=long', '{"filter":{"active":false}}')).toBe(
		saved.result.mockIds.fallback,
	)
	expect(find('https://api.test/tasks/43?mode=long', '{"filter":{"active":true}}')).toBe(
		saved.result.mockIds.fallback,
	)
	expect(find('https://api.test/tasks/42?mode=short', '{"filter":{"active":true}}')).toBe(
		saved.result.mockIds.fallback,
	)
	collection.active = false
	const patched = patchScenario(
		saved.store,
		collection.id,
		{ mockStates: [{ mockKey: 'filtered', enabled: false }] },
		origin,
	)
	expect(
		readScenario(patched.store, collection.id, origin).bundle.mocks.find(
			(mock) => mock.key === 'filtered',
		)?.enabled,
	).toBe(false)
})
it('refuses partial exports and archives with duplicate identities', () => {
	const saved = applyScenarioBundle(defaultLibrary(), bundle(), origin)
	saved.store.mocks[0].response = '{"token":"private"}'
	expect(() => exportCollections(saved.store, saved.result.collectionId, origin)).toThrow(
		'SCENARIO_REQUIRES_MANUAL_EDIT',
	)
	expect(() =>
		importCollections(
			defaultLibrary(),
			{ version: 1, bundles: [bundle(), bundle()] },
			origin,
			'reject',
			'',
		),
	).toThrow('INVALID_SCENARIO')
})
