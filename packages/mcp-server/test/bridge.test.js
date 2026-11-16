import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'

import WebSocket from 'ws'

import { createBridge } from '../bridge.js'

const origin = `chrome-extension://${'a'.repeat(32)}`
async function open(bridge, originValue = origin) {
	const ws = new WebSocket(`ws://127.0.0.1:${bridge.port}/mockman`, { origin: originValue })
	await once(ws, 'open')
	return ws
}
async function send(ws, message) {
	const answer = once(ws, 'message')
	ws.send(JSON.stringify({ version: 1, ...message }))
	return JSON.parse((await answer)[0].toString())
}

test('pair, route, reconnect, revoke; do not reveal credentials in connection list', async () => {
	const bridge = await createBridge({ port: 0 })
	try {
		let ws = await open(bridge)
		const auth = await send(ws, { type: 'pair', code: bridge.beginPairing().code })
		assert.equal(auth.type, 'connected')
		assert.equal(bridge.list()[0].token, undefined)
		const message = once(ws, 'message')
		const result = bridge.request(auth.connectionId, 'list_tabs')
		const request = JSON.parse((await message)[0].toString())
		ws.send(JSON.stringify({ version: 1, type: 'result', id: request.id, result: [{ tabId: 7 }] }))
		assert.deepEqual(await result, [{ tabId: 7 }])
		const closed = once(ws, 'close')
		ws.close()
		await closed
		ws = await open(bridge)
		assert.equal(
			(await send(ws, { type: 'resume', connectionId: auth.connectionId, token: auth.token })).type,
			'connected',
		)
		await assert.rejects(
			bridge.request(auth.connectionId, 'delete_collection'),
			/UNSUPPORTED_CAPABILITY/,
		)
		const revoked = once(ws, 'close')
		ws.send(JSON.stringify({ version: 1, type: 'revoke' }))
		await revoked
		assert.deepEqual(bridge.list(), [])
	} finally {
		await bridge.close()
	}
})

test('reject webpage origin, wrong code, wrong version and expired handshake', async () => {
	const bridge = await createBridge({ port: 0, timeoutMs: 100 })
	try {
		await assert.rejects(open(bridge, 'https://app.example.test'))
		for (const msg of [
			{ version: 1, type: 'pair', code: 'wrong' },
			{ version: 2, type: 'pair' },
		]) {
			const ws = await open(bridge)
			const closed = once(ws, 'close')
			ws.send(JSON.stringify(msg))
			assert.equal((await closed)[0], 1008)
		}
		const ws = await open(bridge)
		assert.equal((await once(ws, 'close'))[0], 1008)
	} finally {
		await bridge.close()
	}
})

test('timeouts and disconnects reject pending requests; occupied port fails clearly', async () => {
	const bridge = await createBridge({ port: 0, timeoutMs: 100 })
	try {
		await assert.rejects(createBridge({ port: bridge.port }), { code: 'EADDRINUSE' })
		const ws = await open(bridge)
		const auth = await send(ws, { type: 'pair', code: bridge.beginPairing().code })
		await assert.rejects(bridge.request(auth.connectionId, 'get_capabilities'), /APPLY_TIMEOUT/)
		const request = bridge.request(auth.connectionId, 'list_tabs')
		ws.close()
		await assert.rejects(request, /NOT_CONNECTED/)
	} finally {
		await bridge.close()
	}
})

test('invalid pairing attempts affect only the addressed pairing', async () => {
	const bridge = await createBridge({ port: 0 })
	try {
		const first = bridge.beginPairing('first')
		const second = bridge.beginPairing('second')
		async function refused(code) {
			const ws = await open(bridge)
			const closed = once(ws, 'close')
			ws.send(JSON.stringify({ version: 1, type: 'pair', code }))
			assert.equal((await closed)[0], 1008)
		}
		for (let i = 0; i < 5; i++) await refused('unknown-code')
		const wrong = first.code.slice(0, -1) + (first.code.endsWith('0') ? '1' : '0')
		for (let i = 0; i < 5; i++) await refused(wrong)
		await refused(first.code)
		const ws = await open(bridge)
		assert.equal((await send(ws, { type: 'pair', code: second.code })).type, 'connected')
		assert.equal(bridge.list('second').length, 1)
		assert.equal(bridge.list('first').length, 0)
	} finally { await bridge.close() }
})
