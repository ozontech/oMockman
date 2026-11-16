import { libraryWriter } from './library-writer'
import { STORE_KEY } from './store-access'

import { validateBundle } from '@mockman/automation-protocol'
import type { IStore } from '@/interface/mock'
import { assertArchive, exportCollections, importCollections } from '@/services/collection-archive'
import { storageGet } from '@/services/extension-api'
import { defaultLibrary } from '@/services/library-normalize'
import { McpAccessError } from '@/services/mcp-access-error'
import { assertScenarioBundle } from '@/services/scenario-bundle'
import type { ScenarioPatch } from '@/services/scenario-patch'
import { assertScenarioPatch } from '@/services/scenario-patch'
import { readScenario } from '@/services/scenario-read'

export interface ScenarioAccess {
	scope: string
	origin: string
	authorize(): Promise<void>
}
const record = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value)

/** Only managed scenarios of the explicitly granted origin are visible. Reads expose only a filtered scenario DTO. */
export async function handleScenarioCommand(
	command: string,
	params: unknown,
	access: ScenarioAccess,
): Promise<unknown> {
	try {
		await access.authorize()
		if (!record(params)) throw new Error('INVALID_ARGUMENTS')
		if (
			command === 'export_collections' ||
			command === 'preview_import' ||
			command === 'import_collections'
		) {
			const data = await storageGet(chrome.storage.local, STORE_KEY)
			const store = (data[STORE_KEY] as IStore | undefined) ?? defaultLibrary()
			if (command === 'export_collections') {
				if (Object.keys(params).length !== 1 || typeof params.collectionId !== 'string')
					throw new Error('INVALID_ARGUMENTS')
				const archive = exportCollections(store, params.collectionId, access.origin)
				if (JSON.stringify(archive).length * 2 > 2 * 1024 * 1024 - 4096)
					throw new Error('LIMIT_EXCEEDED')
				await access.authorize()
				return { kind: 'collection_archive', archive, libraryRevision: store.revision ?? 0 }
			}
			const keys = [
				'archive',
				'mode',
				'prefix',
				...(command === 'import_collections'
					? ['operationId', 'issuedAt', 'expiresAt', 'expectedRevision']
					: []),
			]
			if (
				Object.keys(params).length !== keys.length ||
				Object.keys(params).some((key) => !keys.includes(key)) ||
				!['reject', 'replace'].includes(String(params.mode)) ||
				typeof params.prefix !== 'string'
			)
				throw new Error('INVALID_ARGUMENTS')
			assertArchive(params.archive)
			const mode = params.mode as 'reject' | 'replace'
			if (command === 'preview_import') {
				const preview = importCollections(store, params.archive, access.origin, mode, params.prefix)
				await access.authorize()
				return {
					kind: 'import_preview',
					conflicts: preview.conflicts,
					canImport: mode === 'replace' || !preview.conflicts.length,
					count: params.archive.bundles.length,
					libraryRevision: store.revision ?? 0,
				}
			}
			const result = await libraryWriter.execute(
				{
					operationId: params.operationId as string,
					issuedAt: params.issuedAt as number,
					expiresAt: params.expiresAt as number,
				},
				{
					type: 'archive',
					archive: params.archive,
					prefix: params.prefix,
					mode,
					origin: access.origin,
					expectedRevision: params.expectedRevision as number,
				},
				{ scope: access.scope, authorize: access.authorize },
			)
			return {
				kind: 'saved',
				saved: true,
				applied: false,
				operationId: params.operationId,
				libraryRevision: result.committedRevision,
				...result.result,
			}
		}
		if (command === 'get_scenario') {
			if (Object.keys(params).length !== 1 || typeof params.collectionId !== 'string')
				throw new Error('INVALID_ARGUMENTS')
			const data = await storageGet(chrome.storage.local, STORE_KEY)
			const result = readScenario(
				(data[STORE_KEY] as IStore | undefined) ?? defaultLibrary(),
				params.collectionId,
				access.origin,
			)
			if (new TextEncoder().encode(JSON.stringify(result)).length > 2 * 1024 * 1024 - 4096)
				throw new Error('LIMIT_EXCEEDED')
			await access.authorize()
			return result
		}
		if (command === 'get_scenario_catalog') {
			if (Object.keys(params).length) throw new Error('INVALID_ARGUMENTS')
			const data = await storageGet(chrome.storage.local, STORE_KEY)
			const store = data[STORE_KEY] as IStore | undefined
			await access.authorize()
			return {
				libraryRevision: store?.revision ?? 0,
				scenarios: Object.values(store?.collectionTree?.nodes ?? {})
					.filter(
						(node) =>
							node.automation?.origin === access.origin || node.task?.origin === access.origin,
					)
					.map((node) => ({
						collectionId: node.id,
						scenarioKey: node.automation?.scenarioKey,
						name: node.name,
						parentId: node.parentId,
						taskKey: node.task?.key,
					})),
			}
		}
		if (command === 'delete_scenario' || command === 'patch_scenario') {
			const keys = ['collectionId', 'expectedRevision', 'operationId', 'issuedAt', 'expiresAt']
			if (command === 'patch_scenario') keys.push('patch')
			if (
				Object.keys(params).length !== keys.length ||
				Object.keys(params).some((key) => !keys.includes(key)) ||
				typeof params.collectionId !== 'string' ||
				typeof params.operationId !== 'string' ||
				typeof params.issuedAt !== 'number' ||
				typeof params.expiresAt !== 'number' ||
				typeof params.expectedRevision !== 'number'
			)
				throw new Error('INVALID_ARGUMENTS')
			const target = {
				collectionId: params.collectionId,
				expectedRevision: params.expectedRevision,
				origin: access.origin,
			}
			let mutation: { type: 'scenario_delete' } | { type: 'scenario_patch'; patch: ScenarioPatch }
			if (command === 'delete_scenario') mutation = { type: 'scenario_delete' }
			else {
				assertScenarioPatch(params.patch)
				mutation = { type: 'scenario_patch', patch: params.patch }
			}
			const result = await libraryWriter.execute(
				{ operationId: params.operationId, issuedAt: params.issuedAt, expiresAt: params.expiresAt },
				{ ...target, ...mutation },
				{ scope: access.scope, authorize: access.authorize },
			)
			const receipt = {
				operationId: params.operationId,
				libraryRevision: result.committedRevision,
				applied: false,
			}
			return command === 'delete_scenario'
				? { ...receipt, kind: 'deleted', collectionId: params.collectionId }
				: { ...receipt, kind: 'saved', saved: true, ...result.result }
		}

		const keys =
			command === 'validate_scenario_bundle'
				? ['bundle']
				: ['bundle', 'expectedRevision', 'operationId', 'issuedAt', 'expiresAt']
		if (
			!['validate_scenario_bundle', 'apply_scenario_bundle'].includes(command) ||
			Object.keys(params).some((key) => !keys.includes(key))
		)
			throw new Error('INVALID_ARGUMENTS')
		if (command === 'validate_scenario_bundle') {
			const validation = validateBundle(params.bundle)
			return validation.valid ? { kind: 'valid' } : { kind: 'error', code: 'INVALID_SCENARIO', message: validation.errors.map(error => `${error.path}: ${error.message}`).join('; '), retryable: false }
		}
		assertScenarioBundle(params.bundle)
		if (
			typeof params.operationId !== 'string' ||
			typeof params.issuedAt !== 'number' ||
			typeof params.expiresAt !== 'number' ||
			typeof params.expectedRevision !== 'number'
		)
			throw new Error('INVALID_ARGUMENTS')
		const result = await libraryWriter.execute(
			{ operationId: params.operationId, issuedAt: params.issuedAt, expiresAt: params.expiresAt },
			{
				type: 'bundle',
				expectedRevision: params.expectedRevision,
				bundle: params.bundle,
				origin: access.origin,
			},
			{ scope: access.scope, authorize: access.authorize },
		)
		return {
			kind: 'saved',
			saved: true,
			applied: false,
			operationId: params.operationId,
			libraryRevision: result.committedRevision,
			...result.result,
		}
	} catch (error) {
		// Never echo validation input, browser URLs, or storage exception details to a model.
		const code = error instanceof Error ? error.message : ''
		const known = [
			'IMPORT_CONFLICT',
			'INVALID_SCENARIO',
			'INVALID_ARGUMENTS',
			'ACCESS_DENIED',
			'REVISION_CONFLICT',
			'OPERATION_EXPIRED',
			'OPERATION_ID_REUSED',
			'LIMIT_EXCEEDED',
			'SCENARIO_REFERENCED',
			'SCENARIO_ACTIVE',
			'SCENARIO_REQUIRES_MANUAL_EDIT',
		]
		const publicCode = known.includes(code) ? code : 'STORAGE_ERROR'
		return {
			kind: 'error',
			code: publicCode,
			message: error instanceof McpAccessError ? error.publicMessage : publicCode,
			retryable: false,
		}
	}
}
