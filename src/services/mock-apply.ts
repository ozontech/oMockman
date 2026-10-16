/** Which parts of a request and response a mock changes. */

import type { IMockApply, IMockResponseRaw } from '@/interface/mock'

export type MockApplyPart = keyof IMockApply

export const RESPONSE_MOCK_APPLY: IMockApply = { responseBody: true, responseHeaders: true, requestBody: false }
const REQUEST_PATCH_APPLY: IMockApply = { responseBody: false, responseHeaders: false, requestBody: true }

export function coerceMockApply(value: unknown): IMockApply | undefined {
	if (typeof value !== 'object' || value === null) return undefined
	const { responseBody, responseHeaders, requestBody } = value as Record<string, unknown>
	if (typeof responseBody !== 'boolean' || typeof responseHeaders !== 'boolean' || typeof requestBody !== 'boolean') {
		return undefined
	}
	if (requestBody) return { ...REQUEST_PATCH_APPLY }
	return { responseBody, responseHeaders, requestBody }
}

/** Mocks saved before `apply` mocked the whole response, or only patched the request when they had a patch. */
export function resolveMockApply(mock: Pick<IMockResponseRaw, 'apply' | 'requestPatch'>): IMockApply {
	const apply = coerceMockApply(mock.apply)
	if (apply) return apply
	return { ...(mock.requestPatch ? REQUEST_PATCH_APPLY : RESPONSE_MOCK_APPLY) }
}

/** Turning on the request body turns off the response, and the other way round. */
export function toggleMockApply(apply: IMockApply, part: MockApplyPart, on: boolean): IMockApply {
	if (!on) return { ...apply, [part]: false }
	if (part === 'requestBody') return { ...REQUEST_PATCH_APPLY }
	return { ...apply, requestBody: false, [part]: true }
}

export function appliesAnything(apply: IMockApply): boolean {
	return apply.responseBody || apply.responseHeaders || apply.requestBody
}
