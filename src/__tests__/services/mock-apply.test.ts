import { describe, expect, it } from 'vitest'

import { appliesAnything, coerceMockApply, resolveMockApply, toggleMockApply } from '@/services/mock-apply'

const RESPONSE = { responseBody: true, responseHeaders: true, requestBody: false }
const REQUEST = { responseBody: false, responseHeaders: false, requestBody: true }

describe('services/mock-apply', () => {
	it('mocks the whole response for a mock saved before apply existed', () => {
		expect(resolveMockApply({})).toEqual(RESPONSE)
	})

	it('patches only the request for a rule saved with a patch and no apply', () => {
		expect(resolveMockApply({ requestPatch: { mode: 'merge', body: '{}' } })).toEqual(REQUEST)
	})

	it('keeps a stored apply over the legacy guess', () => {
		const apply = { responseBody: false, responseHeaders: true, requestBody: false }
		expect(resolveMockApply({ apply, requestPatch: { mode: 'replace', body: '' } })).toEqual(apply)
	})

	it('never lets a stored value mix the request body with the response', () => {
		expect(coerceMockApply({ responseBody: true, responseHeaders: true, requestBody: true })).toEqual(REQUEST)
		expect(coerceMockApply({ responseBody: 'yes', responseHeaders: true, requestBody: false })).toBeUndefined()
	})

	it('turns the response off when the request body goes on, and back', () => {
		const request = toggleMockApply(RESPONSE, 'requestBody', true)
		expect(request).toEqual(REQUEST)
		expect(toggleMockApply(request, 'responseHeaders', true)).toEqual({ responseBody: false, responseHeaders: true, requestBody: false })
	})

	it('switches response parts independently', () => {
		expect(toggleMockApply(RESPONSE, 'responseHeaders', false)).toEqual({ responseBody: true, responseHeaders: false, requestBody: false })
	})

	it('knows when nothing is on', () => {
		expect(appliesAnything({ responseBody: false, responseHeaders: false, requestBody: false })).toBe(false)
		expect(appliesAnything(REQUEST)).toBe(true)
	})
})
