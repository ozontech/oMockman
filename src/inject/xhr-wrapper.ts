/**
 * XHR wrapper: serves mocks resolved over the bridge and reports logs.
 * Synchronous XHR cannot wait for the bridge, so it is never mocked.
 */

import { buildLog, markPatchedRequest } from '@/inject'
import type { LogPatch } from '@/inject'
import type { IBridgeMockAnswer } from '@/interface/bridge'
import { isLoggingEnabled, resolveMock, sendLog, takeLogSlot } from '@/inject/bridge'
import { buildHeadersMap, parseAllResponseHeaders } from '@/inject/http-utils'
import type { HeadersMap } from '@/inject/http-utils'
import {
	binaryResponseForLog,
	limitBody,
	markRequestBody,
	MAX_LOGGED_BODY_BYTES,
	responseForLog,
	tooLargeResponseForLog,
} from '@/inject/limits'
import { networkIndicator } from '@/inject/network-indicator'
import type { XhrMetadata } from '@/interface/xhr'
import { genId } from '@/services/helper'
import { applyRequestPatch, canPatchMethod } from '@/services/request-patch'

/** A send that is still ours: waiting for the bridge or serving a mock. Gone once it reaches the network. */
type PendingSend = {
	finished: boolean
	timer?: ReturnType<typeof setTimeout>
}

type MockmanXhr = XMLHttpRequest & {
	__mm?: XhrMetadata
	__mmPending?: PendingSend
	__mmOverrides?: string[]
	/** The send the log listener belongs to: open() drops a native request without loadend. */
	__mmSendId?: string
}

type LogResponse = ReturnType<typeof responseForLog>

const STATUS_TEXT: Record<number, string> = {
	200: 'OK',
	201: 'Created',
	202: 'Accepted',
	204: 'No Content',
	301: 'Moved Permanently',
	302: 'Found',
	304: 'Not Modified',
	400: 'Bad Request',
	401: 'Unauthorized',
	403: 'Forbidden',
	404: 'Not Found',
	409: 'Conflict',
	422: 'Unprocessable Entity',
	429: 'Too Many Requests',
	500: 'Internal Server Error',
	502: 'Bad Gateway',
	503: 'Service Unavailable',
	504: 'Gateway Timeout',
}

/** Shadows native members on this instance only; `open` removes them so a reused XHR is native again. */
function override(
	xhr: MockmanXhr,
	getters: Record<string, () => unknown>,
	methods: Record<string, (...args: never[]) => unknown> = {},
): void {
	const names = xhr.__mmOverrides ?? (xhr.__mmOverrides = [])
	for (const [name, get] of Object.entries(getters)) {
		Object.defineProperty(xhr, name, { configurable: true, get })
		if (!names.includes(name)) names.push(name)
	}
	for (const [name, value] of Object.entries(methods)) {
		Object.defineProperty(xhr, name, { configurable: true, writable: true, value })
		if (!names.includes(name)) names.push(name)
	}
}

function restoreNative(xhr: MockmanXhr): void {
	for (const name of xhr.__mmOverrides ?? []) {
		delete (xhr as unknown as Record<string, unknown>)[name]
	}
	xhr.__mmOverrides = undefined
}

function dispatch(xhr: XMLHttpRequest, event: Event): void {
	try {
		xhr.dispatchEvent(event)
	} catch {
		void 0
	}
}

function progressEvent(name: string, size: number): Event {
	return typeof ProgressEvent === 'function'
		? new ProgressEvent(name, { lengthComputable: size > 0, loaded: size, total: size })
		: new Event(name)
}

function findHeader(headers: HeadersMap, name: string): string | undefined {
	const expected = name.toLowerCase()
	const matched = Object.keys(headers).find((headerName) => headerName.toLowerCase() === expected)
	return matched === undefined ? undefined : headers[matched]
}

/** What `xhr.response` holds for the mocked text, by the responseType the page asked for. */
function mockResponseValue(responseType: XMLHttpRequestResponseType, text: string, contentType: string): unknown {
	try {
		switch (responseType) {
			case 'json':
				return text ? JSON.parse(text) : null
			case 'blob':
				return new Blob([text], { type: contentType })
			case 'arraybuffer':
				return new TextEncoder().encode(text).buffer
			case 'document':
				return new DOMParser().parseFromString(text, contentType.includes('xml') ? 'application/xml' : 'text/html')
			default:
				return text
		}
	} catch {
		return null
	}
}

function declaredLength(xhr: XMLHttpRequest): number {
	try {
		const value = Number(xhr.getResponseHeader('content-length'))
		return Number.isFinite(value) && value > 0 ? value : 0
	} catch {
		return 0
	}
}

/**
 * Only '' and 'text' expose responseText: reading it for any other responseType throws, and a
 * throw in our listener lands in the page's window.onerror. Binary bodies are never read.
 */
function realResponseForLog(xhr: XMLHttpRequest, status: number, headers: LogResponse['headers']): LogResponse {
	const responseType = xhr.responseType
	if (responseType === '' || responseType === 'text') {
		return responseForLog(status, xhr.responseText, headers)
	}
	if (responseType === 'json') {
		const size = declaredLength(xhr)
		if (size > MAX_LOGGED_BODY_BYTES) return tooLargeResponseForLog(status, headers, size)
		const value: unknown = xhr.response
		return responseForLog(status, value == null ? '' : JSON.stringify(value), headers)
	}
	const value: unknown = xhr.response
	const size = value instanceof Blob
		? value.size
		: value instanceof ArrayBuffer
			? value.byteLength
			: declaredLength(xhr)
	return binaryResponseForLog(status, headers, size || undefined)
}

export function applyXhrWrapper(): void {
	try {
		const g = globalThis as unknown as { XMLHttpRequest?: typeof XMLHttpRequest; __MOCKMAN_XHR_WRAPPED__?: boolean }
		if (g.__MOCKMAN_XHR_WRAPPED__) return
		const XHR = g.XMLHttpRequest
		if (!XHR) return
		g.__MOCKMAN_XHR_WRAPPED__ = true

		const origOpen = XHR.prototype.open
		const origSend = XHR.prototype.send
		const origSetHeader = XHR.prototype.setRequestHeader
		const origAbort = XHR.prototype.abort
		const origGetAllHeaders = XHR.prototype.getAllResponseHeaders
		const origGetHeader = XHR.prototype.getResponseHeader

		/** Mock headers on top of the real ones, once the real ones have arrived. */
		const overlayHeaders = (xhr: MockmanXhr, overlay: Array<{ name: string; value: string }>): void => {
			const names = new Set(overlay.map(({ name }) => name.toLowerCase()))
			override(xhr, {}, {
				getAllResponseHeaders: () => {
					const native = String(origGetAllHeaders.call(xhr) ?? '')
					if (xhr.readyState < 2) return native
					const kept = parseAllResponseHeaders(native).filter(({ name }) => !names.has(name.toLowerCase()))
					return [...kept, ...overlay].map(({ name, value }) => `${name}: ${value}\r\n`).join('')
				},
				getResponseHeader: (name: string) => {
					if (xhr.readyState < 2) return origGetHeader.call(xhr, name)
					const own = overlay.find((header) => header.name.toLowerCase() === String(name || '').toLowerCase())
					return own ? own.value : origGetHeader.call(xhr, name)
				},
			})
		}

		XHR.prototype.open = function (
			this: XMLHttpRequest,
			_method: string,
			_url: string,
			_async?: boolean,
			_user?: string,
			_password?: string,
		) {
			const xhr = this as MockmanXhr
			const pending = xhr.__mmPending
			if (pending) {
				// open() aborts a send in progress, ours included.
				pending.finished = true
				if (pending.timer) clearTimeout(pending.timer)
				xhr.__mmPending = undefined
			}
			restoreNative(xhr)
			const asyncFlag = _async !== false
			xhr.__mm = {
				method: String(_method || 'GET').toUpperCase(),
				url: String(_url || ''),
				headers: {},
				async: asyncFlag,
			}
			return origOpen.call(this, _method, _url, asyncFlag, _user as string, _password as string)
		}

		XHR.prototype.setRequestHeader = function (this: XMLHttpRequest, name: string, value: string) {
			const xhr = this as MockmanXhr
			const meta = xhr.__mm ?? (xhr.__mm = { method: 'GET', url: '', headers: {} })
			meta.headers[name] = value
			return origSetHeader.call(this, name, value)
		}

		XHR.prototype.abort = function (this: XMLHttpRequest) {
			const xhr = this as MockmanXhr
			const pending = xhr.__mmPending
			if (!pending || pending.finished) return origAbort.call(this)

			pending.finished = true
			if (pending.timer) clearTimeout(pending.timer)
			xhr.__mmPending = undefined
			let readyState = 4
			override(xhr, {
				readyState: () => readyState,
				status: () => 0,
				statusText: () => '',
				responseText: () => '',
				response: () => (xhr.responseType === '' || xhr.responseType === 'text' ? '' : null),
			})
			dispatch(xhr, new Event('readystatechange'))
			dispatch(xhr, progressEvent('abort', 0))
			dispatch(xhr, progressEvent('loadend', 0))
			readyState = 0
			return undefined
		}

		XHR.prototype.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
			const xhr = this as MockmanXhr
			const id = genId()
			const meta = xhr.__mm || { method: 'GET', url: '', headers: {} }
			type SendBody = Document | XMLHttpRequestBodyInit | null | undefined
			const requestBodyForLog = (sent: SendBody = body) => limitBody(typeof sent === 'string' ? sent : '')

			/** `patch` is set when a mock changed the request or the response headers. */
			const logRealResponse = (sent: SendBody = body, patch?: LogPatch): void => {
				if (!takeLogSlot(meta.method, meta.url)) return

				xhr.__mmSendId = id
				const report = () => {
					if (xhr.__mmSendId !== id || !isLoggingEnabled()) return
					try {
						const status = this.status || 0
						const readBody = status !== 0
						const headers = parseAllResponseHeaders(this.getAllResponseHeaders() || '')
						const requestBody = requestBodyForLog(sent)
						const logMessage = buildLog(
							{
								url: meta.url,
								method: meta.method,
								headers: meta.headers,
								body: requestBody.text,
								mockmanId: id,
							},
							readBody ? realResponseForLog(this, status, headers) : responseForLog(status, '', headers),
							false,
						)
						markRequestBody(logMessage, requestBody)
						if (patch) markPatchedRequest(logMessage, patch)
						sendLog(id, logMessage)
					} catch {
						void 0
					}
				}

				this.addEventListener('loadend', report, { once: true })
			}

			const applyMock = (mock: IBridgeMockAnswer, pending: PendingSend): void => {
				const headersObj = buildHeadersMap(mock.headers)
				const statusCode = mock.status ?? 200
				const responseText = String(mock.response ?? '')
				const contentType = findHeader(headersObj, 'content-type') ?? ''
				let readyState = 1
				let responseValue: { value: unknown } | undefined
				try {
					override(xhr, {
						readyState: () => readyState,
						status: () => statusCode,
						statusText: () => STATUS_TEXT[statusCode] ?? '',
						responseText: () => responseText,
						response: () => {
							responseValue ??= { value: mockResponseValue(xhr.responseType, responseText, contentType) }
							return responseValue.value
						},
						responseURL: () => {
							try {
								return new URL(meta.url, location.href).href
							} catch {
								return meta.url
							}
						},
					}, {
						getAllResponseHeaders: () => {
							const lines = Object.entries(headersObj).map(([n, v]) => `${n}: ${v}`)
							return lines.length > 0 ? `${lines.join('\r\n')}\r\n` : ''
						},
						getResponseHeader: (name: string) => findHeader(headersObj, String(name || '')) ?? null,
					})
				} catch {
					void 0
				}

				// The native order: HEADERS_RECEIVED, LOADING with progress, then DONE with load and loadend.
				const fire = () => {
					if (pending.finished) return
					pending.finished = true
					xhr.__mmPending = undefined
					const size = responseText.length
					readyState = 2
					dispatch(xhr, new Event('readystatechange'))
					readyState = 3
					dispatch(xhr, new Event('readystatechange'))
					dispatch(xhr, progressEvent('progress', size))
					readyState = 4
					dispatch(xhr, new Event('readystatechange'))
					dispatch(xhr, progressEvent('load', size))
					dispatch(xhr, progressEvent('loadend', size))
				}
				const delayMs = typeof mock.delay === 'number' && mock.delay > 0 ? mock.delay : 0
				if (delayMs > 0) pending.timer = setTimeout(fire, delayMs)
				else queueMicrotask(fire)

				if (takeLogSlot(meta.method, meta.url)) {
					const requestBody = requestBodyForLog()
					const logMessage = buildLog(
						{
							url: meta.url,
							method: meta.method,
							headers: meta.headers,
							body: requestBody.text,
							mockmanId: id,
						},
						responseForLog(
							statusCode,
							responseText,
							Object.entries(headersObj).map(([name, value]) => ({ name, value })),
						),
						true,
					)
					markRequestBody(logMessage, requestBody)
					sendLog(id, logMessage)
				}
				try {
					networkIndicator.addMockedRequest(meta.url, meta.method)
				} catch {
					void 0
				}
			}

			if (meta.async === false) {
				logRealResponse()
				return origSend.call(this, body ?? null)
			}

			const pending: PendingSend = { finished: false }
			xhr.__mmPending = pending
			let decided = false
			const sendNative = (sent: SendBody = body, patch?: LogPatch): void => {
				if (decided || pending.finished) return
				decided = true
				xhr.__mmPending = undefined
				try {
					logRealResponse(sent, patch)
					origSend.call(this, sent ?? null)
				} catch {
					void 0
				}
			}

			/** The page's body goes out unchanged when the patch does not apply: see applyRequestPatch. */
			const sendChanged = (mock: IBridgeMockAnswer): void => {
				const { requestPatch, responseHeaders } = mock.network ?? {}
				const original = typeof body === 'string' ? body : body == null ? '' : null
				const patched = !requestPatch || !canPatchMethod(meta.method) || (original === null && requestPatch.mode === 'merge')
					? null
					: applyRequestPatch(original ?? '', requestPatch)
				const headersPatched = Boolean(responseHeaders?.length)
				if (headersPatched) overlayHeaders(xhr, responseHeaders ?? [])

				const patch: LogPatch | undefined = patched !== null || headersPatched
					? { originalBody: patched !== null ? limitBody(original ?? '') : undefined, headers: headersPatched }
					: undefined
				const send = () => sendNative(patched ?? body, patch)
				const delayMs = typeof mock.delay === 'number' && mock.delay > 0 ? mock.delay : 0
				if (delayMs > 0) pending.timer = setTimeout(send, delayMs)
				else send()
			}

			resolveMock(meta.method, meta.url, id)
				.then((mock) => {
					if (mock?.network) {
						sendChanged(mock)
						return
					}
					if (mock && !decided && !pending.finished) {
						decided = true
						applyMock(mock, pending)
						return
					}
					sendNative()
				})
				.catch(sendNative)
			return undefined
		}
	} catch {
		void 0
	}
}
