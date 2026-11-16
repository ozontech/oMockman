import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'

import WebSocket from 'ws'

import { createBridge } from '../bridge.js'
import { connectBroker } from '../broker-client.js'

async function pair(bridge, agent) {
	const { code } = await agent.beginPairing()
	const ws = new WebSocket(`ws://127.0.0.1:${bridge.port}/mockman`, {
		origin: `chrome-extension://${'b'.repeat(32)}`,
	})
	await once(ws, 'open')
	const answer = once(ws, 'message')
	ws.send(JSON.stringify({ version: 1, type: 'pair', code }))
	return { ws, ...JSON.parse((await answer)[0].toString()) }
}

test('agents cannot list or call another session; disconnect revokes only its profiles', async () => {
	const bridge = await createBridge({ port: 0 })
	const first = await connectBroker({ port: bridge.port })
	const second = await connectBroker({ port: bridge.port })
	try {
		assert.notEqual(first.clientSessionId, second.clientSessionId)
		const a = await pair(bridge, first)
		const b = await pair(bridge, second)
		assert.deepEqual(
			(await first.list()).map((c) => c.connectionId),
			[a.connectionId],
		)
		assert.deepEqual(
			(await second.list()).map((c) => c.connectionId),
			[b.connectionId],
		)
		await assert.rejects(first.request(b.connectionId, 'list_tabs'), /NOT_CONNECTED/)
		const closed = once(a.ws, 'close')
		await first.close()
		assert.equal((await closed)[0], 1008)
		const received = once(b.ws, 'message')
		const result = second.request(b.connectionId, 'get_capabilities')
		const message = JSON.parse((await received)[0].toString())
		b.ws.send(
			JSON.stringify({ version: 1, type: 'result', id: message.id, result: { capture: false } }),
		)
		assert.deepEqual(await result, { capture: false })
	} finally {
		await first.close()
		await second.close()
		await bridge.close()
	}
})

test('ordinary page cannot open agent endpoint; broker crash rejects outstanding RPC', async () => {
	const bridge = await createBridge({ port: 0 })
	const agent = await connectBroker({ port: bridge.port })
	try {
		const page = new WebSocket(`ws://127.0.0.1:${bridge.port}/agent`, {
			origin: 'http://localhost',
		})
		await assert.rejects(once(page, 'open'))
		const extension = await pair(bridge, agent)
		const request = agent.request(extension.connectionId, 'list_tabs')
		const rejection = assert.rejects(request, /BROKER_DISCONNECTED|NOT_CONNECTED/)
		await bridge.close()
		await rejection
	} finally {
		await agent.close()
	}
})

test('a counterfeit listener cannot obtain RPC payloads, even with a plausible ready frame', async () => {
	const { WebSocketServer } = await import('ws')
	const server = new WebSocketServer({ port: 0, host: '127.0.0.1' })
	await once(server, 'listening')
	const received = []
	server.on('connection', ws => {
		ws.on('message', raw => received.push(JSON.parse(raw.toString())))
		ws.send(JSON.stringify({ version: 1, type: 'ready', service: 'mockman-broker', clientSessionId: 'forged' }))
	})
	try {
		await assert.rejects(connectBroker({ port: server.address().port }), /INVALID_BROKER/)
		assert.ok(received.every(frame => frame.type === 'hello'))
	} finally { for (const ws of server.clients) ws.terminate(); await new Promise(resolve => server.close(resolve)) }
})

test('another OS account key cannot authenticate a broker', async () => {
	const bridge = await createBridge({ port: 0, key: Buffer.alloc(32, 1) })
	try {
		await assert.rejects(connectBroker({ port: bridge.port, key: Buffer.alloc(32, 2) }), /BROKER_AUTHENTICATION_FAILED/)
		const client = await connectBroker({ port: bridge.port, key: Buffer.alloc(32, 1) })
		assert.deepEqual(await client.list(), [])
		await client.close()
	} finally { await bridge.close() }
})

test('unauthenticated agents cannot invoke pairing RPC', async () => {
	const bridge = await createBridge({ port: 0 })
	try {
		const ws = new WebSocket(`ws://127.0.0.1:${bridge.port}/agent`)
		await once(ws, 'open')
		const closed = once(ws, 'close')
		ws.send(JSON.stringify({ version: 1, id: '1', method: 'beginPairing' }))
		assert.equal((await closed)[0], 1008)
	} finally { await bridge.close() }
})

test('private IPC socket authenticates agents while TCP exposes only the extension endpoint', async () => {
	const { mkdtemp, rm, stat } = await import('node:fs/promises')
	const { tmpdir } = await import('node:os')
	const { join } = await import('node:path')
	const directory = await mkdtemp(join(tmpdir(), 'mm ipc '))
	const socketPath = join(directory, 'agent.sock')
	const bridge = await createBridge({ port: 0, socketPath })
	try {
		assert.equal((await stat(socketPath)).mode & 0o777, 0o600)
		await assert.rejects(connectBroker({ port: bridge.port }))
		const client = await connectBroker({ socketPath })
		try {
			await assert.rejects(createBridge({ port: 0, socketPath }), { code: 'EADDRINUSE' })
			assert.deepEqual(await client.list(), [])
		} finally { await client.close() }
	} finally { await bridge.close(); await rm(directory, { recursive: true, force: true }) }
})
