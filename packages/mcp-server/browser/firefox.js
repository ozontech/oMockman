import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import net from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'


import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { firefox } from 'playwright'

import { isolatedRuntime } from './isolated.js'

// Firefox's current RDP watcher API; exclusively a fresh synthetic profile.
const profile = await mkdtemp(join(tmpdir(), 'mockman-firefox-'))
const isolated = await isolatedRuntime(profile, 'firefox')
const fixture = createServer((_req, res) => {
	res.setHeader('Content-Type', 'application/json')
	res.end('{"items":["network"]}')
})
await new Promise((resolve) => fixture.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${fixture.address().port}`
const reserve = net.createServer()
await new Promise((resolve) => reserve.listen(0, '127.0.0.1', resolve))
const port = reserve.address().port
await new Promise((resolve) => reserve.close(resolve))
await writeFile(
	join(profile, 'user.js'),
	'user_pref("devtools.debugger.remote-enabled", true);\nuser_pref("devtools.chrome.enabled", true);\nuser_pref("devtools.debugger.prompt-connection", false);',
)
const child = spawn(
	firefox.executablePath(),
	[
		'--headless',
		'--no-remote',
		'--profile',
		profile,
		'--start-debugger-server',
		String(port),
		'about:blank',
	],
	{ stdio: 'ignore' },
)
const client = new Client({ name: 'firefox-test', version: '1' })
let socket,
	buffer = Buffer.alloc(0)
const pending = new Map(),
	messages = []
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function until(check) {
	for (let i = 0; i < 100; i++) {
		const result = await check()
		if (result) return result
		await delay(100)
	}
	throw new Error('Firefox state timeout')
}
function request(to, type, params = {}) {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			pending.delete(to)
			reject(new Error(`RDP timeout: ${type}`))
		}, 8000)
		pending.set(to, {
			resolve: (value) => {
				clearTimeout(timer)
				resolve(value)
			},
		})
		const text = JSON.stringify({ to, type, ...params })
		socket.write(`${Buffer.byteLength(text)}:${text}`)
	})
}
async function evaluate(actor, text) {
	const result = await request(actor, 'evaluateJSAsync', { text })
	const event = await until(() =>
		messages.find((item) => item.type === 'evaluationResult' && item.resultID === result.resultID),
	)
	if (event.hasException) throw new Error(`Firefox evaluation failed: ${event.exceptionMessage}`)
	return event.result
}
async function promise(actor, expression) {
	await evaluate(
		actor,
		`globalThis.__mockmanTest = undefined; Promise.resolve(${expression}).then(value => globalThis.__mockmanTest = JSON.stringify({value}), error => globalThis.__mockmanTest = JSON.stringify({error: String(error)})); void 0`,
	)
	const value = await until(async () => {
		const value = await evaluate(actor, 'globalThis.__mockmanTest')
		return typeof value === 'string' ? JSON.parse(value) : undefined
	})
	if (value.error) throw new Error(value.error)
	return value.value
}
async function watch(descriptor) {
	const watcher = await request(descriptor, 'getWatcher')
	await request(watcher.actor, 'watchTargets', { targetType: 'frame' })
	return watcher.actor
}
async function tool(name, args = {}) {
	const result = await client.callTool({ name, arguments: args })
	return JSON.parse(result.content[0].text)
}
const identity = () => {
	const now = Date.now()
	return { operationId: crypto.randomUUID(), issuedAt: now, expiresAt: now + 300000 }
}
try {
	await client.connect(
		new StdioClientTransport({
			command: process.execPath,
			args: [isolated.entrypoint],
			stderr: 'pipe',
		}),
	)
	await until(async () => {
		try {
			socket = await new Promise((resolve, reject) => {
				const s = net.connect(port, '127.0.0.1', () => resolve(s))
				s.on('error', reject)
			})
			return true
		} catch {
			return false
		}
	})
	socket.on('data', (data) => {
		buffer = Buffer.concat([buffer, data])
		while (true) {
			const colon = buffer.indexOf(':')
			if (colon < 0) return
			const length = Number(buffer.subarray(0, colon).toString())
			if (buffer.length < colon + 1 + length) return
			const message = JSON.parse(buffer.subarray(colon + 1, colon + 1 + length))
			buffer = buffer.subarray(colon + 1 + length)
			messages.push(message)
			// Unsolicited watcher events must never consume a command response.
			if (!message.type) {
				const item = pending.get(message.from)
				if (item) {
					pending.delete(message.from)
					item.resolve(message)
				}
			}
		}
	})
	await until(() => messages.some((message) => message.applicationType === 'browser'))
	const root = await request('root', 'getRoot')
	const extension = isolated.extensionPath
	const installed = await request(root.addonsActor, 'installTemporaryAddon', {
		addonPath: extension,
	})
	assert.ok(installed.addon)
	const addons = await request('root', 'listAddons')
	const addon = addons.addons.find((item) => item.name === 'Mockman')
	assert.deepEqual(addon.warnings, [])
	await watch(addon.actor)
	const bg = await until(
		() =>
			messages.find((item) => item.target?.url?.includes('_generated_background_page.html'))
				?.target,
	)
	await promise(
		bg.consoleActor,
		"new Promise(resolve => chrome.tabs.create({url:chrome.runtime.getURL('public/html/mcp.html')}, resolve))",
	)
	const setup = await until(
		() => messages.find((item) => item.target?.url?.includes('/public/html/mcp.html'))?.target,
	)
	const settings = (action, params = {}) =>
		promise(
			setup.consoleActor,
			`new Promise(resolve => chrome.runtime.sendMessage(${JSON.stringify({
				type: 'MOCKMAN_MCP',
				action,
				...params,
			})}, resolve))`,
		)
	const pairing = await tool('begin_pairing')
	await settings('pair', { code: pairing.code })
	const connection = await until(async () =>
		(await tool('list_connections')).find((item) => item.connected),
	)
	const tab = await promise(
		bg.consoleActor,
		`new Promise(resolve => chrome.tabs.create({url:${JSON.stringify(origin)}}, resolve))`,
	)
	await promise(
		bg.consoleActor,
		`new Promise(resolve => chrome.storage.local.get('mockman.extension.main.db', data => { const store=data['mockman.extension.main.db']??{}; chrome.storage.local.set({'mockman.extension.main.db':{...store,sitePermissions:{[${JSON.stringify(
			origin,
		)}]:{grantedOn:Date.now()}}}}, resolve) }))`,
	)
	await settings('select', { tabId: tab.id })
	await settings('allow_scenario_writes', { allowed: true })
	const call = (name, args = {}) => tool(name, { connectionId: connection.connectionId, ...args })
	const catalog = await call('get_scenario_catalog')
	const bundle = {
		scenarioKey: 'firefox',
		collection: { name: 'Firefox' },
		mocks: [
			{
				key: 'first',
				method: 'GET',
				url: `${origin}/api/tasks`,
				response: { status: 200, headers: [], body: '{"items":["mocked"]}' },
			},
		],
		scenario: {
			enabled: true,
			rules: [
				{ key: 'first', method: 'GET', url: `${origin}/api/tasks`, respond: { mockKey: 'first' } },
			],
		},
	}
	const saved = await call('apply_scenario_bundle', {
		...identity(),
		expectedRevision: catalog.libraryRevision,
		bundle,
	})
	assert.equal(saved.kind, 'saved', JSON.stringify(saved))
	const state = await until(async () => {
		const state = await call('get_scenario_state')
		return state.documentId ? state : null
	})
	const run = await call('start_session', {
		...identity(),
		documentId: state.documentId,
		collectionId: saved.collectionId,
		expectedRevision: saved.libraryRevision,
	})
	assert.equal(run.state, 'running', JSON.stringify(run))
	const tabs = await request('root', 'listTabs')
	const descriptor = tabs.tabs.find((item) => item.url?.startsWith(origin))
	assert.ok(descriptor)
	const target = await request(descriptor.actor, 'getTarget')
	const site = target.frame ?? target.target
	assert.ok(site?.consoleActor)
	const tasks = () =>
		promise(site.consoleActor, "fetch('/api/tasks').then(response=>response.json())")
	assert.deepEqual(await tasks(), { items: ['mocked'] })
	const stopped = await call('stop_session', {
		...identity(),
		documentId: state.documentId,
		runId: run.runId,
		expectedGeneration: 0,
	})
	assert.equal(stopped.state, 'stopped')
	assert.deepEqual(await tasks(), { items: ['network'] })
	await settings('allow_capture', { allowed: true })
	const capture = await call('start_capture', {
		durationMs: 10000,
		method: 'GET',
		path: '/api/tasks',
	})
	assert.equal(capture.kind, 'capture')
	let logs
	await until(async () => {
		await tasks()
		logs = await call('get_capture_requests', {
			captureId: capture.captureId,
			afterId: 0,
			limit: 10,
		})
		return logs.entries?.length
	})
	const detail = await call('get_request_details', {
		captureId: capture.captureId,
		requestId: logs.entries[0].id,
	})
	assert.deepEqual(JSON.parse(detail.entry.response.body), { items: ['network'] })
	await call('stop_capture', { captureId: capture.captureId })
	const history = await call('search_requests', { method: 'GET', path: '/api/tasks', limit: 5 })
	assert.ok(history.entries.length)
	const conditional = structuredClone(bundle)
	conditional.scenarioKey = 'conditions'
	conditional.scenario = { enabled: false, rules: [] }
	conditional.task = { key: 'TEST-2772', name: 'Firefox' }
	conditional.mocks = [{ key: 'matching', method: 'POST', url: `${origin}/api/tasks/:id`, when: { params: { id: '42' }, query: { mode: 'test' }, body: [{ path: ['active'], equals: true }] }, response: { status: 200, headers: [], body: '{"matched":true}' } }]
	const conditionalSaved = await call('apply_scenario_bundle', { ...identity(), expectedRevision: saved.libraryRevision, bundle: conditional })
	assert.equal(conditionalSaved.kind, 'saved', JSON.stringify(conditionalSaved))
	const conditionalRun = await call('start_session', { ...identity(), documentId: state.documentId, collectionId: conditionalSaved.collectionId, expectedRevision: conditionalSaved.libraryRevision })
	assert.equal(conditionalRun.state, 'running')
	const post = value => promise(site.consoleActor, `fetch('/api/tasks/42?mode=test',{method:'POST',body:JSON.stringify({active:${value}})}).then(r=>r.json())`)
	assert.deepEqual(await post(false), { items: ['network'] })
	const actualConditional = await post(true)
	assert.deepEqual(actualConditional, { matched: true }, 'a previous miss must not cache away body conditions')
	const refreshed = await call('refresh_session', { ...identity(), documentId: state.documentId, collectionId: conditionalSaved.collectionId, expectedRevision: conditionalSaved.libraryRevision, runId: conditionalRun.runId, expectedGeneration: 0, counters: 'preserve' })
	assert.equal(refreshed.generation, 1, JSON.stringify(refreshed))
	const version = await evaluate(site.consoleActor, 'navigator.userAgent')
	await settings('disconnect')
	assert.equal((await tool('list_connections')).length, 0)
	console.log(
		`${
			version.match(/Firefox\/[\d.]+/)?.[0]
		}: real extension pairing/settings API, save, run, conditional JSON matching, refresh, shared Logs, network fallback, capture and revoke passed in a temporary profile.`,
	)
} finally {
	await client.close()
	socket?.destroy()
	child.kill()
	await new Promise((resolve) => {
		if (child.exitCode !== null) resolve()
		else child.once('exit', resolve)
	})
	await new Promise((resolve) => fixture.close(resolve))
	await isolated.close()
	await rm(profile, { recursive: true, force: true })
}
