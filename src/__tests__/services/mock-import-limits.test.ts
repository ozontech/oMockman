import { describe, expect, it } from 'vitest'

import {
	IMPORT_LIMITS,
	checkImportLimits,
	classifyImport,
	parseImportSource,
	summarizeImport,
} from '@/services/mock-import'
import type { IMockResponse } from '@/interface/mock'
import { MethodEnum } from '@/interface/network'

const mock = (overrides: Partial<IMockResponse> = {}): IMockResponse => ({
	id: 'id-1',
	name: 'mock',
	method: MethodEnum.GET,
	url: 'https://example.com/api',
	status: 200,
	response: '{}',
	active: true,
	createdOn: 1,
	...overrides,
} as IMockResponse)

describe('parseImportSource', () => {
	it('accepts valid JSON within the size limit', () => {
		const result = parseImportSource('{"a":1}')
		expect(result).toEqual({ ok: true, value: { a: 1 } })
	})

	it('rejects input over the size limit', () => {
		const oversized = `"${'x'.repeat(IMPORT_LIMITS.maxSourceBytes)}"`
		const result = parseImportSource(oversized)
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.rejection.code).toBe('source_too_large')
	})

	it('rejects non-JSON input', () => {
		const result = parseImportSource('not json')
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.rejection.code).toBe('invalid_json')
	})
})

describe('checkImportLimits', () => {
	it('passes a small payload', () => {
		expect(checkImportLimits({ valid: [mock()], toFix: [] })).toBeNull()
	})

	it('rejects an empty payload', () => {
		expect(checkImportLimits({ valid: [], toFix: [] })).toEqual({ code: 'nothing_to_import' })
	})

	it('rejects too many mocks', () => {
		const valid = Array.from({ length: IMPORT_LIMITS.maxMocks + 1 }, (_, i) => mock({ id: `id-${i}` }))
		expect(checkImportLimits({ valid, toFix: [] })?.code).toBe('too_many_mocks')
	})

	it('counts entries that need fixing towards the mock limit', () => {
		const toFix = Array.from({ length: IMPORT_LIMITS.maxMocks + 1 }, () => ({ url: 'https://example.com' }))
		expect(checkImportLimits({ valid: [], toFix })?.code).toBe('too_many_mocks')
	})

	it('rejects an oversized response body', () => {
		const big = mock({ response: 'x'.repeat(IMPORT_LIMITS.maxResponseBytes + 1) })
		expect(checkImportLimits({ valid: [big], toFix: [] })?.code).toBe('response_too_large')
	})

	it('rejects too many collections', () => {
		const nodes: Record<string, never> = {}
		for (let i = 0; i <= IMPORT_LIMITS.maxCollectionNodes; i += 1) {
			nodes[`c${i}`] = { id: `c${i}`, name: 'c', parentId: null, active: true, createdOn: 1, entries: [] } as never
		}
		const rejection = checkImportLimits({
			valid: [mock()],
			toFix: [],
			package: { type: 'mockman.export', version: 1, mocks: [], collectionTree: { nodes, root: [] } },
		})
		expect(rejection?.code).toBe('too_many_collections')
	})

	it('rejects a collection tree that is too deep', () => {
		const nodes: Record<string, never> = {}
		let parentId: string | null = null
		for (let i = 0; i <= IMPORT_LIMITS.maxCollectionDepth; i += 1) {
			const id = `c${i}`
			nodes[id] = { id, name: 'c', parentId, active: true, createdOn: 1, entries: [] } as never
			parentId = id
		}
		const rejection = checkImportLimits({
			valid: [mock()],
			toFix: [],
			package: { type: 'mockman.export', version: 1, mocks: [], collectionTree: { nodes, root: [] } },
		})
		expect(rejection?.code).toBe('collection_too_deep')
	})
})

describe('summarizeImport', () => {
	it('reports counts and caps the preview', () => {
		const valid = Array.from({ length: 30 }, (_, i) => mock({ id: `id-${i}`, url: `https://example.com/${i}` }))
		const summary = summarizeImport({ valid, toFix: [] }, 1234)

		expect(summary.mocks).toBe(30)
		expect(summary.collections).toBe(0)
		expect(summary.bytes).toBe(1234)
		expect(summary.preview).toHaveLength(20)
		expect(summary.preview[0]).toEqual({
			method: 'GET',
			url: 'https://example.com/0',
			status: 200,
			responseBytes: 2,
		})
	})

	it('works on the output of classifyImport', () => {
		const classified = classifyImport([{ name: 'a', url: 'https://example.com/a', status: 200, method: 'GET' }])
		expect(checkImportLimits(classified)).toBeNull()
		expect(summarizeImport(classified, 10).mocks).toBe(1)
	})
})
