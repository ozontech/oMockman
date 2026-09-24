import { describe, expect, it } from 'vitest'

import { buildMockGenerationMessages } from '../prompt-builder'
import { MethodEnum } from '../../../interface/network'
import type { ICollectionNode } from '../../../interface/collection'

describe('buildMockGenerationMessages', () => {
	it('returns exactly the system and user messages, in order', () => {
		const messages = buildMockGenerationMessages({
			mock: { method: MethodEnum.GET, url: '/api/items', status: 200 },
		})

		expect(messages).toHaveLength(2)
		expect(messages[0].role).toBe('system')
		expect(messages[1].role).toBe('user')
	})

	it('uses the default system prompt when no custom one is set', () => {
		const [system] = buildMockGenerationMessages({
			mock: { method: MethodEnum.GET, url: '/api/items', status: 200 },
		})

		expect(system.content).toMatch(/single valid JSON document/i)
		expect(system.content).not.toMatch(/Collection instructions/)
	})

	it('adds the collection prompt when the collection has aiPrompt', () => {
		const collection: ICollectionNode = {
			id: 'col-1',
			name: 'WMS Items',
			parentId: null,
			active: true,
			createdOn: 1,
			entries: [],
			aiPrompt: 'IDs must be 12-digit numeric strings.',
		}

		const [system] = buildMockGenerationMessages({
			mock: { method: MethodEnum.GET, url: '/api/items', status: 200 },
			collection,
		})

		expect(system.content).toMatch(/Collection instructions/)
		expect(system.content).toMatch(/12-digit numeric/)
	})

	it('appends the global system prompt to the default one instead of replacing it', () => {
		const [system] = buildMockGenerationMessages({
			mock: { method: MethodEnum.GET, url: '/api/items', status: 200 },
			globalSystemPrompt: 'My custom system prompt.',
		})

		expect(system.content).toContain('My custom system prompt.')
		expect(system.content).toMatch(/single valid JSON document/i)
		expect(system.content).toMatch(/Additional instructions:/)
	})

	it('puts the target endpoint description into the user message', () => {
		const [, user] = buildMockGenerationMessages({
			mock: { method: MethodEnum.POST, url: '/api/items', status: 201 },
		})

		expect(user.content).toMatch(/POST \/api\/items → HTTP 201/)
	})

	it('embeds the OpenAPI response JSON Schema when given', () => {
		const [, user] = buildMockGenerationMessages({
			mock: { method: MethodEnum.GET, url: '/api/items', status: 200 },
			openApiOperation: {
				type: 'object',
				properties: { items: { type: 'array' } },
			},
		})

		expect(user.content).toMatch(/Response JSON Schema from OpenAPI/i)
		expect(user.content).toMatch(/"type": "object"/)
	})

	it('truncates oversized OpenAPI fragments', () => {
		const big = { huge: 'x'.repeat(20_000) }
		const [, user] = buildMockGenerationMessages({
			mock: { method: MethodEnum.GET, url: '/api/items', status: 200 },
			openApiOperation: big,
		})

		expect(user.content).toMatch(/\[truncated\]/)
		expect(user.content.length).toBeLessThan(10_000)
	})

	it('is a pure function: same input, same output', () => {
		const input = {
			mock: { method: MethodEnum.GET, url: '/api/items', status: 200 },
		}
		const a = buildMockGenerationMessages(input)
		const b = buildMockGenerationMessages(input)
		expect(a).toEqual(b)
	})

	describe('generation modes', () => {
		const sampleJson = JSON.stringify({ data: { cargoes: [{ barcode: '123' }], total: 1 } })

		it('enrich mode: JSON without a schema keeps structure and keys', () => {
			const [system, user] = buildMockGenerationMessages({
				mock: { method: MethodEnum.GET, url: '/api/items', status: 200, response: sampleJson },
			})

			expect(system.content).toMatch(/WITHOUT changing the structure/)
			expect(system.content).toMatch(/do not add new keys/)
			expect(user.content).toMatch(/Existing JSON response/)
			expect(user.content).toMatch(/"barcode"/)
		})

		it('enrich mode: reuses real image links', () => {
			const [system] = buildMockGenerationMessages({
				mock: { method: MethodEnum.GET, url: '/api/items', status: 200, response: sampleJson },
			})

			expect(system.content).toMatch(/image links/)
			expect(system.content).toMatch(/copy it VERBATIM/)
		})

		it('schema mode: a schema without JSON generates strictly by the schema', () => {
			const [system] = buildMockGenerationMessages({
				mock: { method: MethodEnum.GET, url: '/api/items', status: 200 },
				openApiOperation: { type: 'object', properties: { items: { type: 'array' } } },
			})

			expect(system.content).toMatch(/strictly by the provided JSON Schema/)
			expect(system.content).toMatch(/go through different enum options/)
			expect(system.content).not.toMatch(/copy it VERBATIM/)
		})

		it('hybrid mode: JSON is the reference, the schema wins', () => {
			const [system, user] = buildMockGenerationMessages({
				mock: { method: MethodEnum.GET, url: '/api/items', status: 200, response: sampleJson },
				openApiOperation: { type: 'object', properties: { data: { type: 'object' } } },
			})

			expect(system.content).toMatch(/The schema is the source of truth/)
			expect(system.content).toMatch(/fix the type to match the schema/)
			expect(system.content).toMatch(/copy it VERBATIM/)
			expect(user.content).toMatch(/Existing JSON response/)
			expect(user.content).toMatch(/Response JSON Schema/)
		})

		it('sets an adaptive array size based on element size', () => {
			const [system] = buildMockGenerationMessages({
				mock: { method: MethodEnum.GET, url: '/api/items', status: 200 },
			})

			expect(system.content).toMatch(/15 elements/)
			expect(system.content).toMatch(/huge.*1-2/)
			expect(system.content).toMatch(/"lead" array/)
			expect(system.content).toMatch(/must ALWAYS have at least one array with several elements/)
			expect(system.content).toMatch(/Do NOT multiply the other arrays/)
		})

		it('defaults to happy: a positive response', () => {
			const [system] = buildMockGenerationMessages({
				mock: { method: MethodEnum.GET, url: '/api/items', status: 200 },
			})

			expect(system.content).toMatch(/successful \(positive\) response/)
			expect(system.content).not.toMatch(/Corner-case data mode/)
			expect(system.content).not.toMatch(/negative scenario/)
		})

		it('explicit happy mode: a positive response, error branches stay empty', () => {
			const [system] = buildMockGenerationMessages({
				mock: { method: MethodEnum.GET, url: '/api/items', status: 200 },
				mode: 'happy',
			})

			expect(system.content).toMatch(/successful \(positive\) response/)
			expect(system.content).toMatch(/This is a SUCCESSFUL response, NOT an error/)
		})

		it('happy and corner do not fill error branches even when the schema describes them', () => {
			const schemaWithError = {
				type: 'object',
				properties: { data: { type: 'object' }, error: { type: 'object' } },
			}
			const [happySystem] = buildMockGenerationMessages({
				mock: { method: MethodEnum.GET, url: '/api/items', status: 200 },
				mode: 'happy',
				openApiOperation: schemaWithError,
			})
			const [cornerSystem] = buildMockGenerationMessages({
				mock: { method: MethodEnum.GET, url: '/api/items', status: 200 },
				mode: 'corner',
				openApiOperation: schemaWithError,
			})

			expect(happySystem.content).toMatch(/NOT in the required list \(optional\) — do NOT output this key AT ALL/)
			expect(happySystem.content).toMatch(/do not even write error: null or error: \{\}/)
			expect(happySystem.content).toMatch(/is in required \(mandatory\) — output it EMPTY/)
			expect(cornerSystem.content).toMatch(/do NOT output this key AT ALL/)
		})

		it('error mode: fills only the error and leaves data empty', () => {
			const [system] = buildMockGenerationMessages({
				mock: { method: MethodEnum.GET, url: '/api/items', status: 404 },
				mode: 'error',
				openApiOperation: { type: 'object', properties: { error: { type: 'object' } } },
			})

			expect(system.content).toMatch(/Fill ONLY the error fields/)
			expect(system.content).toMatch(/If such a field is NOT required by the schema — leave it out of the output/)
			expect(system.content).toMatch(/If it is required — keep it empty/)
		})

		it('error mode: the error text follows the HTTP status meaning', () => {
			const [notFound] = buildMockGenerationMessages({
				mock: { method: MethodEnum.GET, url: '/api/items', status: 404 },
				mode: 'error',
			})
			const [conflict] = buildMockGenerationMessages({
				mock: { method: MethodEnum.POST, url: '/api/items', status: 409 },
				mode: 'error',
			})

			expect(notFound.content).toMatch(/Status 404 means: resource not found/)
			expect(conflict.content).toMatch(/Status 409 means: state conflict/)
		})

		it('corner mode: test design techniques, per-type mutation across all fields, no null', () => {
			const [system] = buildMockGenerationMessages({
				mock: { method: MethodEnum.GET, url: '/api/items', status: 200, response: sampleJson },
				mode: 'corner',
			})

			expect(system.content).toMatch(/Corner-case data mode/)
			expect(system.content).toMatch(/pairwise testing/)
			expect(system.content).toMatch(/ONE problematic value type TO ALL matching fields AT ONCE/)
			expect(system.content).toMatch(/Do NOT use null/)
			expect(system.content).toMatch(/one fully valid object for reference/)
			expect(system.content).toMatch(/No more than 8 elements/)
			expect(system.content).toMatch(/long string.*ONLY ONE string field per element/)
		})

		it('corner mode with a schema: keeps types, edge cases in free strings, cycles through enum', () => {
			const [system] = buildMockGenerationMessages({
				mock: { method: MethodEnum.GET, url: '/api/items', status: 200 },
				mode: 'corner',
				openApiOperation: { type: 'object', properties: { status: { enum: ['A', 'B'] } } },
			})

			expect(system.content).toMatch(/Fill ALL fields described in the schema/)
			expect(system.content).toMatch(/ROOT STRUCTURE strictly by the schema/)
			expect(system.content).toMatch(/STRICTLY follow the schema types/)
			expect(system.content).toMatch(/Free string fields/)
			expect(system.content).toMatch(/ENUM VARIETY MATTERS MORE/)
		})

		it('happy with a schema: stronger enum rule and the enum catalogue attached', () => {
			const [system, user] = buildMockGenerationMessages({
				mock: { method: MethodEnum.GET, url: '/api/items', status: 200 },
				mode: 'happy',
				openApiOperation: { type: 'object', properties: { status: { enum: ['A', 'B', 'C'] } } },
			})

			expect(system.content).toMatch(/ENUM VARIETY MATTERS MORE/)
			expect(user.content).toMatch(/Allowed enum values/)
			expect(user.content).toMatch(/status: "A", "B", "C"/)
		})

		it('extracts enum values from nested arrays and properties', () => {
			const [, user] = buildMockGenerationMessages({
				mock: { method: MethodEnum.GET, url: '/api/items', status: 200 },
				mode: 'happy',
				openApiOperation: {
					type: 'object',
					properties: {
						data: {
							type: 'object',
							properties: {
								tasks: {
									type: 'array',
									items: { type: 'object', properties: { type: { enum: ['X', 'Y'] } } },
								},
							},
						},
					},
				},
			})

			expect(user.content).toMatch(/type: "X", "Y"/)
		})

		it('happy without a schema: no enum variety rules', () => {
			const [system] = buildMockGenerationMessages({
				mock: { method: MethodEnum.GET, url: '/api/items', status: 200 },
				mode: 'happy',
			})

			expect(system.content).not.toMatch(/ENUM VARIETY MATTERS MORE/)
		})

		it('error mode: an error response from the error branch of the schema', () => {
			const [system] = buildMockGenerationMessages({
				mock: { method: MethodEnum.GET, url: '/api/items', status: 404 },
				mode: 'error',
				openApiOperation: { type: 'object', properties: { error: { type: 'object' } } },
			})

			expect(system.content).toMatch(/negative scenario/)
			expect(system.content).toMatch(/error branch of the schema/)
		})

		it('error mode: no array multiplication rules', () => {
			const [system] = buildMockGenerationMessages({
				mock: { method: MethodEnum.GET, url: '/api/items', status: 404 },
				mode: 'error',
				openApiOperation: { type: 'object', properties: { error: { type: 'object' } } },
			})

			expect(system.content).not.toMatch(/lead/)
			expect(system.content).not.toMatch(/15 elements/)
		})
	})

	describe('system prompt format and contents', () => {
		it('rules are a numbered list, not one paragraph', () => {
			const [system] = buildMockGenerationMessages({
				mock: { method: MethodEnum.GET, url: '/api/items', status: 200 },
			})

			expect(system.content).toMatch(/Generation rules \(follow EACH one\):/)
			expect(system.content).toMatch(/\n1\. /)
			expect(system.content).toMatch(/\n2\. /)
		})

		it('no enum rule when the schema has no enum', () => {
			const [system] = buildMockGenerationMessages({
				mock: { method: MethodEnum.GET, url: '/api/items', status: 200 },
				mode: 'happy',
				openApiOperation: { type: 'object', properties: { name: { type: 'string' } } },
			})

			expect(system.content).not.toMatch(/ENUM VARIETY MATTERS MORE/)
		})

		it('compactRetry asks for a compact response', () => {
			const [system] = buildMockGenerationMessages({
				mock: { method: MethodEnum.GET, url: '/api/items', status: 200 },
				compactRetry: true,
			})

			expect(system.content).toMatch(/cut off by the response length limit/)
			expect(system.content).toMatch(/half as many elements/)
		})

		it('array size by mode: happy scales up to 15, corner caps at 8', () => {
			const happy = buildMockGenerationMessages({
				mock: { method: MethodEnum.GET, url: '/api/items', status: 200 },
				mode: 'happy',
			})[0]
			const corner = buildMockGenerationMessages({
				mock: { method: MethodEnum.GET, url: '/api/items', status: 200 },
				mode: 'corner',
			})[0]

			expect(happy.content).toMatch(/15 elements/)
			expect(happy.content).not.toMatch(/No more than 8 elements/)
			expect(corner.content).toMatch(/No more than 8 elements/)
			expect(corner.content).not.toMatch(/15 elements/)
		})
	})

	describe('schema noise cleanup', () => {
		it('removes description and example from the schema fragment', () => {
			const [, user] = buildMockGenerationMessages({
				mock: { method: MethodEnum.GET, url: '/api/items', status: 200 },
				openApiOperation: {
					type: 'object',
					description: 'NOISE-SCHEMA-DESCRIPTION',
					example: { name: 'NOISE-EXAMPLE' },
					properties: {
						name: { type: 'string', description: 'NOISE-FIELD-DESCRIPTION' },
					},
				},
			})

			expect(user.content).not.toMatch(/NOISE-SCHEMA-DESCRIPTION/)
			expect(user.content).not.toMatch(/NOISE-EXAMPLE/)
			expect(user.content).not.toMatch(/NOISE-FIELD-DESCRIPTION/)
			expect(user.content).toMatch(/"name"/)
		})

		it('keeps a property named description inside properties', () => {
			const [, user] = buildMockGenerationMessages({
				mock: { method: MethodEnum.GET, url: '/api/items', status: 200 },
				openApiOperation: {
					type: 'object',
					properties: {
						description: { type: 'string' },
					},
				},
			})

			expect(user.content).toMatch(/"description"/)
		})
	})
})
