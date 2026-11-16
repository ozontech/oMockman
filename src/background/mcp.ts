import { libraryWriter } from './library-writer'
import { handleCaptureCommand, revokeCaptures } from './capture'
import { handleRunCommand, renewScopeRuns, stopScopeRuns } from './run-commands'
import { handleScenarioCommand } from './scenario-commands'
import { STORE_KEY } from './store-access'

import { McpAccessError } from '@/services/mcp-access-error'
import { getTab, queryTabs, storageGet, storageRemove, storageSet } from '@/services/extension-api'

const SESSION_KEY = 'mockman.mcp.connection'
const ENDPOINT = 'ws://127.0.0.1:19772/mockman'
interface TabGrant {
	domainWide?: boolean
	tabId?: number
	origin?: string
	allowScenarioWrites?: boolean
	allowCapture?: boolean
}
interface Trust extends TabGrant {
	followActive?: boolean
	previousTabs?: TabGrant[]
	connectionId: string
	token: string
}
let trust: Trust | undefined
let socket: WebSocket | undefined
let reconnect: ReturnType<typeof setTimeout> | undefined
let heartbeat: ReturnType<typeof setInterval> | undefined
let status = 'disconnected'
let generation = 0
let lastHeartbeat = 0

function object(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}
function allowed(store: unknown, origin: string): boolean {
	return (
		object(store) && object(store.sitePermissions) && Object.hasOwn(store.sitePermissions, origin)
	)
}
function isTrust(value: unknown): value is Trust {
	return (
		object(value) &&
		typeof value.connectionId === 'string' &&
		typeof value.token === 'string' &&
		/^[a-f0-9]{64}$/.test(value.token) &&
		(value.tabId === undefined ||
			(typeof value.tabId === 'number' && Number.isInteger(value.tabId))) &&
		(value.origin === undefined || typeof value.origin === 'string') &&
		(value.followActive === undefined || typeof value.followActive === 'boolean') &&
		(value.domainWide === undefined || typeof value.domainWide === 'boolean') &&
		(value.previousTabs === undefined ||
			(Array.isArray(value.previousTabs) &&
				value.previousTabs.length <= 10 &&
				value.previousTabs.every(
					(item) =>
						object(item) &&
						Number.isInteger(item.tabId) &&
						typeof item.origin === 'string' &&
						(item.domainWide === undefined || typeof item.domainWide === 'boolean') &&
						typeof item.allowScenarioWrites === 'boolean' &&
						typeof item.allowCapture === 'boolean',
				))) &&
		(value.allowCapture === undefined || typeof value.allowCapture === 'boolean') &&
		(value.allowScenarioWrites === undefined || typeof value.allowScenarioWrites === 'boolean')
	)
}
function hasGrant(
	scope: string,
	grant: TabGrant,
	permission: 'allowScenarioWrites' | 'allowCapture',
): boolean {
	if (!trust || trust.connectionId !== scope || grant.tabId === undefined) return false
	return [trust, ...(trust.previousTabs ?? [])].some((item) =>
		item.origin === grant.origin && item[permission] === true &&
		(item.tabId === grant.tabId || item.domainWide === true))
}
function snapshot() {
	return {
		status,
		followActive: trust?.followActive === true,
		domainWide: trust?.domainWide === true,
		connectionId: trust?.connectionId,
		tabId: trust?.tabId,
		origin: trust?.origin,
		allowCapture: trust?.allowCapture === true,
		allowScenarioWrites: trust?.allowScenarioWrites === true,
	}
}
async function persist() {
	if (chrome.storage.session) {
		if (trust) await storageSet(chrome.storage.session, { [SESSION_KEY]: trust })
		else await storageRemove(chrome.storage.session, SESSION_KEY)
	}
}
function shutdown() {
	generation++
	clearTimeout(reconnect)
	clearInterval(heartbeat)
	socket?.close()
	socket = undefined
}
async function selectedTab(grant: TabGrant | undefined = trust) {
	if (grant?.tabId === undefined) return []
	try {
		const tab = await getTab(grant.tabId)
		const origin = new URL(tab.url ?? '').origin
		const data = await storageGet(chrome.storage.local, STORE_KEY)
		if (origin !== grant.origin || !allowed(data[STORE_KEY], origin)) return []
		return [{ tabId: tab.id, origin }]
	} catch {
		return []
	}
}
/** Domain permission discovers tabs; each operation still targets one concrete tab. */
async function grantedTabs(selected: Trust): Promise<TabGrant[]> {
	const grants = [selected, ...(selected.previousTabs ?? [])]
	if (!grants.some((item) => item.domainWide)) return grants
	const tabs = await queryTabs()
	const result = new Map<number, TabGrant>()
	for (const grant of grants) {
		if (grant.tabId !== undefined) result.set(grant.tabId, grant)
		if (!grant.domainWide) continue
		for (const tab of tabs) {
			if (tab.id === undefined || !/^https?:\/\//.test(tab.url ?? '')) continue
			if (new URL(tab.url ?? '').origin === grant.origin)
				result.set(tab.id, { ...grant, tabId: tab.id })
		}
	}
	return [...result.values()]
}
async function hasAvailableTab(): Promise<boolean> {
	if (!trust) return false
	return (await Promise.all((await grantedTabs(trust)).map((grant) => selectedTab(grant))))
		.some((tabs) => tabs.length > 0)
}
/** Keep existing grants so switching focus never moves or stops an in-flight run. */
async function followTab(tabId?: number, initial = false) {
	if (!trust?.followActive) return
	let tab = tabId === undefined ? (await queryTabs({ active: true, lastFocusedWindow: true }))[0] : await getTab(tabId)
	if (initial && (!tab || !/^https?:\/\//.test(tab.url ?? ''))) {
		const tabs = await queryTabs()
		tab = tabs.filter((item) => /^https?:\/\//.test(item.url ?? ''))
			.sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0]
	}
	if (tab?.id === undefined || !/^https?:\/\//.test(tab.url ?? '')) return
	const origin = new URL(tab.url ?? '').origin
	const data = await storageGet(chrome.storage.local, STORE_KEY)
	if (!allowed(data[STORE_KEY], origin)) return
	if (trust.tabId === tab.id && trust.origin === origin) return
	const previousTabs = (trust.previousTabs ?? []).filter((item) => item.tabId !== tab.id)
	if (trust.tabId !== undefined && trust.origin) {
		if (previousTabs.length >= 10) throw new Error('Too many granted tabs')
		previousTabs.push({ tabId: trust.tabId, origin: trust.origin,
			allowCapture: trust.allowCapture === true, allowScenarioWrites: trust.allowScenarioWrites === true })
	}
	trust = { ...trust, tabId: tab.id, origin, domainWide: false, previousTabs }
	await persist()
}
function scheduleFollow(tabId?: number) {
	void handleMcpPanelCommand({ action: 'follow_tab', tabId }).catch(() => undefined)
}
// Events also work while the settings page is closed. Extension/service pages are ignored.
if (typeof chrome !== 'undefined') {
	chrome.tabs?.onActivated?.addListener(() => scheduleFollow())
	chrome.tabs?.onUpdated?.addListener((_tabId, change, tab) => {
		if (trust?.followActive && change.url && tab?.active) scheduleFollow()
	})
	chrome.windows?.onFocusChanged?.addListener((windowId) => {
		if (windowId >= 0) scheduleFollow()
	})
}
function connect(code?: string) {
	shutdown()
	const current = generation
	let incompatible = false
	status = 'connecting'
	const ws = new WebSocket(ENDPOINT)
	socket = ws
	const deadline = setTimeout(() => {
		if (status === 'connecting') ws.close()
	}, 5000)
	ws.onopen = () => {
		if (current !== generation) return
		ws.send(
			JSON.stringify(
				code
					? { version: 1, type: 'pair', code }
					: { version: 1, type: 'resume', connectionId: trust?.connectionId, token: trust?.token },
			),
		)
	}
	ws.onmessage = async (event) => {
		if (
			current !== generation ||
			typeof event.data !== 'string' ||
			new TextEncoder().encode(event.data).length > 2 * 1024 * 1024
		)
			return
		let message
		try {
			message = JSON.parse(event.data)
		} catch {
			ws.close(1008)
			return
		}
		if (!message || message.version !== 1) {
			incompatible = true
			ws.close(1008)
			return
		}
		if (message.type === 'connected') {
			if (typeof message.connectionId !== 'string' || !/^[a-f0-9]{64}$/.test(message.token ?? '')) {
				ws.close(1008)
				return
			}
			clearTimeout(deadline)
			trust = { ...trust, connectionId: message.connectionId, token: message.token }
			status = 'connected'
			lastHeartbeat = Date.now()
			try {
				await persist()
			} catch {
				status = 'connected-memory-only'
			}
			if (current !== generation) return
			if (trust?.followActive) scheduleFollow()
			clearInterval(heartbeat)
			heartbeat = setInterval(() => {
				if (Date.now() - lastHeartbeat > 45000) {
					ws.close()
					return
				}
				if (ws.readyState === WebSocket.OPEN)
					ws.send(JSON.stringify({ version: 1, type: 'heartbeat' }))
			}, 15000)
		} else if (message.type === 'heartbeat') {
			lastHeartbeat = Date.now()
			const selected = trust
			if (selected)
				for (const grant of await grantedTabs(selected)) {
					if (grant.tabId !== undefined && grant.origin)
						void renewScopeRuns({
							scope: selected.connectionId,
							tabId: grant.tabId,
							origin: grant.origin,
							authorize: async () => {
								const tabs = await selectedTab(grant)
								if (
									current !== generation ||
									ws.readyState !== WebSocket.OPEN ||
									!hasGrant(selected.connectionId, grant, 'allowScenarioWrites') ||
									tabs.length !== 1
								)
									throw new Error('ACCESS_DENIED')
							},
						})
				}
		} else if (
			message.type === 'command' &&
			trust &&
			status.startsWith('connected') &&
			typeof message.id === 'string'
		) {
			const selected = trust
			const rawParams = object(message.params) ? message.params : {}
			const { tabId: requestedTabId, ...params } = rawParams
			const grant: TabGrant =
				requestedTabId === undefined || requestedTabId === selected.tabId
					? selected
					: (await grantedTabs(selected)).find((item) => item.tabId === requestedTabId) ?? {}
			const authorize = async (permission: 'allowScenarioWrites' | 'allowCapture') => {
				const tabs = await selectedTab(grant)
				if (current !== generation || ws.readyState !== WebSocket.OPEN || !status.startsWith('connected'))
					throw new McpAccessError('connection')
				if (!hasGrant(selected.connectionId, grant, permission)) throw new McpAccessError('permission')
				if (tabs.length !== 1) throw new McpAccessError('tab')
			}
			const access = {
				scope: selected.connectionId,
				origin: grant.origin ?? '',
				authorize: () => authorize('allowScenarioWrites'),
			}
			const captureCommands = [
				'search_requests', 'get_request_fields',
				'start_capture',
				'stop_capture',
				'get_capture_requests',
				'get_request_details',
			]
			const runCommands = [
				'refresh_session',
				'start_session',
				'stop_session',
				'reset_scenario',
				'get_scenario_state',
				'get_request_logs',
			]
			const scenarioCommands = [
				'export_collections', 'preview_import', 'import_collections',
				'get_scenario_catalog',
				'get_scenario',
				'patch_scenario',
				'delete_scenario',
				'validate_scenario_bundle',
				'apply_scenario_bundle',
			]
			let result: unknown
			if (message.command === 'list_tabs') {
				result = (
					await Promise.all(
						(await grantedTabs(selected)).map((item) => selectedTab(item)),
					)
				).flat()
			} else if (message.command === 'get_capabilities') {
				result = {
					kind: 'capabilities',
					automationRevision: 2,
					protocolVersion: 1,
					extensionVersion: chrome.runtime.getManifest().version,
					commands: [
						'list_tabs',
						'get_capabilities',
						...scenarioCommands,
						...runCommands,
						...captureCommands,
					],
					capture: grant.allowCapture === true,
					mutations: grant.allowScenarioWrites === true,
					maxCommandBytes: 2 * 1024 * 1024,
				}
			} else if (captureCommands.includes(message.command) && grant.tabId !== undefined) {
				result = await handleCaptureCommand(message.command, params, {
					...access,
					tabId: grant.tabId,
					authorize: () => authorize('allowCapture'),
				})
			} else if (runCommands.includes(message.command) && grant.tabId !== undefined) {
				result = await handleRunCommand(message.command, params, { ...access, tabId: grant.tabId })
			} else if (scenarioCommands.includes(message.command)) {
				result = await handleScenarioCommand(message.command, params, access)
			} else {
				result = { error: 'UNSUPPORTED_CAPABILITY' }
			}

			if (current === generation && ws.readyState === WebSocket.OPEN)
				ws.send(JSON.stringify({ version: 1, type: 'result', id: message.id, result }))
		}
	}
	ws.onerror = () => {
		if (current !== generation) return
		status = 'not-connected'
	}
	ws.onclose = (event) => {
		clearTimeout(deadline)
		if (current !== generation) return
		clearInterval(heartbeat)
		if (trust) revokeCaptures(trust.connectionId)
		status =
			incompatible || event.reason === 'Version mismatch'
				? 'incompatible-version'
				: event.code === 1008
				? 'pairing-required'
				: 'disconnected'
		if (event.code === 1008 && trust) void stopScopeRuns(trust.connectionId)
		if (trust && event.code !== 1008) reconnect = setTimeout(() => connect(), 3000)
	}
}

let settingsQueue: Promise<unknown> = Promise.resolve()

/** Serialize settings changes so stale tab lookups cannot restore revoked trust. */
export function handleMcpPanelCommand(request: Record<string, unknown>): Promise<unknown> {
	const result = settingsQueue.then(() => handlePanelCommand(request))
	settingsQueue = result.catch(() => undefined)
	return result
}

/** Called only after the shared extension-page sender check in background. */
async function handlePanelCommand(request: Record<string, unknown>): Promise<unknown> {
	if (request.action === 'follow_tab') {
		await followTab(typeof request.tabId === 'number' ? request.tabId : undefined)
		return snapshot()
	}
	if (request.action === 'follow_active') {
		if (!trust || typeof request.allowed !== 'boolean') throw new Error('Pair first')
		trust = { ...trust, followActive: request.allowed, domainWide: false }
		if (request.allowed) await followTab(undefined, true)
		await persist()
		return snapshot()
	}
	if (request.action === 'status') {
		const value = snapshot()
		if (
			trust?.tabId !== undefined &&
			status.startsWith('connected') &&
			!(await hasAvailableTab())
		)
			return { ...value, status: 'tab-unavailable' }
		return value
	}
	if (request.action === 'pair' || request.action === 'disconnect') {
		if (
			request.action === 'pair' &&
			(typeof request.code !== 'string' || !/^[a-f0-9]{16}$/.test(request.code))
		)
			throw new Error('Invalid pairing code')
		if (socket?.readyState === WebSocket.OPEN)
			socket.send(JSON.stringify({ version: 1, type: 'revoke' }))
		const previous = trust
		shutdown()
		trust = undefined
		status = 'disconnected'
		if (previous) {
			revokeCaptures(previous.connectionId)
			await stopScopeRuns(previous.connectionId)
		}
		await persist()
		if (request.action === 'pair' && typeof request.code === 'string') connect(request.code)
	} else if (request.action === 'tabs') {
		const tabs = await queryTabs()
		return tabs
			.filter((tab) => /^https?:\/\//.test(tab.url ?? ''))
			.map((tab) => {
				const url = new URL(tab.url ?? '')
				return { tabId: tab.id, origin: url.origin, title: tab.title ?? '', path: url.pathname }
			})
	} else if (request.action === 'select_current_domain') {
		if (typeof request.tabId !== 'number') throw new Error('Select an allowed site first')
		const tab = await getTab(request.tabId)
		if (trust && new URL(tab.url ?? '').origin === trust.origin && (await selectedTab({ ...trust, tabId: request.tabId })).length) {
			trust = { ...trust, domainWide: true, tabId: request.tabId,
				previousTabs: trust.previousTabs?.filter((grant) => grant.origin !== trust?.origin) }
			await persist()
			return snapshot()
		}
		return handlePanelCommand({ action: 'select', tabId: request.tabId, domainWide: true })
	} else if (request.action === 'grant_site_and_select') {
		if (!trust || typeof request.tabId !== 'number' || typeof request.origin !== 'string') throw new Error('Invalid site grant')
		const tabId = request.tabId
		const origin = request.origin
		const authorize = async () => {
			const tab = await getTab(tabId)
			const url = new URL(tab.url ?? '')
			if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) throw new Error('Selected tab changed site')
		}
		const now = Date.now()
		await libraryWriter.execute({ operationId: crypto.randomUUID(), issuedAt: now, expiresAt: now + 300000 },
			{ type: 'grant_site', origin }, { authorize })
		return handlePanelCommand({ action: 'select', tabId })
	} else if (request.action === 'select') {
		if (!trust || typeof request.tabId !== 'number') throw new Error('Pair first')
		const tab = await getTab(request.tabId)
		const url = new URL(tab.url ?? '')
		const data = await storageGet(chrome.storage.local, STORE_KEY)
		if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported site')
		if (!allowed(data[STORE_KEY], url.origin))
			return { error: 'Allow this site in Mockman first', requiresSitePermission: true, tabId: request.tabId, origin: url.origin }
		trust = {
			...trust,
			previousTabs: [],
			followActive: false,
			tabId: request.tabId,
			origin: url.origin,
			domainWide: request.domainWide === true,
			allowScenarioWrites: request.domainWide === true && trust.origin === url.origin && trust.allowScenarioWrites === true,
			allowCapture: request.domainWide === true && trust.origin === url.origin && trust.allowCapture === true,
		}
		revokeCaptures(trust.connectionId)
		await stopScopeRuns(trust.connectionId)
		await persist()
	} else if (request.action === 'allow_capture') {
		if (!trust || typeof request.allowed !== 'boolean' || !(await hasAvailableTab()))
			throw new Error('Select an allowed site first')
		if (!request.allowed) revokeCaptures(trust.connectionId, trust.domainWide || trust.followActive ? undefined : trust.tabId)
		trust = { ...trust, allowCapture: request.allowed, previousTabs: trust.followActive ? trust.previousTabs?.map((grant) => ({ ...grant, allowCapture: request.allowed === true })) : trust.previousTabs }
		await persist()
	} else if (request.action === 'allow_scenario_writes') {
		if (!trust || typeof request.allowed !== 'boolean' || !(await hasAvailableTab()))
			throw new Error('Select an allowed site first')
		trust = { ...trust, allowScenarioWrites: request.allowed, previousTabs: trust.followActive ? trust.previousTabs?.map((grant) => ({ ...grant, allowScenarioWrites: request.allowed === true })) : trust.previousTabs }
		if (!request.allowed) await stopScopeRuns(trust.connectionId, trust.domainWide || trust.followActive ? undefined : trust.tabId)
		await persist()
	} else throw new Error('Unsupported MCP settings action')
	return snapshot()
}

// Session storage is not exposed to content scripts by default. No credentials in library storage.
if (typeof chrome !== 'undefined' && chrome.storage?.session) {
	const initial = generation
	void storageGet(chrome.storage.session, SESSION_KEY)
		.then((data) => {
			const saved = data[SESSION_KEY]
			if (generation === initial && isTrust(saved)) {
				trust = saved
				connect()
			}
		})
		.catch(() => undefined)
}
