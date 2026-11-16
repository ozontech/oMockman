import { STORE_KEY } from './store-access'

import type { IStore } from '@/interface/mock'
import { storageGet, storageSet } from '@/services/extension-api'
import { defaultLibrary } from '@/services/library-normalize'
import { McpAccessError } from '@/services/mcp-access-error'
import { isScenarioUrl } from '@/services/scenario-url'

const KEY = 'mockman.mcp.runs'
interface Tracking {
	owner: string
	tabId: number
	documentId: string
	runId: string
	origin: string
}
interface Access {
	scope: string
	tabId: number
	origin: string
	authorize(): Promise<void>
}
interface RunState {
	documentId: string
	runId: string | null
	state: string
	generation: number
	appliedRevision: number | null
}
let tracked: Tracking[] = []
const ready =
	typeof chrome !== 'undefined' && chrome.storage?.session
		? storageGet(chrome.storage.session, KEY)
				.then((data) => {
					if (Array.isArray(data[KEY])) tracked = data[KEY] as Tracking[]
				})
				.catch(() => undefined)
		: Promise.resolve()
let queue: Promise<unknown> = Promise.resolve()
const serial = <T>(work: () => Promise<T>): Promise<T> => {
	const result = queue.then(work, work)
	queue = result.catch(() => undefined)
	return result
}
const persist = async () => {
	if (chrome.storage.session) await storageSet(chrome.storage.session, { [KEY]: tracked })
}

function send(tabId: number, message: Record<string, unknown>): Promise<RunState> {
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => reject(new Error('APPLY_TIMEOUT')), 3000)
		try {
			chrome.tabs.sendMessage(
				tabId,
				{ type: 'MOCKMAN_RUN', ...message },
				{ frameId: 0 },
				(answer) => {
					clearTimeout(timeout)
					if (chrome.runtime.lastError) reject(new Error('NOT_CONNECTED'))
					else if (!answer?.ok) reject(new Error(answer?.error ?? 'NOT_CONNECTED'))
					else resolve(answer.value)
				},
			)
		} catch {
			clearTimeout(timeout)
			reject(new Error('TAB_CLOSED'))
		}
	})
}

/** Immediate best-effort revoke; the content lease is the fallback if the document is unreachable. */
export function stopScopeRuns(owner: string, tabId?: number): Promise<void> {
	return serial(async () => {
		await ready
		const runs = tracked.filter(
			(run) => run.owner === owner && (tabId === undefined || run.tabId === tabId),
		)
		tracked = tracked.filter(
			(run) => run.owner !== owner || (tabId !== undefined && run.tabId !== tabId),
		)
		await Promise.all(
			runs.map((run) => send(run.tabId, { ...run, action: 'revoke' }).catch(() => undefined)),
		)
		await persist()
	})
}
export function renewScopeRuns(access: Access): Promise<void> {
	return serial(async () => {
		await ready
		for (const run of tracked.filter(
			(item) => item.owner === access.scope && item.tabId === access.tabId,
		)) {
			try {
				await access.authorize()
				if (run.tabId !== access.tabId || run.origin !== access.origin)
					throw new Error('ACCESS_DENIED')
				await send(run.tabId, { ...run, action: 'renew' })
			} catch {
				await send(run.tabId, { ...run, action: 'revoke' }).catch(() => undefined)
				tracked = tracked.filter((item) => item !== run)
			}
		}
		await persist()
	})
}

/** Only the selected top frame receives an immutable snapshot. Persistent collection flags are untouched. */
export function handleRunCommand(command: string, raw: unknown, access: Access): Promise<unknown> {
	return serial(async () => {
		try {
			await ready
			await access.authorize()
			if (!raw || typeof raw !== 'object' || Array.isArray(raw))
				throw new Error('INVALID_ARGUMENTS')
			const params = raw as Record<string, unknown>
			if (command === 'get_scenario_state') {
				if (Object.keys(params).length) throw new Error('INVALID_ARGUMENTS')
				const result = await send(access.tabId, { action: 'state', owner: access.scope })
				await access.authorize()
				return result
			}
			if (command === 'get_request_logs') {
				const keys = ['documentId', 'runId', 'expectedGeneration']
				if (
					Object.keys(params).length !== keys.length ||
					Object.keys(params).some((key) => !keys.includes(key)) ||
					typeof params.documentId !== 'string' ||
					typeof params.runId !== 'string' ||
					!Number.isSafeInteger(params.expectedGeneration) ||
					Number(params.expectedGeneration) < 0
				)
					throw new Error('INVALID_ARGUMENTS')
				const result = await send(access.tabId, { ...params, action: 'logs', owner: access.scope })
				await access.authorize()
				return result
			}
			const action = (
				{
					refresh_session: 'refresh',
					start_session: 'start',
					stop_session: 'stop',
					reset_scenario: 'reset',
				} as Record<string, string>
			)[command]
			const keys = [
				'operationId',
				'issuedAt',
				'expiresAt',
				'documentId',
				...(action === 'start' || action === 'refresh'
					? [
							'collectionId',
							'expectedRevision',
							...(action === 'refresh' ? ['runId', 'expectedGeneration', 'counters'] : []),
							...(params.variables === undefined ? [] : ['variables']),
					  ]
					: ['runId', 'expectedGeneration']),
			]
			if (
				!action ||
				Object.keys(params).some((key) => !keys.includes(key)) ||
				keys.some((key) => !(key in params)) ||
				typeof params.operationId !== 'string' ||
				!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
					params.operationId,
				) ||
				typeof params.documentId !== 'string' ||
				!Number.isSafeInteger(params.issuedAt) ||
				!Number.isSafeInteger(params.expiresAt)
			)
				throw new Error('INVALID_ARGUMENTS')
			if (action === 'refresh' && !['preserve', 'reset'].includes(String(params.counters)))
				throw new Error('INVALID_ARGUMENTS')
			let store: IStore | undefined
			if (action === 'start' || action === 'refresh') {
				const variables = params.variables ?? {}
				if (
					!variables ||
					typeof variables !== 'object' ||
					Array.isArray(variables) ||
					Object.keys(variables).length > 100 ||
					Object.entries(variables).some(
						([key, value]) =>
							!/^[A-Za-z0-9_]{1,128}$/.test(key) ||
							typeof value !== 'string' ||
							value.length > 4096,
					)
				)
					throw new Error('INVALID_ARGUMENTS')

				const data = await storageGet(chrome.storage.local, STORE_KEY)
				const library = data[STORE_KEY] as IStore | undefined
				if (
					!Number.isSafeInteger(params.expectedRevision) ||
					params.expectedRevision !== (library?.revision ?? 0)
				)
					throw new Error('REVISION_CONFLICT')
				const node =
					typeof params.collectionId === 'string'
						? library?.collectionTree?.nodes[params.collectionId]
						: undefined
				if (!node || node.automation?.origin !== access.origin) throw new Error('INVALID_SCENARIO')
				const mocks = library?.mocks.filter((mock) => mock.collectionId === node.id) ?? []
				if (mocks.some((mock) => !isScenarioUrl(mock.url))) throw new Error('ACCESS_DENIED')
				if (
					node.scenario?.rules.some(
						(rule) =>
							!isScenarioUrl(rule.url) ||
							('mockId' in rule.respond &&
								!mocks.some(
									(mock) => mock.id === ('mockId' in rule.respond ? rule.respond.mockId : ''),
								)),
					)
				)
					throw new Error('INVALID_SCENARIO')
				store = {
					...defaultLibrary(),
					env: {
						activeId: 'run',
						profiles: [{ id: 'run', name: 'Run', vars: variables as Record<string, string> }],
					},
					active: true,
					mocks,
					sitePermissions: { [access.origin]: { grantedOn: Date.now() } },
					collectionTree: {
						root: [{ id: node.id, type: 'collection' }],
						nodes: { [node.id]: { ...node, active: true, parentId: null } },
					},
				}
			}
			if (store && new TextEncoder().encode(JSON.stringify(store)).length > 2 * 1024 * 1024)
				throw new Error('LIMIT_EXCEEDED')
			await access.authorize()
			const result = await send(access.tabId, {
				...params,
				action,
				owner: access.scope,
				origin: access.origin,
				store,
				revision: params.expectedRevision,
				fingerprint: JSON.stringify([command, ...keys.map((key) => params[key])]),
			})
			if (result.documentId !== params.documentId) throw new Error('DOCUMENT_CHANGED')
			// Recheck after ACK: a concurrent revoke must not leave an untracked active overlay.
			try {
				await access.authorize()
			} catch (error) {
				if (result.runId)
					await send(access.tabId, {
						action: 'revoke',
						owner: access.scope,
						documentId: result.documentId,
						runId: result.runId,
					}).catch(() => undefined)
				throw error
			}
			tracked = tracked.filter((run) => run.tabId !== access.tabId)
			if (result.runId && result.state === 'running')
				tracked.push({
					owner: access.scope,
					tabId: access.tabId,
					documentId: result.documentId,
					runId: result.runId,
					origin: access.origin,
				})
			await persist()
			return result
		} catch (error) {
			const allowed = [
				'INVALID_ARGUMENTS',
				'ACCESS_DENIED',
				'REVISION_CONFLICT',
				'COUNTERS_INCOMPATIBLE',
				'INVALID_SCENARIO',
				'TAB_BUSY',
				'DOCUMENT_CHANGED',
				'RUN_NOT_FOUND',
				'GENERATION_CONFLICT',
				'OPERATION_EXPIRED',
				'OPERATION_ID_REUSED',
				'LIMIT_EXCEEDED',
				'NOT_CONNECTED',
				'TAB_CLOSED',
				'APPLY_TIMEOUT',
			]
			const code =
				error instanceof Error && allowed.includes(error.message) ? error.message : 'RUN_ERROR'
			return {
				kind: 'error',
				code,
				message: error instanceof McpAccessError ? error.publicMessage : code,
				retryable: false,
			}
		}
	})
}
