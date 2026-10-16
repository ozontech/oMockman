import type { ICollectionScenario, ICollectionTree } from '@/interface/collection'
import type { IMockResponse } from '@/interface/mock'
import { normalizeUrl } from '@/services/url'


export function createScenario(): ICollectionScenario {
	return { enabled: true, rules: [] }
}

export const endpointKey = (method: string, url: string): string => `${String(method).toUpperCase()} ${url}`

/** "POST https://…" back into its parts; a bare URL is a GET. */
export function parseEndpoint(key: string): { method: string; url: string } {
	const match = /^\s*([A-Za-z]+)\s+(\S.*)$/.exec(key)
	return match ? { method: match[1].toUpperCase(), url: match[2].trim() } : { method: 'GET', url: key.trim() }
}

/** The mocks of a collection and of the collections inside it. */
export function collectionMocks(tree: ICollectionTree, mocks: IMockResponse[], collectionId: string): IMockResponse[] {
	const byId = new Map(mocks.map((mock) => [mock.id, mock]))
	const out: IMockResponse[] = []
	const visit = (id: string) => {
		for (const entry of tree.nodes[id]?.entries ?? []) {
			if (entry.type === 'collection') visit(entry.id)
			else if (byId.has(entry.id)) out.push(byId.get(entry.id) as IMockResponse)
		}
	}
	visit(collectionId)
	return out
}

export const mocksOfEndpoint = (mocks: IMockResponse[], method: string, url: string): IMockResponse[] =>
	mocks.filter((mock) => String(mock.method).toUpperCase() === String(method).toUpperCase() && normalizeUrl(mock.url) === normalizeUrl(url))

/**
 * Rules in the order they answer: grouped by endpoint (in order of first appearance), stable
 * inside a group, so the Nth row of an endpoint is its Nth call.
 */
export function normalizeRules(scenario: ICollectionScenario): ICollectionScenario {
	const rank = new Map<string, number>()
	for (const rule of scenario.rules) {
		const key = endpointKey(rule.method, rule.url)
		if (!rank.has(key)) rank.set(key, rank.size)
	}
	const rules = scenario.rules
		.map((rule, index) => ({ rule, index }))
		.sort((a, b) => (rank.get(endpointKey(a.rule.method, a.rule.url)) as number) - (rank.get(endpointKey(b.rule.method, b.rule.url)) as number) || a.index - b.index)
		.map((entry) => entry.rule)
	return rules.every((rule, index) => rule === scenario.rules[index]) ? scenario : { ...scenario, rules }
}
