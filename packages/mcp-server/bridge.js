import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import { chmodSync, lstatSync, unlinkSync } from 'node:fs'

import { WebSocket, WebSocketServer } from 'ws'

import { brokerKey, brokerSocket, nonce, proof, validProof } from './broker-auth.js'

const secret = () => randomBytes(32).toString('hex')
const equal = (a, b) =>
	typeof a === 'string' &&
	Buffer.byteLength(a) === Buffer.byteLength(b) &&
	timingSafeEqual(Buffer.from(a), Buffer.from(b))

/** Local extension bridge. Credentials live only for this server process. */
export async function createBridge({ port = 19772, timeoutMs = 5000, key = brokerKey(), socketPath = port === 19772 ? brokerSocket() : undefined } = {}) {
	const connections = new Map()
	const pending = new Map()
	const pairings = new Map()
	const agents = new Set()
	const agentWss = new WebSocketServer({ noServer: true, maxPayload: 2 * 1024 * 1024 })
	const http = createServer((_req, res) => {
		res.writeHead(404)
		res.end()
	})
	const agentHttp = socketPath ? createServer((_req, res) => { res.writeHead(404); res.end() }) : http
	const wss = new WebSocketServer({ noServer: true, maxPayload: 2 * 1024 * 1024 })
	agentHttp.on('upgrade', (req, socket, head) => {
		if (req.url !== '/agent' || req.headers.origin !== undefined || agents.size >= 32) {
			if (agentHttp !== http || req.url === '/agent') socket.destroy()
			return
		}
		agentWss.handleUpgrade(req, socket, head, (ws) => agentWss.emit('connection', ws))
	})
	http.on('upgrade', (req, socket, head) => {
		if (agentHttp === http && req.url === '/agent') return
		const origin = req.headers.origin ?? ''
		const host = `127.0.0.1:${http.address().port}`
		if (
			req.headers.host !== host ||
			req.url !== '/mockman' ||
			!/^(chrome-extension:\/\/[a-p]{32}|moz-extension:\/\/[a-f0-9-]{36})$/.test(origin) ||
			wss.clients.size >= 16
		) {
			socket.destroy()
			return
		}
		wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, origin))
	})
	wss.on('connection', (ws, origin) => {
		let connection
		let alive = true
		const deadline = setTimeout(() => ws.close(1008, 'Authentication timeout'), timeoutMs)
		ws.on('pong', () => {
			alive = true
		})
		const heartbeat = setInterval(() => {
			if (!alive) ws.terminate()
			else {
				alive = false
				ws.ping()
			}
		}, 15000)
		ws.on('message', (raw) => {
			let msg
			try {
				msg = JSON.parse(raw.toString())
			} catch {
				ws.close(1008)
				return
			}
			if (!msg || typeof msg !== 'object' || msg.version !== 1) {
				ws.close(1008, 'Version mismatch')
				return
			}
			if (!connection) {
				const pairing = [...pairings.values()].find(
					(entry) =>
						typeof msg.code === 'string' && msg.code.slice(0, 8) === entry.code.slice(0, 8),
				)
				const validPairing = pairing && Date.now() < pairing.expiresAt && pairing.attempts < 5 && equal(msg.code, pairing.code)
				if (msg.type === 'pair' && pairing && !validPairing) pairing.attempts++
				if (msg.type === 'pair' && connections.size < 16 && validPairing) {
					const id = randomUUID()
					connection = { id, token: secret(), origin, ws, owner: pairing.owner }
					connections.set(id, connection)
					pairings.delete(pairing.owner)
				} else if (msg.type === 'resume') {
					const saved = connections.get(msg.connectionId)
					if (saved && saved.origin === origin && equal(msg.token, saved.token)) {
						saved.ws?.close(1000, 'Replaced')
						saved.ws = ws
						connection = saved
					}
				}
				if (!connection) {
					ws.close(1008, 'Pairing required')
					return
				}
				clearTimeout(deadline)
				ws.send(
					JSON.stringify({
						version: 1,
						type: 'connected',
						connectionId: connection.id,
						token: connection.token,
					}),
				)
				return
			}
			if (msg.type === 'heartbeat') {
				ws.send(JSON.stringify({ version: 1, type: 'heartbeat' }))
				return
			}
			if (msg.type === 'revoke') {
				connections.delete(connection.id)
				ws.close()
				return
			}
			if (msg.type === 'result' && typeof msg.id === 'string') {
				const call = pending.get(msg.id)
				if (call?.ws === ws) {
					pending.delete(msg.id)
					clearTimeout(call.timer)
					call.resolve(msg.result)
				}
			}
		})
		ws.on('error', () => {
			/* close handler releases requests */
		})
		ws.on('close', () => {
			clearTimeout(deadline)
			clearInterval(heartbeat)
			if (connection?.ws === ws) connection.ws = undefined
			for (const [id, call] of pending)
				if (call.ws === ws) {
					clearTimeout(call.timer)
					pending.delete(id)
					call.reject(new Error('NOT_CONNECTED'))
				}
		})
	})
	await new Promise((resolve, reject) => {
		http.once('error', reject)
		http.listen(port, '127.0.0.1', resolve)
	})
	if (socketPath) {
		try {
			// The extension port is already exclusively ours. Only now remove a stale
			// socket in the validated, user-private directory.
			try {
				const stat = lstatSync(socketPath)
				if (!stat.isSocket() || stat.uid !== process.getuid()) throw new Error('BROKER_UNSAFE_SOCKET')
				if (port === 0) throw Object.assign(new Error('BROKER_SOCKET_IN_USE'), { code: 'EADDRINUSE' })
				unlinkSync(socketPath)
			} catch (error) { if (error.code !== 'ENOENT') throw error }
			await new Promise((resolve, reject) => {
				agentHttp.once('error', reject)
				agentHttp.listen(socketPath, resolve)
			})
			chmodSync(socketPath, 0o600)
		} catch (error) {
			await new Promise(resolve => http.close(resolve))
			throw error
		}
	}

	const api = {
		port: http.address().port,
		beginPairing(owner = 'local') {
			let code
			do { code = randomBytes(8).toString('hex') } while ([...pairings.values()].some(entry => entry.code.slice(0, 8) === code.slice(0, 8)))
			const pairing = {
				owner,
				code,
				expiresAt: Date.now() + 120000,
				attempts: 0,
			}
			pairings.set(owner, pairing)
			return { code: pairing.code, expiresAt: pairing.expiresAt }
		},
		list(owner = 'local') {
			return [...connections.values()]
				.filter((entry) => entry.owner === owner)
				.map(({ id, ws }) => ({ connectionId: id, connected: ws?.readyState === WebSocket.OPEN }))
		},
		request(connectionId, command, owner = 'local', params = {}) {
			if (connections.get(connectionId)?.owner !== owner)
				return Promise.reject(new Error('NOT_CONNECTED'))
			const ws = connections.get(connectionId)?.ws
			if (!ws || ws.readyState !== WebSocket.OPEN) return Promise.reject(new Error('NOT_CONNECTED'))
			if (
				![
					'get_capabilities',
					'list_tabs',
					'search_requests', 'get_request_fields', 'export_collections', 'preview_import', 'import_collections', 'refresh_session',
					'get_scenario_catalog',
					'get_scenario',
					'patch_scenario',
					'delete_scenario',
					'start_capture',
					'stop_capture',
					'get_capture_requests',
					'get_request_details',
					'validate_scenario_bundle',
					'apply_scenario_bundle',
					'start_session',
					'stop_session',
					'reset_scenario',
					'get_scenario_state',
					'get_request_logs',
				].includes(command)
			)
				return Promise.reject(new Error('UNSUPPORTED_CAPABILITY'))
			if (pending.size >= 32) return Promise.reject(new Error('LIMIT_EXCEEDED'))
			return new Promise((resolve, reject) => {
				const id = randomUUID()
				const frame = JSON.stringify({ version: 1, type: 'command', id, command, params })
				if (Buffer.byteLength(frame) > 2 * 1024 * 1024) {
					reject(new Error('LIMIT_EXCEEDED'))
					return
				}
				const timer = setTimeout(() => {
					pending.delete(id)
					reject(new Error('APPLY_TIMEOUT'))
				}, timeoutMs)
				pending.set(id, { ws, resolve, reject, timer })
				ws.send(frame)
			})
		},
		async close() {
			for (const ws of agents) ws.terminate()
			await new Promise((resolve) => agentWss.close(resolve))
			for (const ws of wss.clients) ws.terminate()
			await new Promise((resolve) => wss.close(resolve))
			if (agentHttp !== http) await new Promise(resolve => agentHttp.close(resolve))
			await new Promise((resolve) => http.close(resolve))
		},
	}
	// Agent session IDs originate here, never from tool arguments or the extension.
	agentWss.on('connection', (ws) => {
		const owner = randomUUID()
		let clientNonce
		const serverNonce = nonce()
		let authenticated = false
		const authDeadline = setTimeout(() => ws.close(1008, 'Authentication timeout'), timeoutMs)
		agents.add(ws)
		let alive = true
		let inFlight = 0
		const heartbeat = setInterval(() => {
			if (!alive) ws.terminate()
			else {
				alive = false
				ws.ping()
			}
		}, 15000)
		ws.on('pong', () => {
			alive = true
		})
		ws.on('message', async (raw) => {
			let msg
			try {
				msg = JSON.parse(raw.toString())
			} catch {
				ws.close(1008)
				return
			}
			if (!authenticated) {
				if (msg?.version === 1 && msg.type === 'hello' && !clientNonce && /^[a-f0-9]{64}$/.test(msg.nonce)) {
					clientNonce = msg.nonce
					ws.send(JSON.stringify({ version: 1, type: 'challenge', nonce: serverNonce, clientSessionId: owner,
						proof: proof(key, 'broker', clientNonce, serverNonce, owner) }))
				} else if (msg?.version === 1 && msg.type === 'authenticate' && clientNonce &&
					validProof(msg.proof, proof(key, 'agent', clientNonce, serverNonce, owner))) {
					authenticated = true
					clearTimeout(authDeadline)
					ws.send(JSON.stringify({ version: 1, type: 'ready', service: 'mockman-broker', brokerRevision: 2, clientSessionId: owner }))
				} else ws.close(1008, 'Authentication failed')
				return
			}
			if (
				!msg ||
				msg.version !== 1 ||
				typeof msg.id !== 'string' ||
				msg.id.length > 128 ||
				inFlight >= 32
			) {
				ws.close(1008)
				return
			}
			inFlight++
			try {
				let result
				if (msg.method === 'beginPairing') result = api.beginPairing(owner)
				else if (msg.method === 'list') result = api.list(owner)
				else if (msg.method === 'request')
					result = await api.request(msg.connectionId, msg.command, owner, msg.params ?? {})
				else throw new Error('UNSUPPORTED_CAPABILITY')
				if (ws.readyState === WebSocket.OPEN)
					ws.send(JSON.stringify({ version: 1, id: msg.id, result }))
			} catch (error) {
				if (ws.readyState === WebSocket.OPEN)
					ws.send(JSON.stringify({ version: 1, id: msg.id, error: error.message }))
			} finally {
				inFlight--
			}
		})
		ws.on('error', () => {
			/* close handles cleanup */
		})
		ws.on('close', () => {
			clearInterval(heartbeat)
			clearTimeout(authDeadline)
			agents.delete(ws)
			pairings.delete(owner)
			for (const [id, entry] of connections)
				if (entry.owner === owner) {
					connections.delete(id)
					entry.ws?.close(1008, 'Agent session ended')
				}
		})
	})
	return { ...api, agentCount: () => agents.size }
}
