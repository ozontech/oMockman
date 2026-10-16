import type { ILog, IMockResponseRaw } from '@/interface/mock'
import { MethodEnum } from '@/interface/network'
import { RESPONSE_MOCK_APPLY } from '@/services/mock-apply'

const getEndpointName = (rawUrl: string | undefined): string => {
	const raw = String(rawUrl ?? '').trim()
	if (!raw) return ''
	const path = raw.split('?')[0].split('#')[0]
	const segments = path
		.replace(/^[a-z]+:\/\//i, '')
		.split('/')
		.filter(Boolean)
		.filter((seg, idx) => !(idx === 0 && seg.includes('.')))
	return segments.join('-')
}

export const getMockFromLog = (log: ILog): IMockResponseRaw => ({
	active: true,
	createdOn: Date.now(),
	name: getEndpointName(log.request?.url) || undefined,
	method: (log.request?.method as MethodEnum) ?? MethodEnum.GET,
	url: log.request?.url ?? '/some-url',
	status: log.response?.status ?? 200,
	response: log.response?.tooLarge ? '' : (log.response?.response ?? ''),
	responseTooLargeBytes: log.response?.tooLarge ? (log.response.size ?? 0) : undefined,
	delay: undefined,
	description: '',
	headers: log.response?.headers ?? [],
	apply: { ...RESPONSE_MOCK_APPLY },
	requestPatch: log.request?.originalBody ?? log.request?.body
		? { mode: 'replace', body: log.request?.originalBody ?? log.request?.body ?? '' }
		: undefined,
})
