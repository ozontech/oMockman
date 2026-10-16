import { describe, expect, it } from 'vitest'

import { buildMockGenerationMessages } from '@/services/ai'
import { MethodEnum } from '@/interface/network'

const mock = {
	method: MethodEnum.POST,
	url: 'https://example.com/api/orders',
	status: 200,
	response: '{"items":[{"id":1}]}',
	requestPatch: { mode: 'replace' as const, body: '{"qty":1,"status":"new"}' },
}
const schema = {
	type: 'object',
	required: ['qty'],
	properties: { qty: { type: 'integer', minimum: 1 }, status: { type: 'string', enum: ['new', 'done'] } },
}

describe('request body generation prompt', () => {
	it('works from the request body draft, not the mock response', () => {
		const [, user] = buildMockGenerationMessages({ mock, target: 'request', openApiOperation: schema })

		expect(user.content).toContain('the request body the client sends')
		expect(user.content).toContain('"qty": 1')
		expect(user.content).not.toContain('"items"')
		expect(user.content).toContain('Request body JSON Schema')
		expect(user.content).toContain('- status: "new", "done"')
	})

	it('drops the response rules that do not fit one request body', () => {
		const [system] = buildMockGenerationMessages({ mock, target: 'request', openApiOperation: schema })

		expect(system.content).toContain('ONE request body')
		expect(system.content).not.toContain('lead')
		expect(system.content).not.toContain('SUCCESSFUL response')
		expect(system.content).not.toContain('ENUM VARIETY')
	})

	it('asks for a body that breaks the schema in error mode, with no status involved', () => {
		const [system] = buildMockGenerationMessages({ mock, target: 'request', mode: 'error', openApiOperation: schema })

		expect(system.content).toContain('INVALID request body')
		expect(system.content).not.toContain('HTTP status')
	})

	it('keeps edge values inside the schema in corner mode', () => {
		const [system] = buildMockGenerationMessages({ mock, target: 'request', mode: 'corner', openApiOperation: schema })

		expect(system.content).toContain('stays VALID by the schema')
	})

	it('keeps the global and collection prompts', () => {
		const [system] = buildMockGenerationMessages({
			mock,
			target: 'request',
			globalSystemPrompt: 'Use Russian names.',
			collection: { aiPrompt: 'Warehouse 42 only.' } as never,
		})

		expect(system.content).toContain('Use Russian names.')
		expect(system.content).toContain('Warehouse 42 only.')
	})

	it('still builds the response prompt by default', () => {
		const [system, user] = buildMockGenerationMessages({ mock, openApiOperation: schema })

		expect(system.content).toContain('lead')
		expect(user.content).toContain('"items"')
	})
})
