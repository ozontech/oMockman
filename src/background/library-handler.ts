import type { WriteIdentity } from './library-writer'
import { libraryWriter } from './library-writer'

import type { IStore } from '@/interface/mock'
import { normalizeLibrary } from '@/services/library-normalize'

/** Internal UI API only. MCP never receives this whole-library operation. */
export async function handleLibraryCommand(request: Record<string, unknown>, canReplace: boolean) {
	const identity: WriteIdentity = {
		operationId: typeof request.operationId === 'string' ? request.operationId : '',
		issuedAt: typeof request.issuedAt === 'number' ? request.issuedAt : NaN,
		expiresAt: typeof request.expiresAt === 'number' ? request.expiresAt : NaN,
	}
	try {
		if (request.action === 'set_active' && typeof request.active === 'boolean') {
			await libraryWriter.execute(identity, { type: 'set_active', active: request.active })
			return { ok: true }
		}
		if (
			!canReplace ||
			request.action !== 'replace' ||
			!request.store ||
			typeof request.store !== 'object'
		)
			throw new Error('INVALID_COMMAND')
		const input = request.store as IStore & { commandState?: unknown }
		if (
			!Array.isArray(input.mocks) ||
			typeof input.active !== 'boolean' ||
			!input.collectionTree ||
			!input.activityInfo
		)
			throw new Error('INVALID_LIBRARY')
		// Credentials are handled by the secret API; do not persist legacy raw keys from UI snapshots.
		if (input.ai?.providers?.some((provider) => 'apiKey' in provider))
			throw new Error('INVALID_LIBRARY')
		const clean = { ...input }
		delete clean.commandState
		const result = await libraryWriter.execute(identity, {
			type: 'replace',
			expectedRevision:
				typeof request.expectedRevision === 'number' ? request.expectedRevision : NaN,
			store: normalizeLibrary(clean),
		})
		const store = { ...result.store }
		delete store.commandState
		return { ok: true, store, committedRevision: result.committedRevision }
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : 'STORAGE_WRITE_FAILED' }
	}
}
