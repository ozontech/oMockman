import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { runTool } from '../tools.js'

const load = async () =>
	JSON.parse(
		await readFile(
			new URL('../../automation-protocol/examples/sequence.json', import.meta.url),
			'utf8',
		),
	)
test('bundle tool forwards identity and data without stamping a new operation on retries', async () => {
	const bundle = await load()
	const now = Date.now()
	const args = {
		connectionId: 'profile',
		operationId: crypto.randomUUID(),
		issuedAt: now,
		expiresAt: now + 300000,
		expectedRevision: 4,
		bundle,
	}
	const calls = []
	const bridge = {
		clientSessionId: 'agent',
		request: async (...values) => {
			calls.push(values)
			return { kind: 'saved' }
		},
	}
	await runTool(bridge, 'apply_scenario_bundle', args)
	await runTool(bridge, 'apply_scenario_bundle', args)
	assert.deepEqual(calls[0], calls[1])
	assert.equal(calls[0][2].operationId, args.operationId)
})
test('invalid references, executable fields and oversized input never reach the bridge', async () => {
	let calls = 0
	const bridge = {
		request: async () => {
			calls++
		},
	}
	const bundle = await load()
	bundle.scenario.rules[0].respond.mockKey = 'missing'
	await assert.rejects(
		runTool(bridge, 'validate_scenario_bundle', { connectionId: 'profile', bundle }),
		/INVALID_SCENARIO/,
	)
	bundle.scenario.rules[0].respond.mockKey = 'first'
	bundle.mocks[0].action = 'execute()'
	await assert.rejects(
		runTool(bridge, 'validate_scenario_bundle', { connectionId: 'profile', bundle }),
		/INVALID_SCENARIO/,
	)
	delete bundle.mocks[0].action
	bundle.mocks[0].response.body = 'a'.repeat(2 * 1024 * 1024)
	await assert.rejects(
		runTool(bridge, 'validate_scenario_bundle', { connectionId: 'profile', bundle }),
		/LIMIT_EXCEEDED/,
	)
	assert.equal(calls, 0)
})

test('patch tool validates fields before transport and preserves mutation identity', async () => {
	const calls = []
	const bridge = {
		clientSessionId: 'agent',
		request: async (...args) => {
			calls.push(args)
			return {}
		},
	}
	const now = Date.now()
	const args = {
		connectionId: 'profile',
		collectionId: 'collection',
		operationId: crypto.randomUUID(),
		issuedAt: now,
		expiresAt: now + 300000,
		expectedRevision: 1,
		patch: { delays: [{ mockKey: 'first', delayMs: 60000 }] },
	}
	await runTool(bridge, 'patch_scenario', args)
	assert.equal(calls[0][2].operationId, args.operationId)
	for (const patch of [
		{},
		{ body: 'not allowed' },
		{ delays: [{ mockKey: 'first', delayMs: 60001 }] },
	]) {
		await assert.rejects(runTool(bridge, 'patch_scenario', { ...args, patch }), /INVALID_ARGUMENTS/)
	}
	assert.equal(calls.length, 1)
})

test('body patches preserve explicit paths and reject root replacement at the tool boundary', async () => {
	const calls = []
	const bridge = {
		clientSessionId: 'agent',
		request: async (...args) => {
			calls.push(args)
			return {}
		},
	}
	const now = Date.now()
	const args = {
		connectionId: 'profile',
		collectionId: 'collection',
		operationId: crypto.randomUUID(),
		issuedAt: now,
		expiresAt: now + 300000,
		expectedRevision: 1,
		patch: { bodyFields: [{ mockKey: 'first', path: ['items', '0', 'id'], valueJson: '2' }] },
	}
	await runTool(bridge, 'patch_scenario', args)
	assert.deepEqual(calls[0][2].patch, args.patch)
	args.patch.bodyFields[0].path = []
	await assert.rejects(runTool(bridge, 'patch_scenario', args), /INVALID_ARGUMENTS/)
	assert.equal(calls.length, 1)
})

test('header patches reject injection and ambiguous payloads before transport', async () => {
	const calls = []
	const bridge = {
		clientSessionId: 'agent',
		request: async (...args) => {
			calls.push(args)
			return {}
		},
	}
	const now = Date.now()
	const args = {
		connectionId: 'profile',
		collectionId: 'collection',
		operationId: crypto.randomUUID(),
		issuedAt: now,
		expiresAt: now + 300000,
		expectedRevision: 1,
		patch: { headers: [{ mockKey: 'first', name: 'X-Test', value: 'ok' }] },
	}
	await runTool(bridge, 'patch_scenario', args)
	assert.deepEqual(calls[0][2].patch, args.patch)
	for (const header of [
		{ mockKey: 'first', name: 'X-Test', value: 'bad\r\nInjected: true' },
		{ mockKey: 'first', name: 'X-Test', value: 'bad\0' },
		{ mockKey: 'first', name: 'Bad Name', value: 'ok' },
		{ mockKey: 'first', name: 'X-Test', value: 'ok', remove: true },
	])
		await assert.rejects(
			runTool(bridge, 'patch_scenario', { ...args, patch: { headers: [header] } }),
			/INVALID_ARGUMENTS/,
		)
	assert.equal(calls.length, 1)
})

test('rule order requires unique IDs and explicit boolean enablement at the boundary', async () => {
	const calls = []
	const bridge = {
		clientSessionId: 'agent',
		request: async (...args) => {
			calls.push(args)
			return {}
		},
	}
	const now = Date.now()
	const args = {
		connectionId: 'profile',
		collectionId: 'collection',
		operationId: crypto.randomUUID(),
		issuedAt: now,
		expiresAt: now + 300000,
		expectedRevision: 1,
		patch: { scenarioEnabled: false, ruleOrder: ['second', 'first'] },
	}
	await runTool(bridge, 'patch_scenario', args)
	assert.deepEqual(calls[0][2].patch, args.patch)
	for (const patch of [{ ruleOrder: ['same', 'same'] }, { scenarioEnabled: 'false' }]) {
		await assert.rejects(runTool(bridge, 'patch_scenario', { ...args, patch }), /INVALID_ARGUMENTS/)
	}
	assert.equal(calls.length, 1)
})

test('rule response patches require exactly one mock or network choice', async () => {
	const calls = []
	const bridge = {
		clientSessionId: 'agent',
		request: async (...args) => {
			calls.push(args)
			return {}
		},
	}
	const now = Date.now()
	const args = {
		connectionId: 'profile',
		collectionId: 'collection',
		operationId: crypto.randomUUID(),
		issuedAt: now,
		expiresAt: now + 300000,
		expectedRevision: 1,
		patch: { ruleResponses: [{ ruleId: 'first', respond: { network: true } }] },
	}
	await runTool(bridge, 'patch_scenario', args)
	for (const respond of [{}, { network: false }, { network: true, mockKey: 'm' }]) {
		await assert.rejects(
			runTool(bridge, 'patch_scenario', {
				...args,
				patch: { ruleResponses: [{ ruleId: 'first', respond }] },
			}),
			/INVALID_ARGUMENTS/,
		)
	}
	assert.deepEqual(calls[0][2].patch, args.patch)
	assert.equal(calls.length, 1)
})

test('runtime tools reject invalid identities and arguments before transport', async () => {
	const calls = []
	const bridge = {
		clientSessionId: 'agent',
		request: async (...args) => {
			calls.push(args)
			return {}
		},
	}
	const now = Date.now()
	const start = {
		connectionId: 'profile',
		documentId: 'document',
		collectionId: 'collection',
		expectedRevision: 0,
		operationId: crypto.randomUUID(),
		issuedAt: now,
		expiresAt: now + 300000,
	}
	await runTool(bridge, 'start_session', start)
	for (const override of [
		{ operationId: 'bad' },
		{ documentId: '' },
		{ expectedRevision: -1 },
		{ expiresAt: now - 1 },
		{ variables: { key: 42 } },
	]) {
		await assert.rejects(
			runTool(bridge, 'start_session', { ...start, ...override }),
			/INVALID_ARGUMENTS/,
		)
	}
	for (const name of ['stop_session', 'reset_scenario']) {
		await assert.rejects(
			runTool(bridge, name, {
				connectionId: 'profile',
				documentId: 'document',
				runId: 'run',
				expectedGeneration: -1,
				operationId: crypto.randomUUID(),
				issuedAt: now,
				expiresAt: now + 300000,
			}),
			/INVALID_ARGUMENTS/,
		)
	}
	assert.equal(calls.length, 1)
})

test('old broker is diagnosed before any new command or mutation reaches it', async () => {
	const calls = []
	const bridge = { brokerRevision: 1, clientSessionId: 'agent', request: async (...args) => { calls.push(args); return { kind: 'capabilities', commands: ['get_capabilities'] } } }
	const capabilities = await runTool(bridge, 'get_capabilities', { connectionId: 'profile' })
	assert.deepEqual(capabilities.compatibility, { compatible: false, updateBroker: true, updateExtension: true })
	calls.length = 0
	const result = await runTool(bridge, 'search_requests', { connectionId: 'profile', method: '', path: '', limit: 5 })
	assert.equal(result.code, 'BROKER_UPDATE_REQUIRED')
	assert.equal(calls.length, 0)
})

test('current broker refuses writes to an old extension without downgrading the bundle', async () => {
	const calls = []
	const bridge = { brokerRevision: 2, clientSessionId: 'agent', request: async (...args) => { calls.push(args); return { kind: 'capabilities', commands: ['apply_scenario_bundle'] } } }
	const now = Date.now()
	const bundle = await load()
	bundle.mocks[0].when = { query: { taskId: '1381610398' } }
	const result = await runTool(bridge, 'apply_scenario_bundle', { connectionId: 'profile', tabId: 12, bundle, expectedRevision: 0, operationId: crypto.randomUUID(), issuedAt: now, expiresAt: now + 10000 })
	assert.equal(result.code, 'EXTENSION_UPDATE_REQUIRED')
	assert.deepEqual(calls, [['profile', 'get_capabilities', { tabId: 12 }]])
	assert.equal(bundle.mocks[0].when.query.taskId, '1381610398')
})

test('validation explains a missing field without echoing body values or unknown field names', async () => {
	const bundle = await load()
	delete bundle.mocks[0].response.body
	bundle.mocks[0].response['private-secret-name'] = 'private-secret-value'
	await assert.rejects(runTool({}, 'validate_scenario_bundle', { connectionId: 'profile', bundle }), error => {
		assert.match(error.message, /INVALID_SCENARIO/)
		assert.match(error.message, /body/)
		assert.doesNotMatch(error.message, /private-secret/)
		return true
	})
})

test('pairing never issues a misleading code from an old broker', async () => {
	let paired = false
	const result = await runTool({ brokerRevision: 1, beginPairing: () => { paired = true } }, 'begin_pairing')
	assert.equal(result.code, 'BROKER_UPDATE_REQUIRED')
	assert.equal(paired, false)
})

test('refreshes broker state before pairing after a disconnect', async () => {
	const bridge = { brokerRevision: 1, ensureConnected: async () => { bridge.brokerRevision = 2 }, beginPairing: async () => ({ code: 'fresh-code' }) }
	assert.deepEqual(await runTool(bridge, 'begin_pairing'), { code: 'fresh-code' })
})
