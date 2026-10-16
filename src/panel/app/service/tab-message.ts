type ExtApi = typeof chrome

const ext = (
	(globalThis as unknown as { browser?: ExtApi }).browser
	?? (globalThis as unknown as { chrome?: ExtApi }).chrome
) as ExtApi | undefined

export type TabAnswer<T> = { ok: true; value: T } | { ok: false; error: string }

const isAnswer = (value: unknown): value is TabAnswer<unknown> =>
	typeof value === 'object' && value !== null && 'ok' in value

/** A DevTools page in Firefox has no `tabs` API: the background messages the tab for it. */
async function throughBackground<T>(tabId: number, message: Record<string, unknown>): Promise<TabAnswer<T>> {
	const runtime = ext?.runtime
	const fn = runtime?.sendMessage as unknown as ((...args: unknown[]) => unknown) | undefined
	if (!fn) return { ok: false, error: 'runtime.sendMessage is not available' }
	const envelope = { type: 'PANEL_SEND_TO_TAB', tabId, message }
	try {
		const answer = fn.length >= 2
			? await new Promise<unknown>((resolve) => fn(envelope, (value: unknown) => {
				void runtime?.lastError
				resolve(value)
			}))
			: await Promise.resolve(fn(envelope))
		return isAnswer(answer) ? (answer as TabAnswer<T>) : { ok: false, error: 'No answer from the page' }
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : String(error) }
	}
}

/** Sends a message to the content script of the tab's top frame; the answer never throws. */
export function messageTopFrame<T>(tabId: number, message: Record<string, unknown>): Promise<TabAnswer<T>> {
	const fn = ext?.tabs?.sendMessage as unknown as ((...args: unknown[]) => unknown) | undefined
	if (!fn) return throughBackground<T>(tabId, message)

	return new Promise<TabAnswer<T>>((resolve) => {
		const finish = (value: unknown) => {
			const lastError = ext?.runtime?.lastError
			if (lastError) {
				resolve({ ok: false, error: lastError.message ?? 'No connection to the page' })
				return
			}
			resolve(value === undefined ? { ok: false, error: 'No answer from the page' } : { ok: true, value: value as T })
		}
		try {
			const returned = fn(tabId, message, { frameId: 0 }, finish)
			if (returned && typeof (returned as Promise<unknown>).then === 'function') {
				;(returned as Promise<unknown>).then(finish, (error: unknown) =>
					resolve({ ok: false, error: error instanceof Error ? error.message : String(error) }))
			}
		} catch (error) {
			resolve({ ok: false, error: error instanceof Error ? error.message : String(error) })
		}
	})
}
