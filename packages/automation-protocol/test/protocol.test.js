import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { validateBundle, validateCommand, validateResult } from '../index.js'

const example = async (name = 'sequence') =>
	JSON.parse(await readFile(new URL(`../examples/${name}.json`, import.meta.url)))
const command = (bundle) => ({
	protocolVersion: 1,
	connectionId: 'profile-1',
	clientSessionId: 'agent-1',
	operationId: '9c15de84-4ab7-4d15-a898-ec3af2ef5812',
	issuedAt: 1000,
	expiresAt: 301000,
	command: 'apply_scenario_bundle',
	params: { expectedRevision: 0, bundle },
})

test('four UI scenarios have valid external representations', async () => {
	for (const name of ['modal', 'section', 'save-error', 'sequence']) {
		assert.deepEqual(validateCommand(command(await example(name)), 2000), {
			valid: true,
			errors: [],
		})
	}
})

test('reject dangling references, duplicate keys and executable fields', async () => {
	for (const mutate of [
		(bundle) => {
			bundle.scenario.rules[0].respond.mockKey = 'missing'
		},
		(bundle) => {
			bundle.mocks[1].key = bundle.mocks[0].key
		},
		(bundle) => {
			bundle.scenario.rules[1].key = bundle.scenario.rules[0].key
		},
		(bundle) => {
			bundle.mocks[0].action = 'return fetch(url)'
		},
		(bundle) => {
			bundle.scenario.rules[0].respond.network = true
		},
		(bundle) => {
			bundle.mocks[0].url = 'https://user:password@app.example.test/api'
		},
		(bundle) => {
			bundle.mocks[0].response.headers[0].value = 'ok\r\nInjected: true'
		},
		(bundle) => {
			bundle.mocks[0].response.status = 204
		},
	]) {
		const bundle = await example()
		mutate(bundle)
		assert.equal(validateBundle(bundle).valid, false)
	}
})

test('reject stale, future and unbounded operation windows', async () => {
	const value = command(await example())
	assert.equal(validateCommand(value, 301000).valid, false)
	assert.equal(validateCommand(value, 999).valid, false)
	value.expiresAt++
	assert.equal(validateCommand(value, 2000).valid, false)
})

test('reject unsupported protocol and oversized commands', async () => {
	const value = command(await example())
	value.protocolVersion = 2
	assert.equal(validateCommand(value, 2000).valid, false)
	value.protocolVersion = 1
	value.params.bundle.mocks[0].response.body = 'я'.repeat(1024 * 1024)
	assert.equal(validateCommand(value, 2000).valid, false)
})

test('saved result cannot masquerade as applied and run commands require a document', () => {
	assert.equal(validateResult({ kind: 'saved', appliedRevision: 1 }).valid, false)
	assert.equal(
		validateResult({
			kind: 'error',
			code: 'APPLY_TIMEOUT',
			message: 'Unknown application state',
			retryable: true,
		}).valid,
		true,
	)
	assert.equal(
		validateCommand({
			protocolVersion: 1,
			connectionId: 'p',
			clientSessionId: 'a',
			command: 'get_scenario_state',
			params: { tabId: 1, runId: 'r' },
		}).valid,
		false,
	)
})

test('runtime contract uses selected tab and acknowledges stopped or running document', () => {
	const base = { protocolVersion: 1, connectionId: 'p', clientSessionId: 'a' }
	assert.equal(validateCommand({ ...base, command: 'get_scenario_state', params: {} }).valid, true)
	const start = {
		...base,
		operationId: '9c15de84-4ab7-4d15-a898-ec3af2ef5812',
		issuedAt: 1000,
		expiresAt: 301000,
		command: 'start_session',
		params: { documentId: 'doc', collectionId: 'collection', expectedRevision: 1 },
	}
	assert.equal(validateCommand(start, 2000).valid, true)
	delete start.params.documentId
	assert.equal(validateCommand(start, 2000).valid, false)
	const stopped = {
		kind: 'run_state',
		documentId: 'doc',
		runId: null,
		state: 'stopped',
		generation: 0,
		appliedRevision: null,
		counts: {},
	}
	assert.equal(validateResult(stopped).valid, true)
	assert.equal(
		validateResult({
			...stopped,
			runId: 'run',
			state: 'running',
			appliedRevision: 1,
			counts: { endpoint: 2 },
			replayed: true,
		}).valid,
		true,
	)
	assert.equal(validateResult({ ...stopped, counts: { endpoint: -1 } }).valid, false)
})
