import { afterEach, expect, it, vi } from 'vitest'

const sockets: FakeSocket[] = []
class FakeSocket {
	static OPEN = 1
	readyState = 1
	onopen?: () => void
	onclose?: (event: { code: number }) => void
	onmessage?: (event: { data: string }) => Promise<void>
	onerror?: () => void
	sent: Array<Record<string, unknown>> = []
	constructor() {
		sockets.push(this)
	}
	send(raw: string) {
		this.sent.push(JSON.parse(raw))
	}
	close() {
		this.readyState = 3
		this.onclose?.({ code: 1000 })
	}
	async receive(value: unknown) {
		await this.onmessage?.({ data: JSON.stringify(value) })
	}
}
afterEach(() => {
	vi.useRealTimers()
	vi.unstubAllGlobals()
	sockets.length = 0
})

it('exposes only a selected permitted tab, blocks mutations and revokes credentials', async () => {
	vi.resetModules()
	vi.useFakeTimers()
	let url = 'https://app.example.test/page?secret=value'
	const set = vi.fn().mockResolvedValue(undefined)
	const remove = vi.fn().mockResolvedValue(undefined)
	vi.stubGlobal('WebSocket', FakeSocket)
	vi.stubGlobal('chrome', {
		runtime: { getManifest: () => ({ version: '2.5.0' }) },
		tabs: {
			get: vi.fn(async (id: number) => ({ id, url: id === 8 ? 'https://app.example.test/second' : id === 9 ? 'https://ungranted.example.test/' : id === 10 ? 'chrome-extension://mockman/settings' : url })),
			query: vi.fn(async () => [
				{ id: 7, url },
				{ id: 8, url: 'https://app.example.test/second' },
				{ id: 9, url: 'https://ungranted.example.test/' },
			]),
		},
		storage: {
			session: { get: vi.fn().mockResolvedValue({}), set, remove },
			local: {
				get: vi
					.fn()
					.mockResolvedValue({
						'mockman.extension.main.db': { sitePermissions: { 'https://app.example.test': {} } },
					}),
			},
		},
	})
	const { handleMcpPanelCommand: command } = await import('@/background/mcp')
	await expect(command({ action: 'select', tabId: 7 })).rejects.toThrow('Pair first')
	await command({ action: 'pair', code: '0123456789abcdef' })
	const ws = sockets[0]
	ws.onopen?.()
	await ws.receive({
		version: 1,
		type: 'connected',
		connectionId: 'profile',
		token: 'a'.repeat(64),
	})
	await ws.receive({ version: 1, type: 'command', id: '1', command: 'list_tabs' })
	expect(ws.sent.at(-1)?.result).toEqual([])
	await command({ action: 'select', tabId: 7 })
	await ws.receive({ version: 1, type: 'command', id: '2', command: 'list_tabs' })
	expect(ws.sent.at(-1)?.result).toEqual([{ tabId: 7, origin: 'https://app.example.test' }])
	await ws.receive({ version: 1, type: 'command', id: 'denied-validation', command: 'validate_scenario_bundle', params: {} })
	expect(ws.sent.at(-1)?.result).toMatchObject({ code: 'ACCESS_DENIED', message: expect.stringContaining('target tab has no grant') })
	await command({ action: 'allow_scenario_writes', allowed: true })
	await command({ action: 'select_current_domain', tabId: 7 })
	await ws.receive({ version: 1, type: 'command', id: 'domain', command: 'list_tabs' })
	expect(ws.sent.at(-1)?.result).toEqual([
		{ tabId: 7, origin: 'https://app.example.test' },
		{ tabId: 8, origin: 'https://app.example.test' },
	])
	await ws.receive({ version: 1, type: 'command', id: 'cap', command: 'get_capabilities', params: { tabId: 8 } })
	expect(ws.sent.at(-1)?.result).toMatchObject({ mutations: true })
	await command({ action: 'allow_scenario_writes', allowed: false })
	await ws.receive({ version: 1, type: 'command', id: 'cap-revoked', command: 'get_capabilities', params: { tabId: 8 } })
	expect(ws.sent.at(-1)?.result).toMatchObject({ mutations: false })
	await command({ action: 'follow_active', allowed: true })
	await command({ action: 'allow_scenario_writes', allowed: true })
	await command({ action: 'follow_tab', tabId: 8 })
	expect(await command({ action: 'status' })).toMatchObject({ tabId: 8, followActive: true, allowScenarioWrites: true })
	await ws.receive({ version: 1, type: 'command', id: 'follow-list', command: 'list_tabs' })
	expect(ws.sent.at(-1)?.result).toEqual([
		{ tabId: 8, origin: 'https://app.example.test' },
		{ tabId: 7, origin: 'https://app.example.test' },
	])
	await command({ action: 'follow_tab', tabId: 9 })
	await command({ action: 'follow_tab', tabId: 10 })
	expect(await command({ action: 'status' })).toMatchObject({ tabId: 8 })
	await command({ action: 'allow_scenario_writes', allowed: false })
	await ws.receive({ version: 1, type: 'command', id: 'follow-revoke', command: 'get_capabilities', params: { tabId: 7 } })
	expect(ws.sent.at(-1)?.result).toMatchObject({ mutations: false })
	await command({ action: 'follow_active', allowed: false })
	await command({ action: 'follow_tab', tabId: 7 })
	expect(await command({ action: 'status' })).toMatchObject({ tabId: 8, followActive: false })
	// A stale panel cannot preserve old grants using the removed option.
	await command({ action: 'select', tabId: 7, keepPrevious: true })
	await ws.receive({ version: 1, type: 'command', id: 'manual-selection', command: 'list_tabs' })
	expect(ws.sent.at(-1)?.result).toEqual([{ tabId: 7, origin: 'https://app.example.test' }])
	url = 'https://other.example.test/'
	await ws.receive({ version: 1, type: 'command', id: '3', command: 'list_tabs' })
	expect(ws.sent.at(-1)?.result).toEqual([])
	await ws.receive({ version: 1, type: 'command', id: '4', command: 'delete_collection' })
	expect(ws.sent.at(-1)?.result).toEqual({ error: 'UNSUPPORTED_CAPABILITY' })
	expect(await command({ action: 'status' })).not.toHaveProperty('token')
	await command({ action: 'disconnect' })
	expect(remove).toHaveBeenCalledWith('mockman.mcp.connection', expect.any(Function))
	expect(ws.sent.at(-1)?.type).toBe('revoke')
	expect(vi.getTimerCount()).toBe(0)
})

it('serializes disconnect behind an outstanding tab selection without restoring trust', async () => {
	vi.resetModules()
	vi.useFakeTimers()
	let finishLookup!: (tab: { id: number; url: string }) => void
	const get = vi.fn(
		() =>
			new Promise((resolve) => {
				finishLookup = resolve
			}),
	)
	vi.stubGlobal('WebSocket', FakeSocket)
	vi.stubGlobal('chrome', {
		runtime: { getManifest: () => ({ version: '2.5.0' }) },
		tabs: { get },
		storage: {
			session: {
				get: vi.fn().mockResolvedValue({}),
				set: vi.fn().mockResolvedValue(undefined),
				remove: vi.fn().mockResolvedValue(undefined),
			},
			local: {
				get: vi
					.fn()
					.mockResolvedValue({
						'mockman.extension.main.db': { sitePermissions: { 'https://app.example.test': {} } },
					}),
			},
		},
	})
	const { handleMcpPanelCommand: command } = await import('@/background/mcp')
	await command({ action: 'pair', code: '0123456789abcdef' })
	await sockets[0].receive({
		version: 1,
		type: 'connected',
		connectionId: 'profile',
		token: 'a'.repeat(64),
	})
	const selection = command({ action: 'select', tabId: 7 })
	await Promise.resolve()
	expect(get).toHaveBeenCalledOnce()
	const disconnect = command({ action: 'disconnect' })
	finishLookup({ id: 7, url: 'https://app.example.test/' })
	await Promise.all([selection, disconnect])
	expect(await command({ action: 'status' })).toMatchObject({
		status: 'disconnected',
		connectionId: undefined,
		tabId: undefined,
	})
	expect(vi.getTimerCount()).toBe(0)
})
