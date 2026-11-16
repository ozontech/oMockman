import { normalizeLibrary } from './library-normalize'
import { readScenario } from './scenario-read'

import type { ICollectionNode } from '@/interface/collection'
import type { IMockResponse, IStore } from '@/interface/mock'
import { MethodEnum } from '@/interface/network'
import type { ScenarioBundle } from '@mockman/automation-protocol'
import { validateBundle } from '@mockman/automation-protocol'

export type { ScenarioBundle }
export interface BundleSaved {
	imported?: string[]
	collectionId: string
	mockIds: Record<string, string>
	ruleIds: Record<string, string>
}

/** Treat external responses as data; never include them in validation errors. */
export function assertScenarioBundle(value: unknown): asserts value is ScenarioBundle {
	if (!validateBundle(value).valid) throw new Error('INVALID_SCENARIO')
}

/** Pure bundle operation: persistent IDs are assigned only after the revision check in the writer. */
export function applyScenarioBundle(
	raw: Partial<IStore>,
	bundle: ScenarioBundle,
	origin: string,
): { store: IStore; result: BundleSaved } {
	assertScenarioBundle(bundle)

	const store = structuredClone(normalizeLibrary(raw))
	const nodes = store.collectionTree.nodes
	const matches = Object.values(nodes).filter(
		(node) =>
			node.automation?.scenarioKey === bundle.scenarioKey &&
			(bundle.task
				? nodes[node.parentId ?? '']?.task?.key === bundle.task.key
				: !nodes[node.parentId ?? '']?.task),
	)
	if (matches.length > 1) throw new Error('INVALID_SCENARIO')
	const previous = matches[0]
	if (previous && previous.automation?.origin !== origin) throw new Error('ACCESS_DENIED')
	let parentId = previous?.parentId ?? null
	if (bundle.task) {
		const parents = Object.values(nodes).filter(
			(node) => node.task?.key === bundle.task?.key && node.task?.origin === origin,
		)
		if (parents.length > 1) throw new Error('INVALID_SCENARIO')
		const parent = parents[0]
		parentId = parent?.id ?? crypto.randomUUID()
		nodes[parentId] = parent ?? {
			id: parentId,
			name: `${bundle.task.key} — ${bundle.task.name}`,
			parentId: null,
			active: false,
			createdOn: Date.now(),
			entries: [],
			task: { key: bundle.task.key, origin },
		}
		if (!parent) store.collectionTree.root.push({ type: 'collection', id: parentId })
	}
	const collectionId = previous?.id ?? crypto.randomUUID()
	const oldMocks = previous?.automation?.mockIds ?? {}
	const oldRules = previous?.automation?.ruleIds ?? {}
	const mockIds: Record<string, string> = Object.fromEntries(
		bundle.mocks.map((mock) => [
			mock.key,
			Object.hasOwn(oldMocks, mock.key) ? oldMocks[mock.key] : crypto.randomUUID(),
		]),
	)
	const ruleIds: Record<string, string> = Object.fromEntries(
		bundle.scenario.rules.map((rule) => [
			rule.key,
			Object.hasOwn(oldRules, rule.key) ? oldRules[rule.key] : crypto.randomUUID(),
		]),
	)
	const managed = new Set(Object.values(oldMocks))
	const remaining = new Set(Object.values(mockIds))
	const removed = new Set([...managed].filter((id) => !remaining.has(id)))
	// A moved managed mock is now outside this collection. Never update/delete it implicitly.
	for (const mock of store.mocks)
		if (managed.has(mock.id) && mock.collectionId !== collectionId)
			throw new Error('INVALID_SCENARIO')
	if (previous) {
		const view = readScenario(store, previous.id, origin)
		if (view.redacted || view.unsupported.length) throw new Error('SCENARIO_REQUIRES_MANUAL_EDIT')
	}
	for (const node of Object.values(nodes)) {
		if (node.id === collectionId) continue
		if (
			node.entries.some((entry) => entry.type === 'mock' && removed.has(entry.id)) ||
			node.scenario?.rules.some(
				(rule) => 'mockId' in rule.respond && removed.has(rule.respond.mockId),
			)
		)
			throw new Error('SCENARIO_REFERENCED')
	}
	if (store.collectionTree.root.some((entry) => entry.type === 'mock' && removed.has(entry.id)))
		throw new Error('SCENARIO_REFERENCED')
	const additions: IMockResponse[] = bundle.mocks.map((mock) => {
		const existing = store.mocks.find((item) => item.id === mockIds[mock.key])
		return {
			id: mockIds[mock.key],
			collectionId,
			name: mock.name ?? mock.key,
			method: MethodEnum[mock.method],
			url: mock.url,
			status: mock.response.status,
			headers: mock.response.headers,
			response: mock.response.body,
			delay: mock.response.delayMs,
			active: mock.enabled ?? true,
			priority: mock.priority,
			when: mock.when,
			dynamic: mock.url.includes('/:') || mock.url.includes('(.*)'),
			description: existing?.description ?? '',
			createdOn: existing?.createdOn ?? Date.now(),
			apply: { responseBody: true, responseHeaders: true, requestBody: false },
		}
	})
	store.mocks = [...store.mocks.filter((mock) => !managed.has(mock.id)), ...additions]
	store.totalMocksCreated += additions.filter((mock) => !managed.has(mock.id)).length
	const node: ICollectionNode = {
		...previous,
		id: collectionId,
		name: bundle.collection.name,
		parentId,
		// Saving must never enable a global collection. Existing user activation requires an explicit manual stop before updating.
		active: false,
		createdOn: previous?.createdOn ?? Date.now(),
		entries: [
			...(previous?.entries ?? []).filter(
				(entry) => entry.type !== 'mock' || !managed.has(entry.id),
			),
			...additions.map((mock) => ({ id: mock.id, type: 'mock' as const })),
		],
		scenario: {
			enabled: bundle.scenario.enabled,
			rules: bundle.scenario.rules.map((rule) => ({
				id: ruleIds[rule.key],
				method: rule.method,
				url: rule.url,
				respond:
					'mockKey' in rule.respond ? { mockId: mockIds[rule.respond.mockKey] } : { network: true },
			})),
		},
		automation: { scenarioKey: bundle.scenarioKey, origin, mockIds, ruleIds },
	}
	if (previous?.active) throw new Error('SCENARIO_ACTIVE')
	nodes[collectionId] = node
	if (!previous)
		(parentId ? nodes[parentId].entries : store.collectionTree.root).push({
			type: 'collection',
			id: collectionId,
		})
	return { store, result: { collectionId, mockIds, ruleIds } }
}
