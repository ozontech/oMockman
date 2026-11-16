import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { handleLibraryCommand } from '@/background/library-handler'
import { defaultLibrary } from '@/services/library-normalize'

let saved: unknown
const write = vi.fn()
const key = 'mockman.extension.main.db'
function command() {
	const issuedAt = Date.now()
	return {
		action: 'replace',
		operationId: crypto.randomUUID(),
		issuedAt,
		expiresAt: issuedAt + 300000,
		expectedRevision: 0,
		store: defaultLibrary(),
	}
}
beforeEach(() => {
	saved = undefined
	write.mockReset()
	vi.stubGlobal('chrome', {
		runtime: {},
		storage: {
			local: {
				get: (_keys: unknown, cb: (items: unknown) => void) => cb({ [key]: saved }),
				set: (items: Record<string, unknown>, cb: () => void) => {
					saved = structuredClone(items[key])
					write(items)
					cb()
				},
			},
		},
	})
})
afterEach(() => vi.unstubAllGlobals())
it('returns saved revision but keeps operation bookkeeping out of the UI response', async () => {
	const message = command()
	const result = await handleLibraryCommand(message, true)
	expect(result).toMatchObject({ ok: true, store: { revision: 1 }, committedRevision: 1 })
	expect(result.store).not.toHaveProperty('commandState')
	expect(await handleLibraryCommand(message, true)).toMatchObject({
		ok: true,
		committedRevision: 1,
	})
	expect(write).toHaveBeenCalledTimes(1)
})
it('does not allow the popup to replace the library', async () => {
	expect(await handleLibraryCommand(command(), false)).toMatchObject({
		ok: false,
		error: 'INVALID_COMMAND',
	})
	expect(write).not.toHaveBeenCalled()
})
it('rejects raw credentials in the library instead of writing them into shared storage', async () => {
	const message = command()
	const store = { ...message.store, ai: { providers: [{ apiKey: 'synthetic-test-only' }] } }
	expect(await handleLibraryCommand({ ...message, store }, true)).toMatchObject({
		ok: false,
		error: 'INVALID_LIBRARY',
	})
	expect(write).not.toHaveBeenCalled()
})
it('reports a conflict without replacing the first writer data', async () => {
	await handleLibraryCommand(command(), true)
	expect(await handleLibraryCommand(command(), true)).toMatchObject({
		ok: false,
		error: 'REVISION_CONFLICT',
	})
	expect(write).toHaveBeenCalledTimes(1)
})
