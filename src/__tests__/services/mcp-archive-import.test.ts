import { readFileSync } from 'node:fs'

import { expect, it } from 'vitest'

import { exportCollections, importCollections } from '@/services/collection-archive'
import type { CollectionArchive } from '@/services/collection-archive'
import { classifyImport, checkImportLimits, summarizeImport } from '@/services/mock-import'
import { importCollectionBundle } from '@/panel/app/service/store-actions'
import { defaultLibrary } from '@/services/library-normalize'

const example = JSON.parse(readFileSync('packages/automation-protocol/examples/sequence.json', 'utf8'))

it('imports MCP-exported cases through the UI with bodies, task folders, conditions and remapped sequence links', () => {
	const archive: CollectionArchive = { version: 1, bundles: [{
		...example,
		task: { key: 'TEST-1', name: 'Task' },
		mocks: example.mocks.map((mock: object) => ({ ...mock, priority: 5, when: { query: { taskId: '42' } } })),
	}] }
	const source = importCollections({}, archive, 'https://app.example.test', 'reject', '')
	const exported = exportCollections(source.store, source.result.collectionId, 'https://app.example.test')
	const classified = classifyImport(exported)
	expect(checkImportLimits(classified)).toBeNull()
	expect(classified.toFix).toEqual([])
	expect(summarizeImport(classified, 123)).toMatchObject({ mocks: 2, collections: 2,
		preview: [{ method: 'GET', status: 200, responseBytes: expect.any(Number) }, { method: 'GET', status: 200, responseBytes: expect.any(Number) }] })
	expect(classified.valid[0]).toMatchObject({ response: example.mocks[0].response.body, priority: 5, when: { query: { taskId: '42' } } })
	const imported = importCollectionBundle(defaultLibrary(), classified.package!)
	const twice = importCollectionBundle(imported, classified.package!)
	expect(twice.mocks).toHaveLength(4)
	expect(new Set(twice.mocks.map((mock) => mock.id)).size).toBe(4)
	for (const node of Object.values(twice.collectionTree.nodes)) {
		expect(node.active).toBe(false)
		expect(node.automation).toBeUndefined()
		for (const rule of node.scenario?.rules ?? []) {
			if ('mockId' in rule.respond) {
				const mockId = rule.respond.mockId
				expect(twice.mocks.find((mock) => mock.id === mockId)?.collectionId).toBe(node.id)
			}
		}
	}
})

it('accepts the export tool envelope and rejects damaged/unknown archives without blank drafts', () => {
	const archive = { version: 1, bundles: [example] }
	expect(classifyImport({ kind: 'collection_archive', archive }).valid).toHaveLength(2)
	for (const invalid of [{ ...archive, version: 2 }, { version: 1, bundles: [{}] }, { kind: 'collection_archive' }]) {
		const classified = classifyImport(invalid)
		expect(checkImportLimits(classified)).toEqual({ code: 'invalid_archive' })
		expect(classified.valid).toEqual([])
		expect(classified.toFix).toEqual([])
	}
})
