import { match as getMatcher } from 'path-to-regexp'

import type { ICollectionNode, ICollectionScenario, IScenarioRule } from '@/interface/collection'
import type { IMockResponse, IStore } from '@/interface/mock'
import { isCollectionActive } from '@/panel/app/service/collection-tree'
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

const ruleMatches = (rule: IScenarioRule, method: string, url: string, vars: Record<string, string>): boolean =>
	String(rule.method).toUpperCase() === method && urlMatches(rule.url, url, vars)

/** Every collection whose scenario is on and could act: active, with rules. */
function liveScenarios(store: IStore): Array<{ node: ICollectionNode; scenario: ICollectionScenario }> {
	const tree = store.collectionTree
	if (!tree?.nodes) return []
	return Object.values(tree.nodes)
		.filter((node) => node.scenario?.enabled && Array.isArray(node.scenario.rules) && node.scenario.rules.length > 0)
		.filter((node) => isCollectionActive(tree, node.id))
		.map((node) => ({ node, scenario: node.scenario as ICollectionScenario }))
}

/**
 * The scenarios of one tab: how many times each endpoint was called. Lives in the isolated world,
 * so the page can neither read nor steer it, and starts over when the page reloads.
 */
export class ScenarioRuntime {
	private readonly calls = new Map<string, number>()

	/** Counts the call and answers with the endpoint's Nth rule; the last one repeats. The first collection with a hit wins. */
	match(store: IStore, method: string, url: string): ScenarioMatch {
		const upperMethod = String(method || 'GET').toUpperCase()
		const vars = getActiveEnvVars(store)
		let tracked = false
		let hit: ScenarioHit | undefined

		for (const { node, scenario } of liveScenarios(store)) {
			const endpointRules = scenario.rules.filter((rule) => ruleMatches(rule, upperMethod, url, vars))
			if (endpointRules.length === 0) continue
			tracked = true

			const callKey = `${node.id} ${upperMethod} ${normalizeUrl(url)}`
			const call = (this.calls.get(callKey) ?? 0) + 1
			this.calls.set(callKey, call)
			if (hit) continue

			const rule = endpointRules[Math.min(call, endpointRules.length) - 1]

			const mock = 'mockId' in rule.respond
				? store.mocks.find((candidate) => candidate.id === (rule.respond as { mockId: string }).mockId) ?? null
				: null
			hit = { collectionId: node.id, collectionName: node.name, callNumber: call, mock }
		}
		return { hit, tracked }
	}

	/** Clears the call counts: of one collection, or of all. */
	reset(collectionId?: string): void {
		if (!collectionId) {
			this.calls.clear()
			return
		}
		for (const key of this.calls.keys()) {
			if (key.startsWith(`${collectionId} `)) this.calls.delete(key)
		}
	}
}
