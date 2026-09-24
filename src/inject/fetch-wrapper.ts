/** fetch wrapper: serves mocks resolved over the bridge and reports logs. */

import type { RequestIdManager } from '@/inject'
import { buildLog } from '@/inject'
import { resolveMock, sendLog } from '@/inject/bridge'
import { buildHeadersMap, scheduleComplete } from '@/inject/http-utils'
import { limitBody, markRequestBody, responseForLog } from '@/inject/limits'
import { networkIndicator } from '@/inject/network-indicator'
import { genId } from '@/services/helper'

type GlobalWithFetch = typeof globalThis & {
	fetch?: typeof fetch
	__MOCKMAN_FETCH_WRAPPED__?: boolean
}

export function applyFetchWrapper(ids: RequestIdManager): void {
	try {
		const g = globalThis as GlobalWithFetch
		if (g.__MOCKMAN_FETCH_WRAPPED__) return
		const originalFetch: typeof fetch | undefined = typeof g.fetch === 'function' ? g.fetch.bind(g) : undefined
		if (!originalFetch) return
		g.__MOCKMAN_FETCH_WRAPPED__ = true
		g.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
			try {
				const request = new Request(input as RequestInfo, init)
				const id = genId()
				ids.setRequestId(request, id)
				const mock = await resolveMock(request.method, request.url)

				try {
					request
						.clone()
						.text()
						.then((body) => ids.storeBody(request, id, body))
						.catch(() => ids.storeBody(request, id, ''))
				} catch {
					ids.storeBody(request, id, '')
				}

				if (mock) {
					const headersObj = buildHeadersMap(mock.headers)
					const statusCode = mock.status ?? 200
					const delayMs = typeof mock.delay === 'number' && mock.delay > 0 ? mock.delay : 0

					const buildResponse = () => new Response(mock.response ?? '', { status: statusCode, headers: headersObj })
					const response = delayMs > 0
						? await new Promise<Response>((resolve) => scheduleComplete(delayMs, () => resolve(buildResponse())))
						: buildResponse()

					const requestBody = limitBody(ids.getBodyById(id) ?? '')
					const logMessage = buildLog(
						{
							url: request.url.toString(),
							method: request.method,
							headers: Object.fromEntries(request.headers.entries()),
							body: requestBody.text,
							mockmanId: id,
						},
						responseForLog(statusCode, mock.response ?? '', mock.headers),
					)
					markRequestBody(logMessage, requestBody)
					sendLog(id, logMessage)
					ids.markLoggedAtRequest(id)
					try {
						networkIndicator.addMockedRequest(request.url.toString(), request.method)
					} catch {
						void 0
					}

					return response
				}

				const resp = await originalFetch(request)
				let text = ''
				try {
					if (resp.type !== 'opaque') {
						text = await resp.clone().text()
					}
				} catch {
					void 0
				}
				const fallbackHeaders = Array.from(resp.headers.entries()).map(([name, value]) => ({ name, value }))
				const requestBody = limitBody(ids.getBodyById(id) ?? '')
				const logMessage = buildLog(
					{
						url: request.url.toString(),
						method: request.method,
						headers: Object.fromEntries(request.headers.entries()),
						body: requestBody.text,
						mockmanId: id,
					},
					resp.type === 'opaque' ? undefined : responseForLog(resp.status, text, fallbackHeaders),
				)
				markRequestBody(logMessage, requestBody)
				sendLog(id, logMessage)
				ids.cleanup(request, id)
				ids.markLoggedAtResponse(id)
				return resp
			} catch {
				return originalFetch(input as RequestInfo | URL, init)
			}
		}
	} catch {
		void 0
	}
}
