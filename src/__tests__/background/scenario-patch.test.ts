import { expect, it } from 'vitest'

import type { LibraryStorage } from '@/background/library-writer'
import { createLibraryWriter } from '@/background/library-writer'
import { defaultLibrary } from '@/services/library-normalize'
import { applyScenarioBundle } from '@/services/scenario-bundle'
import { patchScenario } from '@/services/scenario-patch'

const origin = 'https://app.example.test'
function fixture() {
	const value = applyScenarioBundle(
		defaultLibrary(),
		{
			scenarioKey: 'patch',
			collection: { name: 'Old' },
			mocks: [
				{
					key: 'm',
					method: 'GET',
					url: 'https://api.example.test/tasks',
					response: {
						status: 200,
						body: '{"token":"synthetic-secret"}',
						headers: [{ name: 'Set-Cookie', value: 'synthetic-cookie' }],
					},
				},
			],
			scenario: {
				enabled: true,
				rules: [{ key: 'r', method: 'GET', url: 'https://api.example.test/tasks', respond: { mockKey: 'm' } }],
			},
		},
		origin,
	)
	value.store.collectionTree.nodes[value.result.collectionId].scenario!.rules.push({
		id: 'manual',
		method: 'GET',
		url: `${origin}/manual`,
		respond: { network: true },
	})
	return value
}
it('changes only requested fields, preserving filtered values and manual rules', () => {
	const { store, result } = fixture()
	const expected = structuredClone(store)
	expected.collectionTree.nodes[result.collectionId].name = 'New'
	expected.mocks[0].delay = 123
	const patched = patchScenario(
		store,
		result.collectionId,
		{ name: 'New', delays: [{ mockKey: 'm', delayMs: 123 }] },
		origin,
	)
	expect(patched.store).toEqual(expected)
	expect(store.mocks[0].delay).toBeUndefined()
	expect(patched.result).toEqual(result)
})
it('rejects invalid patches, unknown keys, moved mocks, active collections and other sites', () => {
	const { store, result } = fixture()
	for (const patch of [
		{},
		{ body: 'replacement' },
		{ name: ' ' },
		{ delays: [{ mockKey: 'm', delayMs: -1 }] },
		{
			delays: [
				{ mockKey: 'm', delayMs: 1 },
				{ mockKey: 'm', delayMs: 2 },
			],
		},
	]) {
		expect(() => patchScenario(store, result.collectionId, patch as never, origin)).toThrow(
			'INVALID_ARGUMENTS',
		)
	}
	expect(() =>
		patchScenario(
			store,
			result.collectionId,
			{ delays: [{ mockKey: 'missing', delayMs: 0 }] },
			origin,
		),
	).toThrow('INVALID_SCENARIO')
	expect(() =>
		patchScenario(store, result.collectionId, { name: 'New' }, 'https://other.test'),
	).toThrow('ACCESS_DENIED')
	store.mocks[0].collectionId = 'moved'
	expect(() =>
		patchScenario(store, result.collectionId, { delays: [{ mockKey: 'm', delayMs: 0 }] }, origin),
	).toThrow('INVALID_SCENARIO')
	store.collectionTree.nodes[result.collectionId].active = true
	expect(() => patchScenario(store, result.collectionId, { name: 'New' }, origin)).toThrow(
		'SCENARIO_ACTIVE',
	)
})
it('commits patches with receipts and rejects stale or revoked updates', async () => {
	const { store, result } = fixture()
	let saved: Awaited<ReturnType<LibraryStorage['read']>> = store
	const storage: LibraryStorage = {
		read: async () => structuredClone(saved),
		write: async (next) => {
			saved = structuredClone(next)
		},
	}
	const identity = {
		operationId: '00000000-0000-4000-8000-000000000001',
		issuedAt: 1000,
		expiresAt: 301000,
	}
	const command = {
		type: 'scenario_patch' as const,
		collectionId: result.collectionId,
		expectedRevision: 0,
		origin,
		patch: { name: 'New' },
	}
	const writer = createLibraryWriter(storage, () => 2000)
	await writer.execute(identity, command, { scope: 'agent' })
	const replay = await createLibraryWriter(storage, () => 2000).execute(identity, command, {
		scope: 'agent',
	})
	expect(replay.committedRevision).toBe(1)
	expect(replay.result).toEqual(result)
	expect(saved?.mocks?.[0].response).toContain('synthetic-secret')
	await expect(
		writer.execute({ ...identity, operationId: '00000000-0000-4000-8000-000000000002' }, command),
	).rejects.toThrow('REVISION_CONFLICT')
	await expect(
		writer.execute(identity, command, {
			scope: 'agent',
			authorize: async () => {
				throw new Error('ACCESS_DENIED')
			},
		}),
	).rejects.toThrow('ACCESS_DENIED')
	expect(saved?.revision).toBe(1)
})

it('edits JSON fields and array elements while preserving hidden sibling values', () => {
	const { store, result } = fixture()
	store.mocks[0].response =
		'{"token":"synthetic-secret","items":[{"id":1,"email":"hidden"}],"obsolete":true}'
	const changed = patchScenario(
		store,
		result.collectionId,
		{
			bodyFields: [
				{ mockKey: 'm', path: ['items', '0', 'id'], valueJson: '2' },
				{ mockKey: 'm', path: ['obsolete'], remove: true },
				{ mockKey: 'm', path: ['visible'], valueJson: 'true' },
			],
		},
		origin,
	)
	expect(JSON.parse(changed.store.mocks[0].response!)).toEqual({
		token: 'synthetic-secret',
		items: [{ id: 2, email: 'hidden' }],
		visible: true,
	})
	expect(changed.store.mocks[0].headers).toEqual(store.mocks[0].headers)
	expect(JSON.parse(store.mocks[0].response!).items[0].id).toBe(1)
})
it('rejects ambiguous or unsafe JSON edits atomically', () => {
	const { store, result } = fixture()
	store.mocks[0].response = '{"items":[1],"token":"hidden"}'
	const before = structuredClone(store)
	for (const bodyFields of [
		[{ mockKey: 'm', path: [], valueJson: '{}' }],
		[{ mockKey: 'm', path: ['__proto__', 'polluted'], valueJson: 'true' }],
		[
			{ mockKey: 'm', path: ['items'], valueJson: '[]' },
			{ mockKey: 'm', path: ['items', '0'], valueJson: '2' },
		],
		[{ mockKey: 'm', path: ['items', '0'], remove: true }],
		[{ mockKey: 'm', path: ['items', '01'], valueJson: '1' }],
		[{ mockKey: 'm', path: ['unknown', 'nested'], valueJson: '{}' }],
		[{ mockKey: 'm', path: ['new'], valueJson: 'invalid-json' }],
		[{ mockKey: 'm', path: ['new'], valueJson: '9007199254740993' }],
		[
			{ mockKey: 'm', path: ['new'], valueJson: 'true' },
			{ mockKey: 'missing', path: ['new'], valueJson: 'true' },
		],
	]) {
		expect(() =>
			patchScenario(
				store,
				result.collectionId,
				{ name: 'must not persist', bodyFields } as never,
				origin,
			),
		).toThrow()
		expect(store).toEqual(before)
	}
	expect(Object.prototype).not.toHaveProperty('polluted')
	store.mocks[0].response = '{"largeId":9007199254740993}'
	expect(() =>
		patchScenario(
			store,
			result.collectionId,
			{ bodyFields: [{ mockKey: 'm', path: ['other'], valueJson: '1' }] },
			origin,
		),
	).toThrow('INVALID_ARGUMENTS')
})
it('explicitly replaces a selected subtree, never merging hidden children back', () => {
	const { store, result } = fixture()
	store.mocks[0].response = '{"user":{"token":"old","id":1},"untouched":"keep"}'
	const changed = patchScenario(
		store,
		result.collectionId,
		{ bodyFields: [{ mockKey: 'm', path: ['user'], valueJson: '{"id":2}' }] },
		origin,
	)
	expect(JSON.parse(changed.store.mocks[0].response!)).toEqual({
		user: { id: 2 },
		untouched: 'keep',
	})
})

it('patches named headers case-insensitively without erasing unrelated hidden values', () => {
	const { store, result } = fixture()
	store.mocks[0].headers = [
		{ name: 'Set-Cookie', value: 'secret-a' },
		{ name: 'set-cookie', value: 'secret-b' },
		{ name: 'X-Test', value: 'old' },
		{ name: 'x-test', value: 'duplicate' },
		{ name: 'X-Remove', value: 'old' },
	]
	const updated = patchScenario(
		store,
		result.collectionId,
		{
			headers: [
				{ mockKey: 'm', name: 'x-TEST', value: 'new' },
				{ mockKey: 'm', name: 'x-remove', remove: true },
				{ mockKey: 'm', name: 'X-Added', value: '' },
			],
		},
		origin,
	)
	expect(updated.store.mocks[0].headers).toEqual([
		{ name: 'Set-Cookie', value: 'secret-a' },
		{ name: 'set-cookie', value: 'secret-b' },
		{ name: 'x-TEST', value: 'new' },
		{ name: 'X-Added', value: '' },
	])
	expect(updated.store.mocks[0].response).toBe(store.mocks[0].response)
	expect(store.mocks[0].headers).toHaveLength(5)
	const removed = patchScenario(
		store,
		result.collectionId,
		{ headers: [{ mockKey: 'm', name: 'SET-cookie', remove: true }] },
		origin,
	)
	expect(removed.store.mocks[0].headers).toHaveLength(3)
})
it('rejects header injection, duplicate edits and overflow without partial mutations', () => {
	const { store, result } = fixture()
	const before = structuredClone(store)
	for (const headers of [
		[{ mockKey: 'm', name: 'X-Test', value: 'ok\r\nInjected: true' }],
		[{ mockKey: 'm', name: 'X-Test', value: 'bad\0' }],
		[{ mockKey: 'm', name: 'Bad Name', value: 'value' }],
		[{ mockKey: 'm', name: 'X-Test', value: 'x'.repeat(8193) }],
		[
			{ mockKey: 'm', name: 'X-Test', value: 'one' },
			{ mockKey: 'm', name: 'x-test', remove: true },
		],
		[
			{ mockKey: 'm', name: 'X-Test', value: 'one' },
			{ mockKey: 'unknown', name: 'X-Test', value: 'two' },
		],
	]) {
		expect(() =>
			patchScenario(
				store,
				result.collectionId,
				{ name: 'must not persist', headers } as never,
				origin,
			),
		).toThrow()
		expect(store).toEqual(before)
	}
	store.mocks[0].headers = Array.from({ length: 100 }, (_, index) => ({
		name: `X-${index}`,
		value: 'v',
	}))
	expect(() =>
		patchScenario(
			store,
			result.collectionId,
			{ headers: [{ mockKey: 'm', name: 'X-New', value: 'v' }] },
			origin,
		),
	).toThrow('LIMIT_EXCEEDED')
	expect(store.mocks[0].headers).toHaveLength(100)
})

it('reorders every existing rule including manual ones without rewriting their fields', () => {
	const { store, result } = fixture()
	const node = store.collectionTree.nodes[result.collectionId]
	const before = structuredClone(node.scenario!)
	const order = before.rules.map((rule) => rule.id).reverse()
	const changed = patchScenario(
		store,
		result.collectionId,
		{ scenarioEnabled: false, ruleOrder: order },
		origin,
	)
	expect(changed.store.collectionTree.nodes[result.collectionId].scenario).toEqual({
		enabled: false,
		rules: before.rules.toReversed(),
	})
	expect(changed.store.mocks).toEqual(store.mocks)
	expect(changed.store.collectionTree.nodes[result.collectionId].automation).toEqual(
		node.automation,
	)
	expect(node.scenario).toEqual(before)
})
it('rejects missing, duplicated or foreign rules rather than discarding manual edits', () => {
	const { store, result } = fixture()
	const node = store.collectionTree.nodes[result.collectionId]
	const ids = node.scenario!.rules.map((rule) => rule.id)
	const before = structuredClone(store)
	for (const ruleOrder of [[], ids.slice(0, 1), [ids[0], ids[0]], [ids[0], 'foreign']]) {
		expect(() =>
			patchScenario(store, result.collectionId, { name: 'must not persist', ruleOrder }, origin),
		).toThrow()
		expect(store).toEqual(before)
	}
	expect(() =>
		patchScenario(store, result.collectionId, { scenarioEnabled: 'false' } as never, origin),
	).toThrow('INVALID_ARGUMENTS')
	delete node.scenario
	expect(() =>
		patchScenario(store, result.collectionId, { scenarioEnabled: true }, origin),
	).toThrow('INVALID_SCENARIO')
})

it('switches managed and manual rule responses without changing endpoints, order or mock data', () => {
	const { store, result } = fixture()
	const rules = store.collectionTree.nodes[result.collectionId].scenario!.rules
	const patched = patchScenario(
		store,
		result.collectionId,
		{
			ruleResponses: [
				{ ruleId: rules[0].id, respond: { network: true } },
				{ ruleId: 'manual', respond: { mockKey: 'm' } },
			],
		},
		origin,
	)
	expect(patched.store.collectionTree.nodes[result.collectionId].scenario!.rules).toEqual([
		{ ...rules[0], respond: { network: true } },
		{ ...rules[1], respond: { mockId: result.mockIds.m } },
	])
	expect(patched.store.mocks).toEqual(store.mocks)
	expect(rules[0].respond).toEqual({ mockId: result.mockIds.m })
})
it('rejects dangling responses, duplicate edits and out-of-scope endpoints atomically', () => {
	const { store, result } = fixture()
	const id = store.collectionTree.nodes[result.collectionId].scenario!.rules[0].id
	const before = structuredClone(store)
	for (const ruleResponses of [
		[{ ruleId: 'missing', respond: { network: true } }],
		[{ ruleId: id, respond: { mockKey: 'missing' } }],
		[{ ruleId: id, respond: { network: true, mockKey: 'm' } }],
		[{ ruleId: id, respond: { network: false } }],
		[
			{ ruleId: id, respond: { network: true } },
			{ ruleId: id, respond: { mockKey: 'm' } },
		],
	]) {
		expect(() =>
			patchScenario(
				store,
				result.collectionId,
				{ name: 'must not persist', ruleResponses } as never,
				origin,
			),
		).toThrow()
		expect(store).toEqual(before)
	}
	store.mocks[0].collectionId = 'moved'
	expect(() =>
		patchScenario(
			store,
			result.collectionId,
			{ ruleResponses: [{ ruleId: id, respond: { mockKey: 'm' } }] },
			origin,
		),
	).toThrow('INVALID_SCENARIO')
	store.collectionTree.nodes[result.collectionId].scenario!.rules[0].url =
		'file:///tasks'
	expect(() =>
		patchScenario(
			store,
			result.collectionId,
			{ ruleResponses: [{ ruleId: id, respond: { network: true } }] },
			origin,
		),
	).toThrow('INVALID_SCENARIO')
})

it('rejects every managed mock edit with a non-HTTP API URL', () => {
	const { store, result } = fixture()
	store.mocks[0].url = 'file:///tasks'
	const before = structuredClone(store)
	for (const patch of [
		{ delays: [{ mockKey: 'm', delayMs: 10 }] },
		{ headers: [{ mockKey: 'm', name: 'X-Test', value: 'changed' }] },
		{ bodyFields: [{ mockKey: 'm', path: ['visible'], valueJson: 'true' }] },
	]) {
		expect(() => patchScenario(store, result.collectionId, patch, origin)).toThrow('INVALID_SCENARIO')
		expect(store).toEqual(before)
	}
})
