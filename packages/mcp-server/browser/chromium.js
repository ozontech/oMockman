import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'


import { validateResult } from '@mockman/automation-protocol'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { chromium } from 'playwright'

import { isolatedRuntime } from './isolated.js'

// Fresh temporary browser profile only. No access to the user's browser profile.
const directory = await mkdtemp(path.join(tmpdir(), 'mockman-mcp-chromium-'))
const isolated = await isolatedRuntime(directory, 'chrome')
const { extensionPath, entrypoint: testEntrypoint } = isolated
const mcp = new Client({ name: 'chromium-integration', version: '1' })
await mcp.connect(
	new StdioClientTransport({
		command: process.execPath,
		args: [testEntrypoint],
		stderr: 'pipe',
	}),
)
async function call(name, args = {}) {
	const response = await mcp.callTool({ name, arguments: args })
	try {
		return JSON.parse(response.content[0].text)
	} catch {
		throw new Error(response.content[0].text)
	}
}
const agent = {
	beginPairing: () => call('begin_pairing'),
	list: () => call('list_connections'),
	request: (connectionId, name, params = {}) => call(name, { connectionId, ...params }),
	close: () => mcp.close(),
}
let context
const fixtureHtml = await readFile(
	new URL('../../automation-protocol/fixture/index.html', import.meta.url),
)
const fixture = createServer((req, res) => {
	res.setHeader('Access-Control-Allow-Origin', '*')
	if (req.url === '/api/tasks') {
		res.setHeader('Content-Type', 'application/json')
		res.end(JSON.stringify({ items: ['network'] }))
	} else if (req.url?.startsWith('/api/')) {
		res.setHeader('Content-Type', 'application/json')
		res.end(
			JSON.stringify(
				req.url === '/api/configuration'
					? { features: { returns: false }, permissions: [] }
					: req.url === '/api/save'
					? { saved: true }
					: { items: [] },
			),
		)
	} else {
		res.setHeader('Content-Type', 'text/html; charset=utf-8')
		res.end(fixtureHtml)
	}
})
await new Promise((resolve) => fixture.listen(0, '127.0.0.1', resolve))
const siteOrigin = `http://127.0.0.1:${fixture.address().port}`
const apiOrigin = `http://localhost:${fixture.address().port}`
async function waitFor(check) {
	for (let attempt = 0; attempt < 100; attempt++) {
		if (await check()) return
		await delay(100)
	}
	throw new Error('Timed out waiting for browser state')
}
try {
	context = await chromium.launchPersistentContext(directory, {
		channel: 'chromium',
		headless: true,
		args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
	})
	const worker =
		context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker', { timeout: 10000 }))
	const workerUrl = new URL(worker.url())
	const origin = `${workerUrl.protocol}//${workerUrl.host}`
	const pairing = await agent.beginPairing()
	const page = await context.newPage()
	// The real popup link opens the dedicated setup page.
	await page.goto(`${origin}/public/html/popup.html`)
	const opened = context.waitForEvent('page')
	await page.getByRole('link', { name: 'MCP', exact: true }).click()
	const setup = await opened
	await setup.waitForLoadState()
	await setup.getByRole('textbox', { name: 'MCP code' }).fill(pairing.code)
	await setup.getByRole('button', { name: 'Pair', exact: true }).click()
	await waitFor(async () => (await agent.list()).some((entry) => entry.connected))
	const [connection] = await agent.list()
	const credentials = { connectionId: connection.connectionId }
	assert.equal(
		await setup.evaluate(() => chrome.runtime.sendMessage({ type: 'PANEL_QUERY_TABS', query: {} })),
		undefined,
		'MCP setup page cannot use the general privileged panel API',
	)
	const site = await context.newPage()
	await site.goto(siteOrigin)
	await site.evaluate(() => { document.title = 'Mockman tasks application' })
	await setup.getByRole('button', { name: 'Refresh tabs' }).click()
	await setup.waitForFunction(
		(expected) =>
			[...document.querySelectorAll('optgroup')].some((group) =>
				group.label === expected,
			),
		siteOrigin,
	)
	const selectedId = await setup
		.locator('optgroup option').first()
		.getAttribute('value')
	assert.match(await setup.locator('optgroup option').first().textContent(), /Mockman tasks application/)
	assert.doesNotMatch(await setup.locator('optgroup option').first().textContent(), /— \/ /)
	await waitFor(async () => !(await setup.getByLabel('MCP tab').isDisabled()))
	await setup.getByLabel('MCP tab').selectOption(selectedId)
	await setup.getByRole('alert').filter({ hasText: 'Allow this site' }).waitFor()
	assert.deepEqual(await agent.request(credentials.connectionId, 'list_tabs'), [])
	await setup.getByRole('button', { name: 'Allow site', exact: true }).click()
	await waitFor(async () => (await setup.getByRole('alert').count()) === 0)
	const sitePermissions = await worker.evaluate(async () =>
		(await chrome.storage.local.get('mockman.extension.main.db'))['mockman.extension.main.db'].sitePermissions)
	assert.ok(sitePermissions[siteOrigin], 'inline grant must use the shared site-permission library')
	await waitFor(
		async () => (await agent.request(credentials.connectionId, 'list_tabs')).length === 1,
	)
	assert.deepEqual(await agent.request(credentials.connectionId, 'list_tabs'), [
		{ tabId: Number(selectedId), origin: siteOrigin },
	])
	const tabDetails = setup.locator('details').filter({ has: setup.locator('summary').filter({ hasText: 'Selected tab' }) })
	await tabDetails.locator('summary').click()
	await waitFor(() => tabDetails.evaluate((element) => element.open && element.getAnimations().length === 0))
	await tabDetails.locator('summary').click()
	await waitFor(() => tabDetails.evaluate((element) => !element.open && element.getAnimations().length === 0))
	// Exercise the actual popup command path and persisted delivery receipts.
	await page.getByRole('switch').check()
	await waitFor(
		async () =>
			await setup.evaluate(async () => {
				const data = await chrome.storage.local.get('mockman.extension.main.db')
				return data['mockman.extension.main.db'].active === true
			}),
	)
	const issuedAt = Date.now()
	const operation = {
		type: 'LIBRARY_COMMAND',
		action: 'set_active',
		active: false,
		operationId: crypto.randomUUID(),
		issuedAt,
		expiresAt: issuedAt + 300000,
	}
	assert.equal(
		(await page.evaluate((command) => chrome.runtime.sendMessage(command), operation)).ok,
		true,
	)
	const beforeRestart = await setup.evaluate(
		async () =>
			(
				await chrome.storage.local.get('mockman.extension.main.db')
			)['mockman.extension.main.db'].revision,
	)
	assert.equal(beforeRestart, 3)
	assert.equal(
		await setup.evaluate((command) => chrome.runtime.sendMessage(command), operation),
		undefined,
		'MCP settings page cannot mutate the library',
	)
	const cdp = await context.newCDPSession(setup)
	await cdp.send('ServiceWorker.enable')
	await cdp.send('ServiceWorker.stopAllWorkers')
	await setup.evaluate(async () => {
		try {
			await chrome.runtime.sendMessage({ type: 'MOCKMAN_MCP', action: 'status' })
		} catch {
			/* Wake the worker; this page is not the privileged DevTools panel. */
		}
	})
	let connected = false
	for (let attempt = 0; attempt < 50; attempt++) {
		connected = (await agent.list()).some(
			(entry) => entry.connectionId === credentials.connectionId && entry.connected,
		)
		if (connected) break
		await delay(100)
	}
	assert.equal(connected, true, 'background resumes authenticated WebSocket after worker restart')
	const capabilities = await agent.request(credentials.connectionId, 'get_capabilities')
	assert.equal(capabilities.mutations, false)
	assert.deepEqual(await agent.request(credentials.connectionId, 'list_tabs'), [
		{ tabId: Number(selectedId), origin: siteOrigin },
	])
	assert.equal(
		(await page.evaluate((command) => chrome.runtime.sendMessage(command), operation)).ok,
		true,
	)
	const afterReplay = await setup.evaluate(
		async () =>
			(
				await chrome.storage.local.get('mockman.extension.main.db')
			)['mockman.extension.main.db'].revision,
	)
	assert.equal(
		afterReplay,
		beforeRestart,
		'redelivery after worker restart must not create another revision',
	)
	assert.equal(
		(await agent.request(credentials.connectionId, 'get_scenario_catalog')).code,
		'ACCESS_DENIED',
	)
	await setup.getByRole('checkbox', { name: 'Allow MCP scenario changes' }).click()
	await waitFor(
		async () => (await agent.request(credentials.connectionId, 'get_capabilities')).mutations,
	)
	const catalog = await agent.request(credentials.connectionId, 'get_scenario_catalog')
	const bundle = JSON.parse(
		await readFile(
			new URL('../../automation-protocol/examples/sequence.json', import.meta.url),
			'utf8',
		),
	)
	for (const item of [...bundle.mocks, ...bundle.scenario.rules])
		item.url = `${apiOrigin}/api/tasks`
	bundle.mocks[0].response.body = JSON.stringify({
		items: [{ id: 'task-1' }],
		padding: 'x'.repeat(70 * 1024),
	})
	assert.equal(
		(await agent.request(credentials.connectionId, 'validate_scenario_bundle', { bundle })).kind,
		'valid',
	)
	const timestamp = Date.now()
	const bundleOperation = {
		operationId: crypto.randomUUID(),
		issuedAt: timestamp,
		expiresAt: timestamp + 300000,
		expectedRevision: catalog.libraryRevision,
		bundle,
	}
	const saved = await agent.request(
		credentials.connectionId,
		'apply_scenario_bundle',
		bundleOperation,
	)
	assert.equal(saved.kind, 'saved', JSON.stringify(saved))
	assert.equal(saved.applied, false)
	assert.equal(validateResult(saved).valid, true, 'saved response matches published schema')
	const readback = await agent.request(credentials.connectionId, 'get_scenario', {
		collectionId: saved.collectionId,
	})
	assert.equal(validateResult(readback).valid, true, 'read result matches schema')
	assert.deepEqual(
		{
			...readback.bundle,
			mocks: [...readback.bundle.mocks].sort((a, b) => a.key.localeCompare(b.key)),
		},
		{
			...bundle,
			mocks: bundle.mocks
				.map((mock) => ({ ...mock, name: mock.name ?? mock.key }))
				.sort((a, b) => a.key.localeCompare(b.key)),
		},
	)
	assert.equal(readback.canApplyBundle, true)
	assert.equal(readback.libraryRevision, saved.libraryRevision)
	const stored = await setup.evaluate(
		async () =>
			(
				await chrome.storage.local.get('mockman.extension.main.db')
			)['mockman.extension.main.db'],
	)
	assert.equal(stored.collectionTree.nodes[saved.collectionId].active, false)
	assert.equal(stored.mocks.length, 2)
	assert.equal(
		stored.collectionTree.nodes[saved.collectionId].scenario.rules[0].respond.mockId,
		saved.mockIds.first,
	)
	assert.deepEqual(
		await agent.request(credentials.connectionId, 'apply_scenario_bundle', bundleOperation),
		saved,
	)
	const update = structuredClone(bundleOperation)
	update.operationId = crypto.randomUUID()
	update.bundle.mocks[0].response.body = '{"items":[{"id":"updated"}]}'
	assert.equal(
		(await agent.request(credentials.connectionId, 'apply_scenario_bundle', update)).code,
		'REVISION_CONFLICT',
	)
	update.expectedRevision = saved.libraryRevision
	const updated = await agent.request(credentials.connectionId, 'apply_scenario_bundle', update)
	assert.equal(updated.collectionId, saved.collectionId)
	assert.deepEqual(updated.mockIds, saved.mockIds)
	await cdp.send('ServiceWorker.stopAllWorkers')
	await setup.evaluate(async () => {
		try {
			await chrome.runtime.sendMessage({ type: 'MOCKMAN_MCP', action: 'status' })
		} catch {
			/* worker restart */
		}
	})
	await waitFor(async () => (await agent.list()).some((entry) => entry.connected))
	assert.deepEqual(
		await agent.request(credentials.connectionId, 'apply_scenario_bundle', update),
		updated,
	)
	const sibling = await context.newPage()
	await sibling.goto(siteOrigin)
	const state = await agent.request(credentials.connectionId, 'get_scenario_state')
	assert.equal(state.state, 'stopped', JSON.stringify(state))
	const runIdentity = () => {
		const now = Date.now()
		return { operationId: crypto.randomUUID(), issuedAt: now, expiresAt: now + 300000 }
	}
	const start = {
		...runIdentity(),
		documentId: state.documentId,
		collectionId: saved.collectionId,
		expectedRevision: updated.libraryRevision,
	}
	const running = await agent.request(credentials.connectionId, 'start_session', start)
	assert.equal(validateResult(running).valid, true, 'runtime response matches published schema')
	assert.equal(running.state, 'running', JSON.stringify(running))
	const tasks = (target = site) => target.evaluate(async (url) => (await fetch(url)).json(), `${apiOrigin}/api/tasks`)
	assert.deepEqual(await tasks(), { items: [{ id: 'updated' }] })
	assert.deepEqual(await tasks(), { items: [] })
	assert.deepEqual(await tasks(), { items: [] })
	assert.deepEqual(await tasks(sibling), { items: ['network'] })
	assert.equal(
		(await agent.request(credentials.connectionId, 'get_scenario_catalog')).libraryRevision,
		updated.libraryRevision,
	)
	const logs = await agent.request(credentials.connectionId, 'get_request_logs', {
		documentId: state.documentId,
		runId: running.runId,
		expectedGeneration: 0,
	})
	assert.equal(validateResult(logs).valid, true, 'diagnostics match published schema')
	assert.deepEqual(
		logs.entries.map((entry) => entry.callNumber),
		[1, 2, 3],
	)
	assert.ok(logs.entries.every((entry) => entry.ruleId && entry.mockId && entry.outcome === 'mock'))
	const reset = {
		...runIdentity(),
		documentId: state.documentId,
		runId: running.runId,
		expectedGeneration: 0,
	}
	const resetResult = await agent.request(credentials.connectionId, 'reset_scenario', reset)
	assert.equal(resetResult.generation, 1)
	assert.deepEqual(await tasks(), { items: [{ id: 'updated' }] })
	assert.equal(
		(await agent.request(credentials.connectionId, 'reset_scenario', reset)).replayed,
		true,
	)
	assert.deepEqual(await tasks(), { items: [] }, 'duplicate reset must not restart the sequence')
	const stop = {
		...runIdentity(),
		documentId: state.documentId,
		runId: running.runId,
		expectedGeneration: 1,
	}
	assert.equal(
		(await agent.request(credentials.connectionId, 'stop_session', stop)).state,
		'stopped',
	)
	assert.deepEqual(await tasks(), { items: ['network'] })
	const restarted = await agent.request(credentials.connectionId, 'start_session', {
		...start,
		...runIdentity(),
	})
	assert.equal(restarted.state, 'running')
	await site.reload()
	await waitFor(
		async () =>
			(await agent.request(credentials.connectionId, 'get_scenario_state')).documentId !==
			state.documentId,
	)
	assert.deepEqual(
		await tasks(),
		{ items: ['network'] },
		'reload must not implicitly restore a stale run',
	)
	assert.equal(
		(await agent.request(credentials.connectionId, 'reset_scenario', reset)).code,
		'DOCUMENT_CHANGED',
	)
	const privateBundle = structuredClone(bundle)
	privateBundle.scenarioKey = 'patch-private'
	privateBundle.mocks[0].response.headers.push({ name: 'Set-Cookie', value: 'synthetic-cookie' })
	privateBundle.mocks[0].response.body = '{"token":"synthetic-private-value","items":[]}'
	const privateSaved = await agent.request(credentials.connectionId, 'apply_scenario_bundle', {
		...runIdentity(),
		expectedRevision: updated.libraryRevision,
		bundle: privateBundle,
	})
	assert.equal(privateSaved.kind, 'saved')
	const privateView = await agent.request(credentials.connectionId, 'get_scenario', {
		collectionId: privateSaved.collectionId,
	})
	assert.equal(privateView.redacted, true)
	assert.equal(JSON.stringify(privateView).includes('synthetic-private-value'), false)
	const patch = {
		...runIdentity(),
		collectionId: privateSaved.collectionId,
		expectedRevision: privateSaved.libraryRevision,
		patch: {
			name: 'Renamed',
			scenarioEnabled: false,
			ruleOrder: [...privateView.ruleOrder].reverse(),
			headers: [
				{ mockKey: 'first', name: 'X-Scenario', value: 'patched' },
				{ mockKey: 'first', name: 'content-type', value: 'application/json; charset=utf-8' },
			],
			delays: [{ mockKey: 'first', delayMs: 25 }],
			bodyFields: [{ mockKey: 'first', path: ['items'], valueJson: '[{"id":"patched"}]' }],
		},
	}
	const patched = await agent.request(credentials.connectionId, 'patch_scenario', patch)
	assert.equal(patched.kind, 'saved', JSON.stringify(patched))
	assert.equal(validateResult(patched).valid, true)
	assert.deepEqual(await agent.request(credentials.connectionId, 'patch_scenario', patch), patched)
	const preserved = await setup.evaluate(async (id) => {
		const library = (await chrome.storage.local.get('mockman.extension.main.db'))[
			'mockman.extension.main.db'
		]
		return { mock: library.mocks.find((mock) => mock.id === id), revision: library.revision }
	}, privateSaved.mockIds.first)
	assert.deepEqual(JSON.parse(preserved.mock.response), {
		token: 'synthetic-private-value',
		items: [{ id: 'patched' }],
	})
	assert.equal(preserved.mock.delay, 25)
	assert.ok(
		preserved.mock.headers.some(
			(header) => header.name === 'Set-Cookie' && header.value === 'synthetic-cookie',
		),
	)
	assert.ok(
		preserved.mock.headers.some(
			(header) => header.name === 'X-Scenario' && header.value === 'patched',
		),
	)
	assert.equal(
		preserved.mock.headers.filter((header) => header.name.toLowerCase() === 'content-type').length,
		1,
	)
	assert.equal(preserved.revision, patched.libraryRevision)
	const reordered = await agent.request(credentials.connectionId, 'get_scenario', {
		collectionId: privateSaved.collectionId,
	})
	assert.equal(validateResult(reordered).valid, true)
	assert.deepEqual(reordered.ruleOrder, [...privateView.ruleOrder].reverse())
	assert.equal(reordered.bundle.scenario.enabled, false)
	const currentDocument = await agent.request(credentials.connectionId, 'get_scenario_state')
	const privateStart = {
		...runIdentity(),
		documentId: currentDocument.documentId,
		collectionId: privateSaved.collectionId,
		expectedRevision: patched.libraryRevision,
	}
	const ordinaryRun = await agent.request(credentials.connectionId, 'start_session', privateStart)
	assert.equal(ordinaryRun.state, 'running')
	const ordinaryAnswer = await tasks()
	assert.deepEqual(await tasks(), ordinaryAnswer, 'disabled sequence repeats the ordinary mock')
	await agent.request(credentials.connectionId, 'stop_session', {
		...runIdentity(),
		documentId: currentDocument.documentId,
		runId: ordinaryRun.runId,
		expectedGeneration: 0,
	})
	const enabled = await agent.request(credentials.connectionId, 'patch_scenario', {
		...runIdentity(),
		collectionId: privateSaved.collectionId,
		expectedRevision: patched.libraryRevision,
		patch: { scenarioEnabled: true },
	})
	assert.equal(enabled.kind, 'saved')
	const orderedRun = await agent.request(credentials.connectionId, 'start_session', {
		...privateStart,
		...runIdentity(),
		expectedRevision: enabled.libraryRevision,
	})
	assert.equal(orderedRun.state, 'running')
	assert.deepEqual(await tasks(), { items: [] }, 'reordered empty response must be first')
	assert.deepEqual(
		(await tasks()).items,
		[{ id: 'patched' }],
		'reordered patched response must be second',
	)
	const networkPatch = {
		...runIdentity(),
		collectionId: privateSaved.collectionId,
		expectedRevision: enabled.libraryRevision,
		patch: { ruleResponses: [{ ruleId: reordered.ruleOrder[1], respond: { network: true } }] },
	}
	const networkSaved = await agent.request(credentials.connectionId, 'patch_scenario', networkPatch)
	assert.equal(networkSaved.kind, 'saved')
	assert.deepEqual(
		await agent.request(credentials.connectionId, 'patch_scenario', networkPatch),
		networkSaved,
	)
	assert.deepEqual(
		(await tasks()).items,
		[{ id: 'patched' }],
		'saving response edits must not alter the active snapshot',
	)
	assert.equal(
		(
			await agent.request(credentials.connectionId, 'stop_session', {
				...runIdentity(),
				documentId: currentDocument.documentId,
				runId: orderedRun.runId,
				expectedGeneration: 0,
			})
		).state,
		'stopped',
	)
	const networkRun = await agent.request(credentials.connectionId, 'start_session', {
		...privateStart,
		...runIdentity(),
		expectedRevision: networkSaved.libraryRevision,
	})
	assert.equal(networkRun.state, 'running')
	assert.deepEqual(await tasks(), { items: [] })
	assert.deepEqual(
		await tasks(),
		{ items: ['network'] },
		'edited rule must pass the second request through',
	)
	const networkLogs = await agent.request(credentials.connectionId, 'get_request_logs', {
		documentId: currentDocument.documentId,
		runId: networkRun.runId,
		expectedGeneration: 0,
	})
	assert.deepEqual(
		networkLogs.entries.map((entry) => entry.outcome),
		['mock', 'network'],
	)
	assert.equal(
		(
			await agent.request(credentials.connectionId, 'stop_session', {
				...runIdentity(),
				documentId: currentDocument.documentId,
				runId: networkRun.runId,
				expectedGeneration: 0,
			})
		).state,
		'stopped',
	)
	assert.equal(
		(
			await agent.request(credentials.connectionId, 'start_capture', {
				durationMs: 30000,
				method: 'GET',
				path: '/api/tasks',
			})
		).code,
		'ACCESS_DENIED',
	)
	await setup.getByRole('checkbox', { name: 'Allow MCP traffic capture' }).click()
	await waitFor(
		async () => (await agent.request(credentials.connectionId, 'get_capabilities')).capture,
	)
	const capture = await agent.request(credentials.connectionId, 'start_capture', {
		durationMs: 30000,
		method: 'GET',
		path: '/api/tasks',
	})
	assert.equal(capture.kind, 'capture', JSON.stringify(capture))
	let captured
	await waitFor(async () => {
		await tasks()
		captured = await agent.request(credentials.connectionId, 'get_capture_requests', {
			captureId: capture.captureId,
			afterId: 0,
			limit: 50,
		})
		return captured.entries?.length > 0
	})
	const detail = await agent.request(credentials.connectionId, 'get_request_details', {
		captureId: capture.captureId,
		requestId: captured.entries[0].id,
	})
	assert.equal(detail.kind, 'request_details')
	assert.deepEqual(JSON.parse(detail.entry.response.body), { items: ['network'] })
	assert.equal(
		(
			await agent.request(credentials.connectionId, 'stop_capture', {
				captureId: capture.captureId,
			})
		).kind,
		'capture_stopped',
	)
	const capturedBody = JSON.parse(detail.entry.response.body)
	capturedBody.items = ['from-capture']
	const capturedBundle = {
		scenarioKey: 'from-capture',
		collection: { name: 'From captured response' },
		mocks: [
			{
				key: 'response',
				method: 'GET',
				url: detail.entry.request.url,
				response: {
					status: detail.entry.response.status,
					headers: [{ name: 'Content-Type', value: 'application/json' }],
					body: JSON.stringify(capturedBody),
				},
			},
		],
		scenario: {
			enabled: true,
			rules: [
				{
					key: 'response',
					method: 'GET',
					url: detail.entry.request.url,
					respond: { mockKey: 'response' },
				},
			],
		},
	}
	const capturedSaved = await agent.request(credentials.connectionId, 'apply_scenario_bundle', {
		...runIdentity(),
		expectedRevision: networkSaved.libraryRevision,
		bundle: capturedBundle,
	})
	assert.equal(capturedSaved.kind, 'saved')
	const captureRun = await agent.request(credentials.connectionId, 'start_session', {
		...runIdentity(),
		documentId: currentDocument.documentId,
		collectionId: capturedSaved.collectionId,
		expectedRevision: capturedSaved.libraryRevision,
	})
	assert.equal(captureRun.state, 'running')
	assert.deepEqual(
		await tasks(),
		{ items: ['from-capture'] },
		'traffic-derived mock must reproduce the requested response',
	)
	await agent.request(credentials.connectionId, 'stop_session', {
		...runIdentity(),
		documentId: currentDocument.documentId,
		runId: captureRun.runId,
		expectedGeneration: 0,
	})
	const deleteCommand = {
		...runIdentity(),
		collectionId: privateSaved.collectionId,
		expectedRevision: capturedSaved.libraryRevision,
	}
	const deleted = await agent.request(credentials.connectionId, 'delete_scenario', deleteCommand)
	assert.equal(deleted.kind, 'deleted', JSON.stringify(deleted))
	assert.deepEqual(
		await agent.request(credentials.connectionId, 'delete_scenario', deleteCommand),
		deleted,
	)
	assert.equal(
		(
			await agent.request(credentials.connectionId, 'get_scenario', {
				collectionId: privateSaved.collectionId,
			})
		).code,
		'ACCESS_DENIED',
	)
	let uiRevision = deleted.libraryRevision
	for (const example of ['modal', 'section', 'save-error']) {
		const uiBundle = JSON.parse(
			await readFile(
				new URL(`../../automation-protocol/examples/${example}.json`, import.meta.url),
				'utf8',
			),
		)
		for (const entry of [...uiBundle.mocks, ...uiBundle.scenario.rules])
			entry.url = siteOrigin + new URL(entry.url).pathname
		const uiSaved = await agent.request(credentials.connectionId, 'apply_scenario_bundle', {
			...runIdentity(),
			expectedRevision: uiRevision,
			bundle: uiBundle,
		})
		assert.equal(uiSaved.kind, 'saved')
		uiRevision = uiSaved.libraryRevision
		const uiState = await agent.request(credentials.connectionId, 'get_scenario_state')
		const uiRun = await agent.request(credentials.connectionId, 'start_session', {
			...runIdentity(),
			documentId: uiState.documentId,
			collectionId: uiSaved.collectionId,
			expectedRevision: uiRevision,
		})
		assert.equal(uiRun.state, 'running')
		if (example === 'modal') {
			await site.locator('#items').click()
			await waitFor(async () =>
				(await site.locator('#item-list').textContent()).includes('Просрочен'),
			)
			assert.equal(await site.locator('#modal').isVisible(), true)
			await site.locator('#modal button').click()
		} else if (example === 'section') {
			await site.locator('#configuration').click()
			await waitFor(() => site.locator('#returns').isVisible())
		} else {
			await site.locator('#save').click()
			await waitFor(async () =>
				(await site.locator('#status').textContent()).includes('Synthetic failure'),
			)
		}
		await agent.request(credentials.connectionId, 'stop_session', {
			...runIdentity(),
			documentId: uiState.documentId,
			runId: uiRun.runId,
			expectedGeneration: 0,
		})
	}
	// Task hierarchy, conditional ordinary mocks, refresh and portable import/export.
	const conditionalBundle = {
		scenarioKey: 'conditional', task: { key: 'TEST-2772', name: 'Conditional UI' }, collection: { name: 'Filtered tasks' },
		mocks: [
			{ key: 'fallback', method: 'POST', url: `${siteOrigin}/api/conditional/:id`, response: { status: 200, headers: [], body: '{"kind":"fallback"}' } },
			{ key: 'filtered', method: 'POST', url: `${siteOrigin}/api/conditional/:id`, priority: 10, when: { query: { mode: 'test' }, params: { id: '42' }, body: [{ path: ['active'], equals: true }] }, response: { status: 200, headers: [], body: '{"kind":"filtered"}' } },
		], scenario: { enabled: false, rules: [] },
	}
	const conditionalSaved = await agent.request(credentials.connectionId, 'apply_scenario_bundle', { ...runIdentity(), expectedRevision: uiRevision, bundle: conditionalBundle })
	assert.equal(conditionalSaved.kind, 'saved', JSON.stringify(conditionalSaved))
	uiRevision = conditionalSaved.libraryRevision
	const conditionalState = await agent.request(credentials.connectionId, 'get_scenario_state')
	const conditionalRun = await agent.request(credentials.connectionId, 'start_session', { ...runIdentity(), documentId: conditionalState.documentId, collectionId: conditionalSaved.collectionId, expectedRevision: uiRevision })
	assert.equal(conditionalRun.state, 'running')
	const conditionalRequest = (active, xhr = false) => site.evaluate(async ({ active, xhr }) => {
		if (!xhr) return (await fetch('/api/conditional/42?mode=test', { method: 'POST', body: JSON.stringify({ active }) })).json()
		return new Promise((resolve, reject) => {
			const request = new XMLHttpRequest()
			request.open('POST', '/api/conditional/42?mode=test')
			request.onload = () => resolve(JSON.parse(request.responseText))
			request.onerror = reject
			request.send(JSON.stringify({ active }))
		})
	}, { active, xhr })
	assert.deepEqual(await conditionalRequest(false), { kind: 'fallback' })
	assert.deepEqual(await conditionalRequest(true), { kind: 'filtered' })
	assert.deepEqual(await conditionalRequest(true, true), { kind: 'filtered' })
	const patchedConditional = await agent.request(credentials.connectionId, 'patch_scenario', { ...runIdentity(), collectionId: conditionalSaved.collectionId, expectedRevision: uiRevision, patch: { bodyFields: [{ mockKey: 'filtered', path: ['kind'], valueJson: '"updated"' }] } })
	uiRevision = patchedConditional.libraryRevision
	const refreshed = await agent.request(credentials.connectionId, 'refresh_session', { ...runIdentity(), documentId: conditionalState.documentId, collectionId: conditionalSaved.collectionId, expectedRevision: uiRevision, runId: conditionalRun.runId, expectedGeneration: 0, counters: 'preserve' })
	assert.equal(refreshed.generation, 1, JSON.stringify(refreshed))
	assert.deepEqual(await conditionalRequest(true), { kind: 'updated' })
	assert.deepEqual(refreshed.counts, {})
	await agent.request(credentials.connectionId, 'stop_session', { ...runIdentity(), documentId: conditionalState.documentId, runId: conditionalRun.runId, expectedGeneration: 1 })
	const taskCatalog = await agent.request(credentials.connectionId, 'get_scenario_catalog')
	const parent = taskCatalog.scenarios.find(item => item.taskKey === 'TEST-2772')
	assert.ok(parent)
	assert.equal(taskCatalog.scenarios.find(item => item.collectionId === conditionalSaved.collectionId).parentId, parent.collectionId)
	const exported = await agent.request(credentials.connectionId, 'export_collections', { collectionId: parent.collectionId })
	assert.equal(exported.kind, 'collection_archive', JSON.stringify(exported))
	const preview = await agent.request(credentials.connectionId, 'preview_import', { archive: exported.archive, mode: 'reject', prefix: '' })
	assert.equal(preview.canImport, false)
	const copied = await agent.request(credentials.connectionId, 'import_collections', { ...runIdentity(), expectedRevision: uiRevision, archive: exported.archive, mode: 'reject', prefix: 'copy/' })
	assert.equal(copied.kind, 'saved', JSON.stringify(copied))
	assert.notEqual(copied.collectionId, conditionalSaved.collectionId)
	uiRevision = copied.libraryRevision
	const history = await agent.request(credentials.connectionId, 'search_requests', { method: 'GET', path: '', limit: 5 })
	assert.equal(history.kind, 'traffic_history', JSON.stringify(history))
	assert.ok(history.entries.length, 'recorded Logs remain searchable without a new capture')
	const firstTabState = await agent.request(credentials.connectionId, 'get_scenario_state')
	const firstTabRun = await agent.request(credentials.connectionId, 'start_session', {
		...runIdentity(),
		documentId: firstTabState.documentId,
		collectionId: saved.collectionId,
		expectedRevision: uiRevision,
	})
	assert.equal(firstTabRun.state, 'running')
	await sibling.evaluate(() => {
		document.title = 'Mockman second test tab'
	})
	const siblingId = await setup.evaluate(
		async () =>
			(await chrome.tabs.query({})).find((tab) => tab.title === 'Mockman second test tab').id,
	)
	await setup.getByRole('checkbox', { name: 'Follow active tab', exact: true }).click()
	await waitFor(() => setup.getByRole('checkbox', { name: 'Follow active tab', exact: true }).isChecked())
	await sibling.bringToFront()
	await waitFor(async () => (await setup.getByLabel('MCP tab').inputValue()) === String(siblingId))
	assert.equal((await agent.request(credentials.connectionId, 'get_scenario_state', { tabId: siblingId })).state, 'stopped')
	assert.equal((await agent.request(credentials.connectionId, 'get_scenario_state', { tabId: Number(selectedId) })).runId, firstTabRun.runId)
	assert.equal((await agent.request(credentials.connectionId, 'list_tabs')).length, 2)
	const secondBundle = structuredClone(bundle)
	secondBundle.scenarioKey = 'second-tab'
	for (const mock of secondBundle.mocks) mock.response.delayMs = 250
	secondBundle.mocks[0].response.body = '{"items":["second-tab"]}'
	const secondSaved = await agent.request(credentials.connectionId, 'apply_scenario_bundle', {
		...runIdentity(),
		expectedRevision: uiRevision,
		bundle: secondBundle,
	})
	assert.equal(secondSaved.kind, 'saved')
	const secondState = await agent.request(credentials.connectionId, 'get_scenario_state')
	const secondRun = await agent.request(credentials.connectionId, 'start_session', {
		...runIdentity(),
		documentId: secondState.documentId,
		collectionId: secondSaved.collectionId,
		expectedRevision: secondSaved.libraryRevision,
		variables: { TEST: 'second' },
	})
	assert.equal(secondRun.state, 'running')
	assert.deepEqual(await tasks(), { items: [{ id: 'updated' }] })
	assert.deepEqual(
		await tasks(sibling),
		{ items: ['second-tab'] },
	)
	await agent.request(credentials.connectionId, 'reset_scenario', {
		...runIdentity(),
		tabId: Number(selectedId),
		documentId: firstTabState.documentId,
		runId: firstTabRun.runId,
		expectedGeneration: 0,
	})
	assert.deepEqual(await tasks(), { items: [{ id: 'updated' }] })
	assert.deepEqual(
		await tasks(sibling),
		{ items: [] },
		'reset on first tab must not reset second tab',
	)
	const inFlight = tasks(sibling)
	await waitFor(async () => {
		const state = await agent.request(credentials.connectionId, 'get_scenario_state')
		return Object.values(state.counts ?? {}).some((count) => count >= 3)
	})
	await agent.request(credentials.connectionId, 'stop_session', {
		...runIdentity(),
		documentId: secondState.documentId,
		runId: secondRun.runId,
		expectedGeneration: 0,
	})
	assert.deepEqual(
		await inFlight,
		{ items: [] },
		'already selected delayed response completes with the old snapshot',
	)
	await setup.getByLabel('MCP tab').selectOption(String(selectedId))
	await waitFor(async () => !(await setup.getByRole('checkbox', { name: 'Follow active tab', exact: true }).isChecked()))
	await waitFor(async () => {
		const tabs = await agent.request(credentials.connectionId, 'list_tabs')
		return tabs.length === 1 && tabs[0].tabId === Number(selectedId)
	})
	assert.deepEqual(
		await tasks(sibling),
		{ items: ['network'] },
	)
	// A separate real browser profile and a separate stdio client cannot see each other's grants.
	const otherClient = new Client({ name: 'second-profile', version: '1' })
	let otherContext
	try {
		await otherClient.connect(
			new StdioClientTransport({
				command: process.execPath,
				args: [testEntrypoint],
				stderr: 'pipe',
			}),
		)
		const otherCall = async (name, args = {}) =>
			JSON.parse((await otherClient.callTool({ name, arguments: args })).content[0].text)
		const otherCode = await otherCall('begin_pairing')
		otherContext = await chromium.launchPersistentContext(path.join(directory, 'second-profile'), {
			channel: 'chromium',
			headless: true,
			args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
		})
		const otherWorker =
			otherContext.serviceWorkers()[0] ?? (await otherContext.waitForEvent('serviceworker'))
		const workerBase = new URL(otherWorker.url())
		const otherSetup = await otherContext.newPage()
		await otherSetup.goto(`${workerBase.protocol}//${workerBase.host}/public/html/mcp.html`)
		await otherSetup.getByRole('textbox', { name: 'MCP code' }).fill(otherCode.code)
		await otherSetup.getByRole('button', { name: 'Pair', exact: true }).click()
		const otherConnection = await (async () => {
			let entry
			await waitFor(async () => {
				entry = (await otherCall('list_connections')).find((item) => item.connected)
				return !!entry
			})
			return entry
		})()
		assert.equal((await agent.list()).length, 1)
		assert.equal((await otherCall('list_connections')).length, 1)
		assert.notEqual(otherConnection.connectionId, credentials.connectionId)
		const forbidden = await otherClient.callTool({
			name: 'get_capabilities',
			arguments: { connectionId: credentials.connectionId },
		})
		assert.equal(forbidden.isError, true)
		await otherSetup.getByRole('button', { name: 'Disconnect and revoke access' }).click()
		await waitFor(async () => (await otherCall('list_connections')).length === 0)
		assert.equal(
			(await agent.request(credentials.connectionId, 'get_capabilities')).protocolVersion,
			1,
		)
	} finally {
		await otherClient.close()
		await otherContext?.close()
	}
	await setup.close()
	await page.close()
	assert.equal(
		(await agent.request(credentials.connectionId, 'get_capabilities')).protocolVersion,
		1,
	)
	await site.goto(`http://localhost:${fixture.address().port}`)
	assert.deepEqual(
		await agent.request(credentials.connectionId, 'list_tabs'),
		[],
		'origin change removes access',
	)
	assert.equal(
		(await agent.request(credentials.connectionId, 'apply_scenario_bundle', bundleOperation)).code,
		'ACCESS_DENIED',
	)
	const revoke = await context.newPage()
	await revoke.goto(`${origin}/public/html/mcp.html`)
	await revoke.getByRole('button', { name: 'Disconnect and revoke access' }).click()
	await waitFor(async () => (await agent.list()).length === 0)
	console.log(
		`Chromium ${context
			.browser()
			.version()}: MCP bundle + isolated run: sequence, conditional fetch/XHR, refresh, task archive import/export, shared Logs, reset/retry, stop, sibling isolation and reload passed`,
	)
} finally {
	await agent.close()
	await context?.close()
	await new Promise((resolve) => fixture.close(resolve))
	await isolated.close()
	await rm(directory, { recursive: true, force: true })
}
