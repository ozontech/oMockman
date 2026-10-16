import { safeNumberInt } from '@/services/number'
import { isJsonValid } from '@/services/json'
import type { IMockResponse, IMockResponseRaw } from '@/interface/mock'
import { MethodEnum } from '@/interface/network'
import { exceedsBodyLimit } from '@/services/body-limits'
import { coerceRequestPatch, requestPatchProblem } from '@/services/request-patch'
import { appliesAnything, resolveMockApply } from '@/services/mock-apply'

export { isJsonValid }

export function buildMockPayload(values: IMockResponseRaw): IMockResponse {
	return {
		id: values.id as string,
		name: values.name ?? '',
		url: values.url ?? '',
		openApiUrl: values.openApiUrl?.trim() ? values.openApiUrl.trim() : undefined,
		method: (values.method as MethodEnum) ?? MethodEnum.GET,
		status: safeNumberInt(String(values.status)) ?? 200,
		delay: values.delay == null ? undefined : (safeNumberInt(String(values.delay)) ?? undefined),
		active: values.active ?? true,
		response: values.response ?? '',
		headers: Array.isArray(values.headers) ? values.headers : [],
		description: values.description ?? '',
		...(typeof values.createdOn === 'number' ? { createdOn: values.createdOn } : {}),
		dynamic: values.dynamic ?? false,
		collectionId: values.collectionId ?? null,
		requestPatch: coerceRequestPatch(values.requestPatch),
		apply: resolveMockApply(values),
	}
}

/** Only the parts the mock applies are checked: a switched-off part is a draft. */
export function isAddMockFormValid(values: IMockResponseRaw): boolean {
	const apply = resolveMockApply(values)
	if (!values.name || !values.url) return false
	if (!appliesAnything(apply)) return false
	if (values.delay !== undefined && safeNumberInt(String(values.delay)) == null) return false
	if (apply.responseBody) {
		if (!values.status) return false
		if (values.responseTooLargeBytes != null && !values.response?.trim()) return false
		if (values.response && exceedsBodyLimit(values.response)) return false
		if (values.response && values.response.trim() && !isJsonValid(values.response)) return false
	}
	if (apply.responseHeaders && Array.isArray(values.headers) && values.headers.some((h) => !h.name || !h.value)) return false
	if (apply.requestBody && (!values.requestPatch || requestPatchProblem(values.requestPatch))) return false
	return true
}
