/**
 * Sends a request the panel asked for from the page's world, so it goes out exactly as the page's
 * own would: same origin, cookies and CORS. It uses the native fetch: mocks never answer it.
 */

import type { ISendRequest, ISendResult } from '@/interface/bridge'
import { isBinaryContentType, readBodyLimited } from '@/inject/limits'
import { canPatchMethod } from '@/services/request-patch'

const SEND_TIMEOUT_MS = 60_000

let nativeFetch: typeof fetch | null = null

/** Called by the fetch wrapper with the fetch it wraps. */
export function registerNativeFetch(fn: typeof fetch): void {
	nativeFetch = fn
}

const failure = (reason: Extract<ISendResult, { ok: false }>['reason'], error: string): ISendResult =>
	({ ok: false, reason, error })

export async function sendFromPage(request: ISendRequest): Promise<ISendResult> {
	if (!nativeFetch) return failure('unavailable', 'Mockman did not wrap fetch on this page.')

	let url: URL
	try {
		url = new URL(String(request.url ?? ''), location.href)
	} catch {
		return failure('invalid', 'The URL is not valid.')
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') return failure('invalid', 'Only http and https URLs can be sent.')

	const method = String(request.method || 'GET').toUpperCase()
	const headers = new Headers()
	for (const { name, value } of request.headers ?? []) {
		try {
			headers.append(name, value)
		} catch {
			void 0
		}
	}

	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS)
	const started = performance.now()
	try {
		const response = await nativeFetch(url.href, {
			method,
			headers,
			body: canPatchMethod(method) && request.body ? request.body : undefined,
			credentials: request.withCredentials ? 'include' : 'same-origin',
			cache: 'no-store',
			signal: controller.signal,
		})
		const responseHeaders = Array.from(response.headers.entries()).map(([name, value]) => ({ name, value }))
		const declared = Number(response.headers.get('content-length')) || undefined
		const base = {
			ok: true as const,
			status: response.status,
			statusText: response.statusText,
			headers: responseHeaders,
			url: response.url || url.href,
		}
		if (isBinaryContentType(response.headers.get('content-type'))) {
			response.body?.cancel().catch(() => undefined)
			return { ...base, body: '', binary: true, size: declared, durationMs: Math.round(performance.now() - started) }
		}
		const body = await readBodyLimited(response.body)
		return {
			...base,
			body: body.text,
			...(body.tooLarge ? { tooLarge: true, size: declared } : {}),
			durationMs: Math.round(performance.now() - started),
		}
	} catch (error) {
		if (controller.signal.aborted) return failure('timeout', `No answer in ${SEND_TIMEOUT_MS / 1000} s.`)
		return failure('network', error instanceof Error ? error.message : String(error))
	} finally {
		clearTimeout(timer)
	}
}

/** Test helper. */
export function resetSenderForTests(): void {
	nativeFetch = null
}
