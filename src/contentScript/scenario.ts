import { match as getMatcher } from 'path-to-regexp'

import { matchesConditions } from '@/services/mock-conditions'
import type { ICollectionNode, ICollectionScenario, IScenarioRule } from '@/interface/collection'
import type { IMockResponse, IStore } from '@/interface/mock'
import { isCollectionActive } from '@/services/collection-tree'
import { getActiveEnvVars, resolveTemplate } from '@/services/env'
import { normalizeUrl } from '@/services/url'

/** What a scenario rule decided for a request. */
export interface ScenarioHit {
	collectionId: string
	collectionName: string
	/** Which call of the endpoint this was, counted from the scenario start. */
	callNumber: number
	/** The mock to serve; null lets the real request through. */
	mock: IMockResponse | null
}

export interface ScenarioMatch {
	hit?: ScenarioHit
	/**
	 * A scenario has a rule for this endpoint: the page must ask again next time instead of
	 * caching "not mocked", or a later call would never be counted.
	 */
	tracked: boolean
}

const isDynamic = (url: string): boolean => url.includes('(.*)') || url.includes('/:')

const matchers = new Map<string, (url: string) => boolean>()

/** The same URL rules as mocks: env variables, a trailing slash and the query do not count. */
function urlMatches(pattern: string, url: string, vars: Record<string, string>): boolean {
	const expected = normalizeUrl(resolveTemplate(pattern, vars))
	const actual = normalizeUrl(url)
	if (!isDynamic(expected)) return expected === actual
	let test = matchers.get(expected)
	if (!test) {
		try {
			const compiled = getMatcher(expected.replace('://', '-'), { decode: decodeURIComponent })
			test = (candidate) => Boolean(compiled(candidate.replace('://', '-')))
		} catch {
			test = () => false
		}
		if (matchers.size > 500) matchers.clear()
		matchers.set(expected, test)
	}
	return test(actual)
}

const ruleMatches = (
	rule: IScenarioRule,
	method: string,
	url: string,
	vars: Record<string, string>,
): boolean => String(rule.method).toUpperCase() === method && urlMatches(rule.url, url, vars)

/** Every collection whose scenario is on and could act: active, with rules. */
function liveScenarios(
	store: IStore,
): Array<{ node: ICollectionNode; scenario: ICollectionScenario }> {
	const tree = store.collectionTree
	if (!tree?.nodes) return []
	return Object.values(tree.nodes)
		.filter(
			(node) =>
				node.scenario?.enabled &&
				Array.isArray(node.scenario.rules) &&
				node.scenario.rules.length > 0,
		)
		.filter((node) => isCollectionActive(tree, node.id))
		.map((node) => ({ node, scenario: node.scenario as ICollectionScenario }))
}

/**
 * The scenarios of one tab: how many times each endpoint was called. Lives in the isolated world,
 * so the page can neither read nor steer it, and starts over when the page reloads.
 */
export interface ScenarioDiagnostic {
	sequence: number
	collectionId: string | null
	ruleId: string | null
	mockId: string | null
	method: string
	callNumber: number | null
	outcome: 'mock' | 'network' | 'unmatched'
	overlappingRuleIds?: string[]
}

export class ScenarioRuntime {
	private readonly recent: ScenarioDiagnostic[] = []
	private sequence = 0
	constructor(private readonly diagnostics = false) {}
	logs(): { entries: ScenarioDiagnostic[]; dropped: number } {
		return {
			entries: this.recent.map((entry) => ({ ...entry })),
			dropped: this.sequence - this.recent.length,
		}
	}
	private readonly calls = new Map<string, number>()

	/** Opaque endpoint IDs preserve separate counters without exposing actual request paths. */
	counts(): Record<string, number> {
		return Object.fromEntries(
			[...this.calls.values()].map((count, index) => [`endpoint-${index + 1}`, count]),
		)
	}

	/** Counts the call and answers with the endpoint's Nth rule; the last one repeats. The first collection with a hit wins. */
	match(store: IStore, method: string, url: string, fallback?: () => IMockResponse | null, body?: string): ScenarioMatch {
		const upperMethod = String(method || 'GET').toUpperCase()
		const vars = getActiveEnvVars(store)
		let tracked = this.diagnostics
		let hit: ScenarioHit | undefined

		for (const { node, scenario } of liveScenarios(store)) {
			const endpointRules = scenario.rules.filter((rule) =>
				ruleMatches(rule, upperMethod, url, vars) && (!('mockId' in rule.respond) || store.mocks.some(mock => 'mockId' in rule.respond && mock.id === rule.respond.mockId && matchesConditions(mock, store, url, body))),
			)
			if (endpointRules.length === 0) continue
			tracked = true

			const callKey = `${node.id} ${upperMethod} ${normalizeUrl(url)} ${endpointRules.map(rule => rule.id).join(',')}`
			const call = (this.calls.get(callKey) ?? 0) + 1
			this.calls.set(callKey, call)
			if (hit) continue

			const rule = endpointRules[Math.min(call, endpointRules.length) - 1]

			const mock =
				'mockId' in rule.respond
					? store.mocks.find(
							(candidate) => candidate.id === (rule.respond as { mockId: string }).mockId,
					  ) ?? null
					: null
			if (this.diagnostics) {
				this.recent.push({
					sequence: ++this.sequence,
					collectionId: node.id,
					ruleId: rule.id,
					mockId: mock?.id ?? null,
					method: upperMethod,
					callNumber: call,
					outcome: mock ? 'mock' : 'network',
					...(new Set(endpointRules.map((item) => normalizeUrl(resolveTemplate(item.url, vars))))
						.size > 1
						? { overlappingRuleIds: endpointRules.map((item) => item.id) }
						: {}),
				})
				if (this.recent.length > 200) this.recent.shift()
			}
			hit = { collectionId: node.id, collectionName: node.name, callNumber: call, mock }
		}
		if (this.diagnostics && !hit) {
			const mock = fallback?.()
			this.recent.push({
				sequence: ++this.sequence,
				collectionId: mock?.collectionId ?? null,
				ruleId: null,
				mockId: mock?.id ?? null,
				method: upperMethod,
				callNumber: null,
				outcome: mock ? 'mock' : 'unmatched',
			})
			if (this.recent.length > 200) this.recent.shift()
		}
		return { hit, tracked }
	}

	/** Clears the call counts: of one collection, or of all. */
	reset(collectionId?: string): void {
		if (!collectionId) {
			this.calls.clear()
			this.recent.length = 0
			this.sequence = 0
			return
		}
		for (const key of this.calls.keys()) {
			if (key.startsWith(`${collectionId} `)) this.calls.delete(key)
		}
	}
}
