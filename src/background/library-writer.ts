import { STORE_KEY } from './store-access'

import type { IStore } from '@/interface/mock'
import type { CollectionArchive } from '@/services/collection-archive'
import { importCollections } from '@/services/collection-archive'
import { storageGet, storageSet } from '@/services/extension-api'
import { normalizeLibrary } from '@/services/library-normalize'
import { grantSitePermission } from '@/services/origin'
import type { BundleSaved, ScenarioBundle } from '@/services/scenario-bundle'
import { applyScenarioBundle } from '@/services/scenario-bundle'
import { deleteScenario } from '@/services/scenario-delete'
import type { ScenarioPatch } from '@/services/scenario-patch'
import { patchScenario } from '@/services/scenario-patch'

interface Receipt {
	scope?: string
	result?: BundleSaved
	id: string
	digest: string
	expiresAt: number
	revision: number
}
interface CommandState {
	clock: number
	receipts: Receipt[]
}
type Library = Partial<IStore> & { commandState?: CommandState }
export interface WriteIdentity {
	operationId: string
	issuedAt: number
	expiresAt: number
}
export interface LibraryStorage {
	read(): Promise<Library | undefined>
	write(store: Library): Promise<void>
}

function canonical(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
	if (value && typeof value === 'object')
		return `{${Object.entries(value)
			.filter(([, item]) => item !== undefined)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
			.join(',')}}`
	return JSON.stringify(value)
}
async function digest(value: unknown): Promise<string> {
	const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)))
	return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** One writer for the existing library key; data and receipts commit in one storage value. */
export function createLibraryWriter(storage: LibraryStorage, now: () => number = Date.now) {
	let queue: Promise<unknown> = Promise.resolve()
	function serial<T>(work: () => Promise<T>): Promise<T> {
		const result = queue.then(work, work)
		queue = result.catch(() => undefined)
		return result
	}
	return {
		/** Trusted background migrations run inside the same queue as UI commands. */
		migrate(change: (store: Library | undefined) => Promise<Library | undefined>): Promise<void> {
			return serial(async () => {
				const current = await storage.read()
				const next = await change(current)
				if (next)
					await storage.write({
						...next,
						revision: (current?.revision ?? 0) + 1,
						commandState: current?.commandState,
					})
			})
		},
		execute(
			identity: WriteIdentity,
			command:
				| {
						type: 'archive'
						expectedRevision: number
						archive: CollectionArchive
						origin: string
						mode: 'reject' | 'replace'
						prefix: string
				  }
				| { type: 'replace'; expectedRevision: number; store: IStore }
				| { type: 'set_active'; active: boolean }
				| { type: 'grant_site'; origin: string }
				| {
						type: 'scenario_delete'
						collectionId: string
						expectedRevision: number
						origin: string
				  }
				| {
						type: 'scenario_patch'
						collectionId: string
						expectedRevision: number
						patch: ScenarioPatch
						origin: string
				  }
				| { type: 'bundle'; expectedRevision: number; bundle: ScenarioBundle; origin: string },
			options: { scope?: string; authorize?: () => Promise<void> } = {},
		): Promise<{ store: Library; committedRevision: number; result?: BundleSaved }> {
			return serial(async () => {
				await options.authorize?.()
				const current = await storage.read()
				const clock = Math.max(now(), current?.commandState?.clock ?? 0)
				if (
					!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
						identity.operationId,
					) ||
					!Number.isSafeInteger(identity.issuedAt) ||
					!Number.isSafeInteger(identity.expiresAt) ||
					identity.issuedAt > clock ||
					identity.expiresAt <= clock ||
					identity.expiresAt <= identity.issuedAt ||
					identity.expiresAt - identity.issuedAt > 300000
				)
					throw new Error('OPERATION_EXPIRED')
				const fingerprint = await digest({ identity, command })
				const receipts =
					current?.commandState?.receipts.filter((entry) => entry.expiresAt > clock) ?? []
				const previous = receipts.find(
					(entry) =>
						entry.id === identity.operationId && (entry.scope ?? 'ui') === (options.scope ?? 'ui'),
				)
				if (previous) {
					if (previous.digest !== fingerprint) throw new Error('OPERATION_ID_REUSED')
					await options.authorize?.()
					return {
						store: current ?? {},
						committedRevision: previous.revision,
						result: previous.result,
					}
				}
				if (receipts.length >= 1000) throw new Error('LIMIT_EXCEEDED')
				const revision = current?.revision ?? 0
				if (!Number.isSafeInteger(revision) || revision < 0 || revision >= Number.MAX_SAFE_INTEGER)
					throw new Error('INVALID_REVISION')
				if (
					command.type !== 'set_active' &&
					command.type !== 'grant_site' &&
					(!Number.isSafeInteger(command.expectedRevision) || command.expectedRevision !== revision)
				)
					throw new Error('REVISION_CONFLICT')
				if (command.type === 'set_active' && !current) throw new Error('LIBRARY_NOT_INITIALIZED')
				let next: Library
				let result: BundleSaved | undefined
				switch (command.type) {
					case 'archive': {
						const imported = importCollections(
							current ?? {},
							command.archive,
							command.origin,
							command.mode,
							command.prefix,
						)
						if (command.mode === 'reject' && imported.conflicts.length)
							throw new Error('IMPORT_CONFLICT')
						next = imported.store
						result = imported.result
						break
					}
					case 'grant_site':
						next = grantSitePermission(normalizeLibrary(current ?? {}), command.origin)
						break
					case 'replace':
						next = command.store
						break
					case 'set_active':
						next = { ...current, active: command.active }
						break
					case 'bundle':
						;({ store: next, result } = applyScenarioBundle(
							current ?? {},
							command.bundle,
							command.origin,
						))
						break
					case 'scenario_patch':
						;({ store: next, result } = patchScenario(
							current ?? {},
							command.collectionId,
							command.patch,
							command.origin,
						))
						break
					case 'scenario_delete':
						;({ store: next, result } = deleteScenario(
							current ?? {},
							command.collectionId,
							command.origin,
						))
						break
				}

				const committed: Library = {
					...next,
					revision: revision + 1,
					commandState: {
						clock,
						receipts: [
							...receipts,
							{
								id: identity.operationId,
								digest: fingerprint,
								expiresAt: identity.expiresAt,
								revision: revision + 1,
								scope: options.scope ?? 'ui',
								result,
							},
						],
					},
				}
				await options.authorize?.()
				await storage.write(committed)
				return { store: committed, committedRevision: revision + 1, result }
			})
		},
	}
}

export const libraryWriter = createLibraryWriter({
	read: async () =>
		(await storageGet(chrome.storage.local, STORE_KEY))[STORE_KEY] as Library | undefined,
	write: (store) => storageSet(chrome.storage.local, { [STORE_KEY]: store }),
})
