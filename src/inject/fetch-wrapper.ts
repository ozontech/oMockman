/** fetch wrapper: serves mocks resolved over the bridge and reports logs. */

import { buildLog, markPatchedRequest } from '@/inject'
import type { LogPatch } from '@/inject'
import { isLoggingEnabled, resolveMock, sendLog, takeLogSlot } from '@/inject/bridge'
import { buildHeadersMap } from '@/inject/http-utils'
import type { LimitedBody } from '@/inject/limits'
import {
	binaryResponseForLog,
	isBinaryContentType,
	isEventStream,
	limitBody,
	markRequestBody,
	MAX_LOGGED_BODY_BYTES,
	readBodyLimited,
	responseForLog,
	tooLargeResponseForLog,
} from '@/inject/limits'
import { networkIndicator } from '@/inject/network-indicator'
import { registerNativeFetch } from '@/inject/sender'
import type { IBridgeMockAnswer } from '@/interface/bridge'
import type { IRequestPatch } from '@/interface/mock'
import { genId } from '@/services/helper'
import { applyRequestPatch, canPatchMethod } from '@/services/request-patch'

type GlobalWithFetch = typeof globalThis & {
	fetch?: typeof fetch
	__MOCKMAN_FETCH_WRAPPED__?: boolean
}

type LogResponse = ReturnType<typeof responseForLog>

const NULL_BODY_STATUSES = new Set([204, 205, 304])
const EMPTY_BODY: LimitedBody = { text: '', tooLarge: false }

/**
 * `new Response` throws for a null-body status with a body, for a status outside 200-599 and for
 * a bad header. A mock is served anyway: the status is set on the instance and bad headers are dropped.
 */
function buildMockResponse(mock: IBridgeMockAnswer): Response {
	const status = mock.status ?? 200
	const headers = new Headers()
	for (const [name, value] of Object.entries(buildHeadersMap(mock.headers))) {
		try {
			headers.append(name, value)
		} catch {
			void 0
		}
	}
	const inRange = status >= 200 && status <= 599
	const body = NULL_BODY_STATUSES.has(status) || !inRange ? null : (mock.response ?? '')
	const response = new Response(body, { status: inRange ? status : 200, headers })
	if (!inRange) {
		Object.defineProperty(response, 'status', { configurable: true, get: () => status })
		Object.defineProperty(response, 'ok', { configurable: true, get: () => false })
	}
	return response
}

const abortReason = (signal: AbortSignal): unknown =>
	signal.reason ?? new DOMException('The operation was aborted.', 'AbortError')

/** A delayed mock rejects on abort the way a slow real request would. */
function waitForDelay(delayMs: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal.aborted) {
			reject(abortReason(signal))
			return
		}
		const onAbort = () => {
			clearTimeout(timer)
			reject(abortReason(signal))
		}
		const timer = setTimeout(() => {
			signal.removeEventListener('abort', onAbort)
			resolve()
		}, delayMs)
		signal.addEventListener('abort', onAbort, { once: true })
	})
}

/** Clones synchronously: once the request is sent its body is used up. */
function readRequestBody(request: Request): Promise<LimitedBody> {
	try {
		return readBodyLimited(request.clone().body)
	} catch {
		return Promise.resolve(EMPTY_BODY)
	}
}

/**
 * The page's request with its body patched, or null to send it unchanged: a GET cannot carry a
 * body, and a merge needs the whole body to be JSON.
 */
async function patchRequest(
	request: Request,
	patch: IRequestPatch,
): Promise<{ request: Request; body: string; original: LimitedBody } | null> {
	if (!canPatchMethod(request.method)) return null
	const original = await readRequestBody(request)
	if (original.tooLarge && patch.mode === 'merge') return null
	const body = applyRequestPatch(original.text, patch)
	if (body === null) return null
	try {
		return { request: new Request(request, { body }), body, original }
	} catch {
		return null
	}
}

/** The real response with mock headers on top. Its clones keep them, since the page may read a clone. */
function withHeaders(response: Response, overlay: Array<{ name: string; value: string }>): Response {
	const headers = new Headers(response.headers)
	for (const { name, value } of overlay) {
		try {
			headers.set(name, value)
		} catch {
			void 0
		}
	}
	const nativeClone = response.clone.bind(response)
	Object.defineProperty(response, 'headers', { configurable: true, get: () => headers })
	Object.defineProperty(response, 'clone', {
		configurable: true,
		writable: true,
		value: () => withHeaders(nativeClone(), overlay),
	})
	return response
}

/** Never awaited by the page: the response is returned first, its copy is read for the log after. */
function readResponseForLog(response: Response): Promise<LogResponse | undefined> {
	if (response.type === 'opaque' || response.type === 'opaqueredirect') return Promise.resolve(undefined)

	const { status } = response
	const headers = Array.from(response.headers.entries()).map(([name, value]) => ({ name, value }))
	const contentType = response.headers.get('content-type')
	const declared = Number(response.headers.get('content-length')) || 0

	if (isBinaryContentType(contentType)) return Promise.resolve(binaryResponseForLog(status, headers, declared || undefined))
	if (isEventStream(contentType)) return Promise.resolve(responseForLog(status, '', headers))
	if (declared > MAX_LOGGED_BODY_BYTES) return Promise.resolve(tooLargeResponseForLog(status, headers, declared))

	let copy: Response
	try {
		copy = response.clone()
	} catch {
		return Promise.resolve(responseForLog(status, '', headers))
	}
	return readBodyLimited(copy.body).then((body) => (body.tooLarge
		? tooLargeResponseForLog(status, headers, declared || undefined)
		: responseForLog(status, body.text, headers)))
}

function reportLog(
	id: string,
	request: Request,
	requestBody: Promise<LimitedBody>,
	response: Promise<LogResponse | undefined>,
	mocked: boolean,
	patch?: LogPatch,
): void {
	Promise.all([requestBody, response])
		.then(([body, logResponse]) => {
			const logMessage = buildLog(
				{
					url: request.url.toString(),
					method: request.method,
					headers: Object.fromEntries(request.headers.entries()),
					body: body.text,
					mockmanId: id,
				},
				logResponse,
				mocked,
			)
			markRequestBody(logMessage, body)
			if (patch) markPatchedRequest(logMessage, patch)
			sendLog(id, logMessage)
		})
		.catch(() => undefined)
}

export function applyFetchWrapper(): void {
	try {
		const g = globalThis as GlobalWithFetch
		if (g.__MOCKMAN_FETCH_WRAPPED__) return
		const originalFetch: typeof fetch | undefined = typeof g.fetch === 'function' ? g.fetch.bind(g) : undefined
		if (!originalFetch) return
		g.__MOCKMAN_FETCH_WRAPPED__ = true
		registerNativeFetch(originalFetch)
		g.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
			let request: Request
			try {
				request = new Request(input as RequestInfo, init)
			} catch {
				return originalFetch(input as RequestInfo | URL, init)
			}

			const id = genId()
			const mock = await resolveMock(request.method, request.url, id).catch(() => null)
			const logging = takeLogSlot(request.method, request.url)
			const delayMs = typeof mock?.delay === 'number' && mock.delay > 0 ? mock.delay : 0
			// The page's own signal: the copy on the Request only follows it.
			const signal = init?.signal ?? request.signal

			if (mock?.network) {
				const { requestPatch, responseHeaders } = mock.network
				const patched = requestPatch ? await patchRequest(request, requestPatch) : null
				const outgoing = patched?.request ?? request
				const sentBody = !logging
					? Promise.resolve(EMPTY_BODY)
					: patched
						? Promise.resolve(limitBody(patched.body))
						: readRequestBody(request)
				if (delayMs > 0) await waitForDelay(delayMs, signal)

				const real = await originalFetch(outgoing)
				const headersPatched = Boolean(responseHeaders?.length)
				const response = headersPatched ? withHeaders(real, responseHeaders ?? []) : real
				if (logging && isLoggingEnabled()) {
					const patch = patched || headersPatched
						? { originalBody: patched?.original, headers: headersPatched }
						: undefined
					reportLog(id, outgoing, sentBody, readResponseForLog(response), false, patch)
				}
				return response
			}

			const requestBody = logging ? readRequestBody(request) : Promise.resolve(EMPTY_BODY)

			if (mock) {
				const response = buildMockResponse(mock)
				if (delayMs > 0) await waitForDelay(delayMs, signal)
				else if (signal.aborted) throw abortReason(signal)

				if (logging) {
					reportLog(
						id,
						request,
						requestBody,
						Promise.resolve(responseForLog(mock.status ?? 200, mock.response ?? '', mock.headers)),
						true,
					)
				}
				try {
					networkIndicator.addMockedRequest(request.url.toString(), request.method)
				} catch {
					void 0
				}
				return response
			}

			const response = await originalFetch(request)
			if (logging && isLoggingEnabled()) reportLog(id, request, requestBody, readResponseForLog(response), false)
			return response
		}
	} catch {
		void 0
	}
}
