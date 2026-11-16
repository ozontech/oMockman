import assert from 'node:assert/strict'
import test from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'

import { createBridge } from '../bridge.js'
import { connectBroker, getBroker } from '../broker-client.js'

test('reconnects to a restarted broker with a new owner instead of retaining the dead session', async () => {
	let server = await createBridge({ port: 0 })
	const port = server.port
	const client = await getBroker(() => connectBroker({ port }))
	try {
		const firstOwner = client.clientSessionId
		await client.beginPairing()
		await server.close()
		server = await createBridge({ port })
		for (let attempt = 0; attempt < 50 && client.clientSessionId === firstOwner; attempt++) {
			await delay(10) // Allow the remote close event to reach the client socket.
			await client.ensureConnected()
		}
		assert.notEqual(client.clientSessionId, firstOwner)
		assert.equal(client.brokerRevision, 2)
		assert.deepEqual(await client.list(), [])
		assert.match((await client.beginPairing()).code, /^[a-f0-9]{16}$/)
	} finally {
		await client.close()
		await server.close()
	}
})
