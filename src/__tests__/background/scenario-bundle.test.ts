import { expect, it } from 'vitest'

import type { LibraryStorage } from '@/background/library-writer'
import { createLibraryWriter } from '@/background/library-writer'
import { importCollectionBundle } from '@/panel/app/service/store-actions'
import { defaultLibrary } from '@/services/library-normalize'
import type { ScenarioBundle } from '@/services/scenario-bundle'
import { applyScenarioBundle } from '@/services/scenario-bundle'

const origin = 'https://app.example.test'
const apiOrigin = 'https://api.example.test'
const bundle = (): ScenarioBundle => ({
	scenarioKey: 'tasks',
	collection: { name: 'Tasks' },
	mocks: ['first', 'empty'].map((key) => ({
		key,
		method: 'GET',
		url: `${apiOrigin}/tasks`,
		response: {
			status: 200,
			headers: [],
			body: key === 'first' ? '{"items":[1]}' : '{"items":[]}',
		},
	})),
	scenario: {
		enabled: true,
		rules: ['first', 'empty'].map((key) => ({
			key,
			method: 'GET',
			url: `${apiOrigin}/tasks`,
			respond: { mockKey: key },
		})),
	},
})
const identity = (id: number) => ({
	operationId: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
	issuedAt: 1000,
	expiresAt: 301000,
})

it('creates an inactive collection with stable IDs, preserving manual additions on update', () => {
	const first = applyScenarioBundle(defaultLibrary(), bundle(), origin)
	const node = first.store.collectionTree.nodes[first.result.collectionId]
	expect(node.active).toBe(false)
	expect(first.store.active).toBe(false)
	const manual = { ...first.store.mocks[0], id: 'manual' }
	first.store.mocks.push(manual)
	node.entries.push({ type: 'mock', id: manual.id })
	const update = bundle()
	update.mocks[0].response.body = '{"items":[2,3]}'
	const second = applyScenarioBundle(first.store, update, origin)
	expect(second.result).toEqual(first.result)
	expect(second.store.mocks).toHaveLength(3)
	expect(second.store.mocks.find((mock) => mock.id === 'manual')).toEqual(manual)
	expect(second.store.collectionTree.root).toHaveLength(1)
	expect(second.store.totalMocksCreated).toBe(2)
	expect(first.store.mocks[0].response).toBe('{"items":[1]}')
})
it('removes only omitted managed mocks and refuses external references or moved mocks', () => {
	const first = applyScenarioBundle(defaultLibrary(), bundle(), origin)
	const update = bundle()
	update.mocks.pop()
	update.scenario.rules.pop()
	expect(applyScenarioBundle(first.store, update, origin).store.mocks).toHaveLength(1)
	first.store.collectionTree.nodes.other = {
		id: 'other',
		name: 'Other',
		createdOn: 0,
		parentId: null,
		active: false,
		entries: [],
		scenario: {
			enabled: true,
			rules: [
				{
					id: 'r',
					method: 'GET',
					url: `${apiOrigin}/tasks`,
					respond: { mockId: first.result.mockIds.empty },
				},
			],
		},
	}
	expect(() => applyScenarioBundle(first.store, update, origin)).toThrow('SCENARIO_REFERENCED')
	first.store.mocks[0].collectionId = 'other'
	expect(() => applyScenarioBundle(first.store, bundle(), origin)).toThrow('INVALID_SCENARIO')
})
it('rejects active collections, another origin, duplicate keys and dangling references without changing input', () => {
	const first = applyScenarioBundle(defaultLibrary(), bundle(), origin)
	const copy = structuredClone(first.store)
	expect(() => applyScenarioBundle(first.store, bundle(), 'https://other.example.test')).toThrow(
		'ACCESS_DENIED',
	)
	const invalid = bundle()
	invalid.mocks[1].key = invalid.mocks[0].key
	expect(() => applyScenarioBundle(first.store, invalid, origin)).toThrow('INVALID_SCENARIO')
	invalid.mocks.pop()
	expect(() => applyScenarioBundle(first.store, invalid, origin)).toThrow('INVALID_SCENARIO')
	expect(first.store).toEqual(copy)
	first.store.collectionTree.nodes[first.result.collectionId].active = true
	expect(() => applyScenarioBundle(first.store, bundle(), origin)).toThrow('SCENARIO_ACTIVE')
})
it('imports a copy with a new stable key and remapped mock references', () => {
	const first = applyScenarioBundle(defaultLibrary(), bundle(), origin)
	const imported = importCollectionBundle(first.store, {
		type: 'mockman.export',
		version: 2,
		mocks: first.store.mocks,
		collectionTree: first.store.collectionTree,
	})
	const nodes = Object.values(imported.collectionTree.nodes)
	expect(nodes).toHaveLength(2)
	const copied = nodes.find((node) => node.id !== first.result.collectionId)
	expect(copied).toBeDefined()
	expect(copied?.automation?.scenarioKey).not.toBe('tasks')
	expect(copied?.automation?.mockIds.first).not.toBe(first.result.mockIds.first)
})
it('commits bundle and receipt together, replays original IDs, isolates receipt scope and checks access inside the queue', async () => {
	let saved: Awaited<ReturnType<LibraryStorage['read']>> = defaultLibrary()
	const storage: LibraryStorage = {
		read: async () => structuredClone(saved),
		write: async (store) => {
			saved = structuredClone(store)
		},
	}
	const writer = createLibraryWriter(storage, () => 2000)
	const command = { type: 'bundle' as const, expectedRevision: 0, origin, bundle: bundle() }
	const first = await writer.execute(identity(1), command, { scope: 'client-1' })
	const second = await createLibraryWriter(storage, () => 3000).execute(identity(1), command, {
		scope: 'client-1',
	})
	expect(second.result).toEqual(first.result)
	expect(saved?.revision).toBe(1)
	await expect(writer.execute(identity(1), command, { scope: 'client-2' })).rejects.toThrow(
		'REVISION_CONFLICT',
	)
	await expect(
		writer.execute(identity(1), command, {
			scope: 'client-1',
			authorize: async () => {
				throw new Error('ACCESS_DENIED')
			},
		}),
	).rejects.toThrow('ACCESS_DENIED')
	expect(saved?.revision).toBe(1)
	let checks = 0
	await expect(
		writer.execute(
			identity(2),
			{ ...command, expectedRevision: 1 },
			{
				authorize: async () => {
					if (++checks > 1) throw new Error('ACCESS_DENIED')
				},
			},
		),
	).rejects.toThrow('ACCESS_DENIED')
	expect(saved?.revision).toBe(1)
})
