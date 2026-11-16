import { afterEach, expect, it, vi } from 'vitest'

import { validateResult } from '@mockman/automation-protocol'
import { handleScenarioCommand } from '@/background/scenario-commands'
import { defaultLibrary } from '@/services/library-normalize'
import type { ScenarioBundle } from '@/services/scenario-bundle'
import { applyScenarioBundle } from '@/services/scenario-bundle'
import { readScenario } from '@/services/scenario-read'

const origin = 'https://app.example.test'
const bundle: ScenarioBundle = {
	scenarioKey: 'read',
	collection: { name: 'Read' },
	mocks: [
		{
			key: 'm',
			name: 'Mock',
			method: 'GET',
			url: 'https://api.example.test/tasks',
			response: { status: 200, headers: [], body: '{"items":[1]}' },
		},
	],
	scenario: {
		enabled: true,
		rules: [{ key: 'r', method: 'GET', url: 'https://api.example.test/tasks', respond: { mockKey: 'm' } }],
	},
}
const fixture = () => applyScenarioBundle(defaultLibrary(), bundle, origin)
afterEach(() => vi.unstubAllGlobals())
it('reads a round-trip bundle and current manual edits without exposing the library', () => {
	const { store, result } = fixture()
	store.mocks[0].response = '{"items":[2]}'
	store.revision = 7
	const view = readScenario(store, result.collectionId, origin)
	expect(view).toMatchObject({ libraryRevision: 7, redacted: false, canApplyBundle: true })
	expect(view.bundle.mocks[0].response.body).toBe('{"items":[2]}')
	expect(applyScenarioBundle(store, view.bundle, origin).store.mocks[0].response).toBe(
		'{"items":[2]}',
	)
	expect(view).not.toHaveProperty('ai')
	expect(() => readScenario(store, result.collectionId, 'https://other.test')).toThrow(
		'ACCESS_DENIED',
	)
})
it('filters credentials and private fields, and prevents a replacement from erasing hidden values', () => {
	const { store, result } = fixture()
	store.mocks[0].response =
		'{"items":[{"email":"private-value","token":"private-value"}],"ok":true}'
	store.mocks[0].headers = [{ name: 'Set-Cookie', value: 'private-value' }]
	store.mocks[0].url += '?credential=private-value'
	const view = readScenario(store, result.collectionId, origin)
	expect(validateResult(view).valid).toBe(true)
	expect(view.redacted).toBe(true)
	expect(view.canApplyBundle).toBe(false)
	expect(view.redactedFields).toHaveLength(4)
	expect(JSON.stringify(view)).not.toContain('private-value')
	const before = structuredClone(store)
	expect(() => applyScenarioBundle(store, bundle, origin)).toThrow('SCENARIO_REQUIRES_MANUAL_EDIT')
	expect(store).toEqual(before)
	store.mocks[0].response = '<html>private-value</html>'
	expect(readScenario(store, result.collectionId, origin).bundle.mocks[0].response.body).toBe(
		'[REDACTED]',
	)
})
it('reports manual rules and unsupported modes instead of silently replacing them', () => {
	const { store, result } = fixture()
	store.collectionTree.nodes[result.collectionId].scenario!.rules[0].id = 'manual-rule'
	store.mocks[0].requestPatch = { mode: 'replace', body: 'private-value' }
	const view = readScenario(store, result.collectionId, origin)
	expect(validateResult(view).valid).toBe(true)
	expect(view.unsupported).toEqual(['MOCK_MODE', 'MANUAL_RULE'])
	expect(view.canApplyBundle).toBe(false)
	expect(JSON.stringify(view)).not.toContain('private-value')
	expect(() => applyScenarioBundle(store, bundle, origin)).toThrow('SCENARIO_REQUIRES_MANUAL_EDIT')
})
it('rechecks permission after storage read and rejects missing or oversized reads', async () => {
	const { store, result } = fixture()
	vi.stubGlobal('chrome', {
		storage: { local: { get: async () => ({ 'mockman.extension.main.db': store }) } },
	})
	const access = { scope: 'agent', origin, authorize: vi.fn().mockResolvedValue(undefined) }
	expect(
		await handleScenarioCommand('get_scenario', { collectionId: result.collectionId }, access),
	).toMatchObject({ kind: 'scenario' })
	expect(access.authorize).toHaveBeenCalledTimes(2)
	access.authorize
		.mockReset()
		.mockResolvedValueOnce(undefined)
		.mockRejectedValueOnce(new Error('ACCESS_DENIED'))
	expect(
		await handleScenarioCommand('get_scenario', { collectionId: result.collectionId }, access),
	).toMatchObject({ code: 'ACCESS_DENIED' })
	access.authorize.mockResolvedValue(undefined)
	expect(
		await handleScenarioCommand('get_scenario', { collectionId: 'missing' }, access),
	).toMatchObject({ code: 'ACCESS_DENIED' })
	store.mocks[0].response = JSON.stringify({ padding: 'x'.repeat(2 * 1024 * 1024) })
	expect(
		await handleScenarioCommand('get_scenario', { collectionId: result.collectionId }, access),
	).toMatchObject({ code: 'LIMIT_EXCEEDED' })
})
