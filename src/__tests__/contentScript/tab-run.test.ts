import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { ContentScriptState } from '@/contentScript/state'
import { RUN_LEASE_MS, TabRun } from '@/contentScript/tab-run'
import { MethodEnum } from '@/interface/network'
import { defaultLibrary } from '@/services/library-normalize'

beforeEach(() => {
	vi.useFakeTimers()
	vi.setSystemTime(10000)
})
afterEach(() => vi.useRealTimers())
const origin = 'https://app.example.test'
function fixture() {
	const base = new ContentScriptState()
	base.origin = origin
	base.store = { ...defaultLibrary(), sitePermissions: { [origin]: { grantedOn: 1 } } }
	const changed = vi.fn()
	const layer = new TabRun(() => base, changed)
	const store = {
		...base.store,
		active: true,
		mocks: [
			{
				id: 'm',
				method: MethodEnum.GET,
				url: `${origin}/tasks`,
				response: '{}',
				status: 200,
				active: true,
				description: '',
				collectionId: 'c',
			},
		],
		collectionTree: {
			root: [{ type: 'collection' as const, id: 'c' }],
			nodes: {
				c: {
					id: 'c',
					name: 'c',
					active: true,
					parentId: null,
					createdOn: 0,
					entries: [{ type: 'mock' as const, id: 'm' }],
					scenario: {
						enabled: true,
						rules: [{ id: 'r', method: 'GET', url: `${origin}/tasks`, respond: { mockId: 'm' } }],
					},
				},
			},
		},
	}
	const start = {
		action: 'start',
		owner: 'agent',
		documentId: layer.documentId,
		operationId: 'start',
		issuedAt: 10000,
		expiresAt: 300000,
		fingerprint: 'start',
		origin,
		revision: 1,
		store,
	}
	return { base, layer, changed, start }
}
it('overlays a snapshot without mutating the library, then expires without a live background', () => {
	const { base, layer, start } = fixture()
	layer.handle(start)
	start.store.mocks[0].response = 'changed later'
	expect(layer.view().store.mocks[0].response).toBe('{}')
	expect(base.store.active).toBe(false)
	vi.advanceTimersByTime(RUN_LEASE_MS + 2)
	expect(layer.state('agent').state).toBe('stopped')
	expect(layer.view()).toBe(base)
})
it('an expired start replay cannot resurrect the run', () => {
	const { layer, start } = fixture()
	layer.handle(start)
	vi.advanceTimersByTime(RUN_LEASE_MS + 2)
	expect(layer.handle(start)).toMatchObject({ replayed: true, state: 'stopped' })
})
it('deduplicates reset, checks generation, isolates owners and rejects old documents', () => {
	const { layer, start } = fixture()
	layer.handle(start)
	const reset = {
		action: 'reset',
		owner: 'agent',
		documentId: layer.documentId,
		runId: 'start',
		expectedGeneration: 0,
		operationId: 'reset',
		fingerprint: 'reset',
		issuedAt: 10000,
		expiresAt: 300000,
	}
	layer.handle(reset)
	layer.runtime()?.match(layer.view().store, 'GET', `${origin}/tasks`)
	expect(layer.handle(reset)).toMatchObject({
		replayed: true,
		generation: 1,
		counts: { 'endpoint-1': 1 },
	})
	expect(() => layer.handle({ ...reset, operationId: 'other' })).toThrow('GENERATION_CONFLICT')
	expect(() => layer.handle({ ...reset, fingerprint: 'different' })).toThrow('OPERATION_ID_REUSED')
	expect(() => layer.handle({ action: 'state', owner: 'other' })).toThrow('TAB_BUSY')
	expect(() => layer.handle({ ...reset, documentId: 'old-document' })).toThrow('DOCUMENT_CHANGED')
})
it('revoked site permissions immediately remove the overlay and restore base state', () => {
	const { base, layer, start } = fixture()
	layer.handle(start)
	base.store.sitePermissions = {}
	expect(layer.view()).toBe(base)
	expect(layer.state('agent').state).toBe('stopped')
})
it('renewal extends only the same run and stop does not erase manual library changes', () => {
	const { base, layer, start } = fixture()
	layer.handle(start)
	vi.advanceTimersByTime(30000)
	layer.handle({ action: 'renew', owner: 'agent', documentId: layer.documentId, runId: 'start' })
	vi.advanceTimersByTime(30000)
	expect(layer.state('agent').state).toBe('running')
	base.store.theme = 'dark'
	layer.handle({ action: 'revoke', owner: 'agent', documentId: layer.documentId, runId: 'start' })
	expect(layer.view().store.theme).toBe('dark')
	expect(() =>
		layer.handle({ action: 'renew', owner: 'agent', documentId: layer.documentId, runId: 'start' }),
	).toThrow('RUN_NOT_FOUND')
})

it('bounds diagnostics, omits request data and guards run identity and generation', () => {
	const { layer, start } = fixture()
	layer.handle(start)
	const query = {
		action: 'logs',
		owner: 'agent',
		documentId: layer.documentId,
		runId: 'start',
		expectedGeneration: 0,
	}
	for (let i = 0; i < 205; i++)
		layer.runtime()?.match(layer.view().store, 'GET', `${origin}/tasks?secret=hidden`)
	const logs = layer.handle(query) as { entries: unknown[]; dropped: number }
	expect(logs.entries).toHaveLength(200)
	expect(logs.dropped).toBe(5)
	expect(logs.entries[0]).toEqual({
		sequence: 6,
		collectionId: 'c',
		ruleId: 'r',
		mockId: 'm',
		method: 'GET',
		callNumber: 6,
		outcome: 'mock',
	})
	expect(JSON.stringify(logs)).not.toContain('hidden')
	expect(() => layer.handle({ ...query, owner: 'other' })).toThrow('TAB_BUSY')
	expect(() => layer.handle({ ...query, runId: 'old' })).toThrow('RUN_NOT_FOUND')
	layer.handle({
		...query,
		action: 'reset',
		operationId: 'reset',
		fingerprint: 'reset',
		issuedAt: 10000,
		expiresAt: 300000,
	})
	expect(() => layer.handle(query)).toThrow('GENERATION_CONFLICT')
	expect(layer.handle({ ...query, expectedGeneration: 1 })).toMatchObject({
		entries: [],
		dropped: 0,
	})
	layer.runtime()?.match(layer.view().store, 'GET', `${origin}/unmatched`)
	expect(layer.handle({ ...query, expectedGeneration: 1 })).toMatchObject({
		entries: [{ outcome: 'unmatched', ruleId: null }],
	})
	layer.view().store.collectionTree!.nodes.c.scenario!.rules[0].respond = { network: true }
	layer.runtime()?.match(layer.view().store, 'GET', `${origin}/tasks`)
	expect(layer.handle({ ...query, expectedGeneration: 1 })).toMatchObject({
		entries: [{ outcome: 'unmatched' }, { outcome: 'network', mockId: null }],
	})
})

it('reports overlapping URL patterns while preserving rule order', () => {
	const { layer, start } = fixture()
	start.store.collectionTree.nodes.c.scenario.rules.push({
		id: 'dynamic',
		method: 'GET',
		url: `${origin}/:resource`,
		respond: { mockId: 'm' },
	})
	layer.handle(start)
	layer.runtime()?.match(layer.view().store, 'GET', `${origin}/tasks`)
	expect(
		layer.handle({
			action: 'logs',
			owner: 'agent',
			documentId: layer.documentId,
			runId: 'start',
			expectedGeneration: 0,
		}),
	).toMatchObject({
		entries: [{ ruleId: 'r', overlappingRuleIds: ['r', 'dynamic'], outcome: 'mock' }],
	})
})

it('keeps actual dynamic paths out of run state while counting endpoints independently', () => {
	const { layer, start } = fixture()
	start.store.collectionTree.nodes.c.scenario.rules[0].url = `${origin}/:id`
	layer.handle(start)
	const runtime = layer.runtime()!
	runtime.match(layer.view().store, 'GET', `${origin}/private-person-one`)
	runtime.match(layer.view().store, 'GET', `${origin}/private-person-two`)
	runtime.match(layer.view().store, 'GET', `${origin}/private-person-one`)
	const state = layer.state('agent')
	expect(state.counts).toEqual({ 'endpoint-1': 2, 'endpoint-2': 1 })
	expect(JSON.stringify(state)).not.toContain('private-person')
	expect(JSON.stringify(state)).not.toContain(origin)
})

it('refreshes the same snapshot with explicit counter preservation, rejects rule changes and can reset', () => {
	const { layer, start } = fixture()
	layer.handle(start)
	layer.runtime()?.match(layer.view().store, 'GET', `${origin}/tasks`)
	const updated = structuredClone(start.store)
	updated.mocks[0].response = '{"updated":true}'
	const refresh = { ...start, action: 'refresh', runId: 'start', operationId: 'refresh', fingerprint: 'refresh', expectedGeneration: 0, counters: 'preserve' as const, store: updated, revision: 2 }
	expect(layer.handle(refresh)).toMatchObject({ appliedRevision: 2, generation: 1, counts: { 'endpoint-1': 1 } })
	expect(layer.view().store.mocks[0].response).toBe('{"updated":true}')
	expect(layer.handle(refresh)).toMatchObject({ replayed: true, generation: 1 })
	updated.collectionTree.nodes.c.scenario.rules.reverse()
	updated.collectionTree.nodes.c.scenario.rules[0].url += '/different'
	const changed = { ...refresh, operationId: 'next', fingerprint: 'next', expectedGeneration: 1 }
	expect(() => layer.handle(changed)).toThrow('COUNTERS_INCOMPATIBLE')
	expect(layer.handle({ ...changed, counters: 'reset' })).toMatchObject({ generation: 2, counts: {} })
})
