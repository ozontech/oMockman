import { describe, expect, it } from 'vitest'

import {
	applyRequestPatch,
	canPatchMethod,
	coerceRequestPatch,
	jsonMergePatch,
	requestPatchProblem,
} from '@/services/request-patch'
import { MAX_BODY_BYTES } from '@/services/body-limits'

describe('services/request-patch', () => {
	describe('jsonMergePatch', () => {
		it('sets, removes and merges nested fields as RFC 7386 says', () => {
			const target = { a: 1, b: { c: 2, d: 3 }, e: [1, 2] }
			const patch = { a: 5, b: { c: null, x: 'new' }, e: [9] }
			expect(jsonMergePatch(target, patch)).toEqual({ a: 5, b: { d: 3, x: 'new' }, e: [9] })
		})

		it('does not change the target', () => {
			const target = { a: { b: 1 } }
			jsonMergePatch(target, { a: { b: 2 } })
			expect(target).toEqual({ a: { b: 1 } })
		})

		it('replaces a non-object target with the patched object', () => {
			expect(jsonMergePatch('text', { a: 1 })).toEqual({ a: 1 })
		})
	})

	describe('applyRequestPatch', () => {
		it('replaces the body as written', () => {
			expect(applyRequestPatch('{"a":1}', { mode: 'replace', body: 'anything' })).toBe('anything')
		})

		it('merges into a JSON object body', () => {
			const result = applyRequestPatch('{"qty":1,"sku":"A"}', { mode: 'merge', body: '{"qty":999}' })
			expect(JSON.parse(result as string)).toEqual({ qty: 999, sku: 'A' })
		})

		it('merges into an empty body as into {}', () => {
			expect(applyRequestPatch('', { mode: 'merge', body: '{"a":1}' })).toBe('{"a":1}')
		})

		it('leaves a body that is not a JSON object alone', () => {
			expect(applyRequestPatch('a=1&b=2', { mode: 'merge', body: '{"a":2}' })).toBeNull()
			expect(applyRequestPatch('[1,2]', { mode: 'merge', body: '{"a":2}' })).toBeNull()
		})

		it('does nothing with a broken merge patch', () => {
			expect(applyRequestPatch('{"a":1}', { mode: 'merge', body: '{oops' })).toBeNull()
		})
	})

	it('refuses a body on GET and HEAD only', () => {
		expect(canPatchMethod('get')).toBe(false)
		expect(canPatchMethod('HEAD')).toBe(false)
		expect(canPatchMethod('POST')).toBe(true)
		expect(canPatchMethod('PATCH')).toBe(true)
	})

	describe('requestPatchProblem', () => {
		it('wants strict JSON or nothing for replace, since it goes out as written', () => {
			expect(requestPatchProblem({ mode: 'replace', body: '[1, {"a": null}]' })).toBeNull()
			expect(requestPatchProblem({ mode: 'replace', body: '  ' })).toBeNull()
			expect(requestPatchProblem({ mode: 'replace', body: 'a=1' })).toBe('invalid_json')
			expect(requestPatchProblem({ mode: 'replace', body: '{"a":1,}' })).toBe('invalid_json')
		})

		it('wants a JSON object for merge', () => {
			expect(requestPatchProblem({ mode: 'merge', body: '{"a":1}' })).toBeNull()
			expect(requestPatchProblem({ mode: 'merge', body: '{a' })).toBe('invalid_json')
			expect(requestPatchProblem({ mode: 'merge', body: '[1]' })).toBe('not_object')
		})

		it('rejects a body over the limit', () => {
			expect(requestPatchProblem({ mode: 'replace', body: 'x'.repeat(MAX_BODY_BYTES + 1) })).toBe('too_large')
		})
	})

	it('coerces only a well-formed patch', () => {
		expect(coerceRequestPatch({ mode: 'merge', body: '{}' })).toEqual({ mode: 'merge', body: '{}' })
		expect(coerceRequestPatch({ mode: 'merge', body: '{}', extra: 1 })).toEqual({ mode: 'merge', body: '{}' })
		expect(coerceRequestPatch({ mode: 'eval', body: '{}' })).toBeUndefined()
		expect(coerceRequestPatch({ mode: 'replace', body: 1 })).toBeUndefined()
		expect(coerceRequestPatch('replace')).toBeUndefined()
		expect(coerceRequestPatch(undefined)).toBeUndefined()
	})
})
