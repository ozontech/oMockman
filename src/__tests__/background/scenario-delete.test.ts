import { expect, it } from 'vitest'

import { defaultLibrary } from '@/services/library-normalize'
import { applyScenarioBundle } from '@/services/scenario-bundle'
import { deleteScenario } from '@/services/scenario-delete'
const origin = 'https://app.example.test'
const fixture = () =>
	applyScenarioBundle(
		defaultLibrary(),
		{
			scenarioKey: 'delete',
			collection: { name: 'Delete' },
			mocks: [
				{
					key: 'm',
					method: 'GET',
					url: `${origin}/tasks`,
					response: { body: '{}', status: 200, headers: [] },
				},
			],
			scenario: {
				enabled: true,
				rules: [{ key: 'r', method: 'GET', url: `${origin}/tasks`, respond: { mockKey: 'm' } }],
			},
		},
		origin,
	)
it('deletes managed data without changing the input or global activation', () => {
	const { store, result } = fixture()
	const deleted = deleteScenario(store, result.collectionId, origin)
	expect(deleted.store.mocks).toEqual([])
	expect(deleted.store.collectionTree).toEqual({ root: [], nodes: {} })
	expect(store.mocks).toHaveLength(1)
	expect(deleted.store.active).toBe(store.active)
})
it('refuses manual content, external references and other origins', () => {
	const { store, result } = fixture()
	expect(() => deleteScenario(store, result.collectionId, 'https://other.test')).toThrow(
		'ACCESS_DENIED',
	)
	store.collectionTree.nodes[result.collectionId].entries.push({ type: 'mock', id: 'manual' })
	expect(() => deleteScenario(store, result.collectionId, origin)).toThrow(
		'SCENARIO_REQUIRES_MANUAL_EDIT',
	)
	store.collectionTree.nodes[result.collectionId].entries.pop()
	store.collectionTree.root.push({ type: 'mock', id: result.mockIds.m })
	expect(() => deleteScenario(store, result.collectionId, origin)).toThrow('SCENARIO_REFERENCED')
})

it('preserves manually added network rules when deleting a managed collection', () => {
	const { store, result } = fixture()
	store.collectionTree.nodes[result.collectionId].scenario!.rules.push({
		id: 'manual',
		method: 'GET',
		url: `${origin}/manual`,
		respond: { network: true },
	})
	const before = structuredClone(store)
	expect(() => deleteScenario(store, result.collectionId, origin)).toThrow(
		'SCENARIO_REQUIRES_MANUAL_EDIT',
	)
	expect(store).toEqual(before)
})
