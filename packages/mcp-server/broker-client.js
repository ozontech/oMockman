import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createConnection } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

import WebSocket from 'ws'

import { brokerKey, brokerSocket, nonce, proof, validProof } from './broker-auth.js'

/** Connect an isolated agent session. Web pages cannot use this Origin-less endpoint. */
export function connectBroker({ port = 19772, timeoutMs = 5000, key = brokerKey(), socketPath = port === 19772 ? (process.env.MOCKMAN_BROKER_SOCKET || brokerSocket()) : undefined } = {}) {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(socketPath ? 'ws://localhost/agent' : `ws://127.0.0.1:${port}/agent`, {
			...(socketPath ? { createConnection: () => createConnection({ path: socketPath }) } : {}),
			maxPayload: 2 * 1024 * 1024,
			handshakeTimeout: timeoutMs,
		})
		const clientNonce = nonce()
		let authenticated
		ws.on('open', () => ws.send(JSON.stringify({ version: 1, type: 'hello', nonce: clientNonce })))
		const pending = new Map()
		let ready = false
		const timer = setTimeout(() => {
			reject(new Error('BROKER_HANDSHAKE_TIMEOUT'))
			ws.terminate()
		}, timeoutMs)
		function rpc(method, params = {}) {
			if (ws.readyState !== WebSocket.OPEN) return Promise.reject(new Error('BROKER_DISCONNECTED'))
			if (pending.size >= 32) return Promise.reject(new Error('LIMIT_EXCEEDED'))
			return new Promise((res, rej) => {
				const id = randomUUID()
				const frame = JSON.stringify({ version: 1, id, method, ...params })
				if (Buffer.byteLength(frame) > 2 * 1024 * 1024) {
					rej(new Error('LIMIT_EXCEEDED'))
					return
				}
				const timeout = setTimeout(() => {
					pending.delete(id)
					rej(new Error('BROKER_TIMEOUT'))
				}, timeoutMs + 1000)
				pending.set(id, { resolve: res, reject: rej, timer: timeout })
				ws.send(frame)
			})
		}
		ws.on('message', (raw) => {
			let msg
			try {
				msg = JSON.parse(raw.toString())
			} catch {
				reject(new Error('INVALID_BROKER'))
				ws.terminate()
				return
			}
			if (!msg || msg.version !== 1) {
				reject(new Error('INCOMPATIBLE_BROKER'))
				ws.terminate()
				return
			}
			if (!ready && msg.type === 'challenge' && !authenticated) {
				if (!/^[a-f0-9]{64}$/.test(msg.nonce) || typeof msg.clientSessionId !== 'string' ||
					!validProof(msg.proof, proof(key, 'broker', clientNonce, msg.nonce, msg.clientSessionId))) {
					reject(new Error('BROKER_AUTHENTICATION_FAILED'))
					ws.terminate()
					return
				}
				authenticated = msg.clientSessionId
				ws.send(JSON.stringify({ version: 1, type: 'authenticate', proof: proof(key, 'agent', clientNonce, msg.nonce, authenticated) }))
				return
			}
			if (!ready) {
				clearTimeout(timer)
				if (
					!authenticated || msg.clientSessionId !== authenticated ||
					msg.type !== 'ready' ||
					msg.service !== 'mockman-broker' ||
					typeof msg.clientSessionId !== 'string'
				) {
					reject(new Error('INVALID_BROKER'))
					ws.terminate()
					return
				}
				ready = true
				resolve({
					isConnected: () => ws.readyState === WebSocket.OPEN,
					clientSessionId: msg.clientSessionId,
					brokerRevision: Number.isInteger(msg.brokerRevision) ? msg.brokerRevision : 1,
					beginPairing: () => rpc('beginPairing'),
					list: () => rpc('list'),
					request: (connectionId, command, params = {}) =>
						rpc('request', { connectionId, command, params }),
					close: () =>
						new Promise((done) => {
							if (ws.readyState === WebSocket.CLOSED) done()
							else {
								ws.once('close', done)
								ws.close()
							}
						}),
				})
				return
			}
			const entry = pending.get(msg.id)
			if (entry) {
				clearTimeout(entry.timer)
				pending.delete(msg.id)
				if (typeof msg.error === 'string') entry.reject(new Error(msg.error))
				else entry.resolve(msg.result)
			}
		})
		ws.on('error', reject)
		ws.on('close', () => {
			clearTimeout(timer)
			reject(new Error('BROKER_DISCONNECTED'))
			for (const entry of pending.values()) {
				clearTimeout(entry.timer)
				entry.reject(new Error('BROKER_DISCONNECTED'))
			}
			pending.clear()
		})
	})
}

/** Start a detached broker only when no listener exists; never replace an unknown listener. */
async function connectOrStartBroker() {
	try {
		return await connectBroker()
	} catch (error) {
		if (!['ECONNREFUSED', 'ENOENT'].includes(error.code)) throw error
	}
	const child = spawn(process.execPath, [fileURLToPath(new URL('./broker.js', import.meta.url))], {
		detached: true,
		stdio: 'ignore',
	})
	child.unref()
	let startError
	child.on('error', (error) => {
		startError = error
	})
	for (let attempt = 0; attempt < 25; attempt++) {
		await delay(100)
		if (startError) throw startError
		try {
			return await connectBroker()
		} catch (error) {
			if (!['ECONNREFUSED', 'ENOENT'].includes(error.code)) throw error
		}
	}
	throw new Error('BROKER_START_TIMEOUT')
}

/** Reconnect before the next tool call; never replay an RPC whose delivery was uncertain. */
export async function getBroker(connect = connectOrStartBroker) {
	let current = await connect()
	let connecting
	let closed = false
	async function ensureConnected() {
		if (closed) throw new Error('BROKER_DISCONNECTED')
		if (current.isConnected()) return
		connecting ??= connect().then(async next => {
			if (closed) { await next.close(); throw new Error('BROKER_DISCONNECTED') }
			current = next
		}).finally(() => { connecting = undefined })
		await connecting
	}
	return {
		ensureConnected,
		get clientSessionId() { return current.clientSessionId },
		get brokerRevision() { return current.brokerRevision },
		beginPairing: async () => { await ensureConnected(); return current.beginPairing() },
		list: async () => { await ensureConnected(); return current.list() },
		request: async (...args) => { await ensureConnected(); return current.request(...args) },
		close: async () => { closed = true; await current.close() },
	}
}
