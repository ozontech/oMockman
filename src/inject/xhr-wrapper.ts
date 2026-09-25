/**
 * XHR wrapper: serves mocks resolved over the bridge and reports logs.
 * Synchronous XHR cannot wait for the bridge, so it is never mocked.
 */

import type { RequestIdManager } from '@/inject'
import { buildLog } from '@/inject'
import type { IBridgeMockAnswer } from '@/interface/bridge'
import { resolveMock, sendLog } from '@/inject/bridge'
import { buildHeadersMap, parseAllResponseHeaders } from '@/inject/http-utils'
import { limitBody, markRequestBody, responseForLog } from '@/inject/limits'
import { networkIndicator } from '@/inject/network-indicator'
import type { XhrMetadata } from '@/interface/xhr'
import { genId } from '@/services/helper'

export function applyXhrWrapper(_ids: RequestIdManager): void {
	try {
		void _ids
		const g = globalThis as unknown as { XMLHttpRequest?: typeof XMLHttpRequest; __MOCKMAN_XHR_WRAPPED__?: boolean }
		if (g.__MOCKMAN_XHR_WRAPPED__) return
		const XHR = g.XMLHttpRequest
		if (!XHR) return
		g.__MOCKMAN_XHR_WRAPPED__ = true

		const origOpen = XHR.prototype.open
		const origSend = XHR.prototype.send
		const origSetHeader = XHR.prototype.setRequestHeader

		XHR.prototype.open = function (
			this: XMLHttpRequest,
			_method: string,
			_url: string,
			_async?: boolean,
			_user?: string,
			_password?: string,
		) {
			const asyncFlag = _async !== false
			;(this as unknown as { __mm?: XhrMetadata }).__mm = {
				method: String(_method || 'GET'),
				url: String(_url || ''),
				headers: {},
				async: asyncFlag,
			}
			return origOpen.call(this, _method, _url, asyncFlag, _user as string, _password as string)
		}

		XHR.prototype.setRequestHeader = function (this: XMLHttpRequest, name: string, value: string) {
			const existing = (this as unknown as { __mm?: XhrMetadata }).__mm
			const meta = existing ?? ((this as unknown as { __mm?: XhrMetadata }).__mm = { method: 'GET', url: '', headers: {} })
			meta.headers[name] = value
			return origSetHeader.call(this, name, value)
		}

		XHR.prototype.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
			const id = genId()
			const meta =
				(this as unknown as { __mm?: XhrMetadata }).__mm ||
				{ method: 'GET', url: '', headers: {} }
			const requestBody = limitBody(typeof body === 'string' ? body : '')

			const logRealResponse = (): void => {
				if ((this as unknown as { __mmLogged?: boolean }).__mmLogged) return
				;(this as unknown as { __mmLogged?: boolean }).__mmLogged = true

				const report = (status: number, text: string) => {
					try {
						const headers = parseAllResponseHeaders(this.getAllResponseHeaders() || '')
						const logMessage = buildLog(
							{
								url: meta.url,
								method: meta.method,
								headers: meta.headers,
								body: requestBody.text,
								mockmanId: id,
							},
							responseForLog(status, text, headers),
							false,
						)
						markRequestBody(logMessage, requestBody)
						sendLog(id, logMessage)
					} catch {
						void 0
					}
				}

				this.addEventListener('load', () => {
					const text =
						typeof (this as unknown as { responseText?: unknown }).responseText === 'string'
							? (this as unknown as { responseText: string }).responseText
							: ''
					report(this.status, text)
				})
				this.addEventListener('error', () => report(this.status || 0, ''))
			}

			const applyMock = (mock: IBridgeMockAnswer): void => {
				const headersObj = buildHeadersMap(mock.headers)
				const statusCode = mock.status ?? 200
				const responseText = String(mock.response ?? '')
				try {
					Object.defineProperty(this, 'status', { configurable: true, get: () => statusCode })
					Object.defineProperty(this, 'statusText', { configurable: true, get: () => 'OK' })
					Object.defineProperty(this, 'responseText', { configurable: true, get: () => responseText })
					;(this as unknown as { getAllResponseHeaders?: () => string }).getAllResponseHeaders = () => {
						const lines = Object.entries(headersObj).map(([n, v]) => `${n}: ${v}`)
						return lines.length > 0 ? `${lines.join('\r\n')}\r\n` : ''
					}
					;(this as unknown as { getResponseHeader?: (name: string) => string | null }).getResponseHeader = (name: string) => {
						const expectedName = String(name || '').toLowerCase()
						const matchedName = Object.keys(headersObj).find((headerName) => headerName.toLowerCase() === expectedName)
						return matchedName ? headersObj[matchedName] : null
					}
				} catch {
					void 0
				}

				const delayMs = typeof mock.delay === 'number' && mock.delay > 0 ? mock.delay : 0
				const fire = () => {
					for (const eventName of ['readystatechange', 'load', 'loadend']) {
						try {
							this.dispatchEvent(new Event(eventName))
						} catch {
							void 0
						}
					}
				}
				if (delayMs > 0) setTimeout(fire, delayMs)
				else queueMicrotask(fire)

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

			let dispatched = false
			const sendOnce = (): void => {
				if (dispatched) return
				dispatched = true
				try {
					logRealResponse()
					origSend.call(this, body ?? null)
				} catch {
					void 0
				}
			}

			resolveMock(meta.method, meta.url)
				.then((mock) => {
					if (mock && !dispatched) {
						dispatched = true
						applyMock(mock)
						return
					}
					sendOnce()
				})
				.catch(sendOnce)
			return undefined
		}
	} catch {
		void 0
	}
}
