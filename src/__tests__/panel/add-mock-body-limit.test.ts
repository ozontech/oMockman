import { describe, expect, it } from 'vitest'

import { MethodEnum } from '@/interface/network'
import { buildMockPayload, isAddMockFormValid } from '@/panel/app/mocks/addMock/utils'
import { MAX_BODY_BYTES } from '@/services/body-limits'

const base = { name: 'users', url: 'https://example.com/api/users', status: 200, method: MethodEnum.GET }

describe('mock form body limit', () => {
	it('accepts a normal body', () => {
		expect(isAddMockFormValid({ ...base, response: '{"a":1}' })).toBe(true)
	})

	it('refuses a body over the limit', () => {
		const huge = JSON.stringify({ data: 'x'.repeat(MAX_BODY_BYTES) })
		expect(isAddMockFormValid({ ...base, response: huge })).toBe(false)
	})

	it('refuses a draft whose body was not captured until a body is pasted', () => {
		expect(isAddMockFormValid({ ...base, response: '', responseTooLargeBytes: MAX_BODY_BYTES + 1 })).toBe(false)
		expect(isAddMockFormValid({ ...base, response: '{}', responseTooLargeBytes: MAX_BODY_BYTES + 1 })).toBe(true)
	})

	it('never persists the draft-only marker', () => {
		const payload = buildMockPayload({ ...base, id: 'm-1', response: '{}', responseTooLargeBytes: 123 })
		expect('responseTooLargeBytes' in payload).toBe(false)
	})
})
