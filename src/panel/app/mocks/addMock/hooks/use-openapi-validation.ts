import { useEffect, useRef, useState } from 'react'

import { analyzeMockResponseByOpenApi, initialOpenApiValidationState } from '../openapi-analysis'

import { safeNumberInt } from '@/services/number'
import { MethodEnum } from '@/interface/network'
import type { OpenApiValidationState } from '@/interface/openapi'

interface UseOpenApiValidationInput {
	openApiUrl?: string
	requestUrl?: string
	method?: string
	status?: number
	responseBody?: string
}

export function useOpenApiValidation(input: UseOpenApiValidationInput): OpenApiValidationState {
	const [openApiValidation, setOpenApiValidation] = useState<OpenApiValidationState>(initialOpenApiValidationState)
	const analysisRequestId = useRef(0)

	useEffect(() => {
		const specUrl = String(input.openApiUrl ?? '').trim()
		if (!specUrl) {
			setOpenApiValidation(initialOpenApiValidationState)
			return
		}

		const requestId = analysisRequestId.current + 1
		analysisRequestId.current = requestId

		setOpenApiValidation((prev) => ({
			...prev,
			status: 'loading',
			message: 'Loading OpenAPI schema…',
			enumHints: [],
			suggestionsTruncated: false,
		}))

		const timer = setTimeout(() => {
			const statusParsed = safeNumberInt(String(input.status ?? 200)) ?? 200
			const watchdog = setTimeout(() => {
				if (analysisRequestId.current !== requestId) return
				setOpenApiValidation({
					status: 'error',
					message: 'OpenAPI loading timeout. Try direct spec URL (swagger.json/openapi.json).',
					issues: [],
					suggestions: [],
					enumHints: [],
					suggestionsTruncated: false,
				})
			}, 15000)

			void analyzeMockResponseByOpenApi({
				specUrl,
				requestUrl: String(input.requestUrl ?? ''),
				method: String(input.method ?? MethodEnum.GET),
				status: statusParsed,
				responseBody: String(input.responseBody ?? ''),
			}).then((result) => {
				clearTimeout(watchdog)
				if (analysisRequestId.current !== requestId) return
				setOpenApiValidation(result)
			}).catch((error: unknown) => {
				clearTimeout(watchdog)
				if (analysisRequestId.current !== requestId) return
				setOpenApiValidation({
					status: 'error',
					message: `OpenAPI loading failed: ${(error as Error)?.message ?? 'unknown error'}`,
					issues: [],
					suggestions: [],
					enumHints: [],
					suggestionsTruncated: false,
				})
			})
		}, 450)

		return () => clearTimeout(timer)
	}, [input.openApiUrl, input.requestUrl, input.method, input.status, input.responseBody])

	return openApiValidation
}
