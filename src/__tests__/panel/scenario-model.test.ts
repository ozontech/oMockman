import { describe, expect, it } from 'vitest'

import { collectionMocks, normalizeRules, parseEndpoint } from '@/panel/app/mocks/model/scenario'
import type { ICollectionScenario } from '@/interface/collection'
import type { IMockResponse } from '@/interface/mock'

describe('scenario model', () => {
	it('reads an endpoint typed by hand', () => {
		expect(parseEndpoint('post https://a/x')).toEqual({ method: 'POST', url: 'https://a/x' })
		expect(parseEndpoint('https://a/x')).toEqual({ method: 'GET', url: 'https://a/x' })
	})

	it('keeps the rules of one endpoint together, in their order', () => {
		const rule = (id: string, url: string) => ({ id, method: 'GET', url, respond: { network: true } as const })
		const scenario: ICollectionScenario = {
			enabled: true,
			rules: [rule('a1', '/a'), rule('b1', '/b'), rule('a2', '/a'), rule('b2', '/b')],
		}

		expect(normalizeRules(scenario).rules.map((r) => r.id)).toEqual(['a1', 'a2', 'b1', 'b2'])

		const sorted = normalizeRules(scenario)
		expect(normalizeRules(sorted)).toBe(sorted)
	})

	it('finds the mocks of a collection and its subcollections', () => {
		const mock = (id: string) => ({ id } as IMockResponse)
		const tree = {
			root: [],
			nodes: {
				c: { id: 'c', name: 'c', parentId: null, active: true, createdOn: 1, entries: [{ id: 'm1', type: 'mock' as const }, { id: 'sub', type: 'collection' as const }] },
				sub: { id: 'sub', name: 'sub', parentId: 'c', active: true, createdOn: 1, entries: [{ id: 'm2', type: 'mock' as const }] },
			},
		}
		expect(collectionMocks(tree, [mock('m1'), mock('m2'), mock('m3')], 'c').map((m) => m.id)).toEqual(['m1', 'm2'])
	})
})
