import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

import { createBridge } from '../bridge.js'

const directory = await mkdtemp(join(tmpdir(), 'mm-stdio-'))
const socketPath = join(directory, 'agent.sock')
let bridge
before(async () => { bridge = await createBridge({ port: 0, socketPath }) })
after(async () => { await bridge.close(); await rm(directory, { recursive: true, force: true }) })

test(
	'real MCP client initializes over stdio and calls pairing tools',
	{ timeout: 10000 },
	async () => {
		const transport = new StdioClientTransport({
			command: process.execPath,
			args: [fileURLToPath(new URL('../index.js', import.meta.url))],
			stderr: 'pipe',
			env: { MOCKMAN_BROKER_SOCKET: socketPath },
		})
		const client = new Client({ name: 'test', version: '1' })
		try {
			await client.connect(transport)
			assert.equal((await client.listTools()).tools.length, 26)
			assert.ok(client.getInstructions()?.includes('get_connection_status'), 'Direct MCP installations must receive the pairing workflow during initialize')
			const result = await client.callTool({ name: 'begin_pairing', arguments: {} })
			assert.match(JSON.parse(result.content[0].text).code, /^[0-9a-f]{16}$/)
			assert.equal((await client.callTool({ name: 'list_tabs', arguments: {} })).isError, true)
		} finally {
			await client.close()
		}
	},
)

test(
	'two MCP processes share a broker and closing the first preserves the second',
	{ timeout: 10000 },
	async () => {
		const clients = [1, 2].map((id) => new Client({ name: `agent-${id}`, version: '1' }))
		try {
			await Promise.all(
				clients.map((client) =>
					client.connect(
						new StdioClientTransport({
							command: process.execPath,
							args: [fileURLToPath(new URL('../index.js', import.meta.url))],
							stderr: 'pipe',
			env: { MOCKMAN_BROKER_SOCKET: socketPath },
						}),
					),
				),
			)
			const codes = await Promise.all(
				clients.map(async (client) => {
					const result = await client.callTool({ name: 'begin_pairing', arguments: {} })
					return JSON.parse(result.content[0].text).code
				}),
			)
			assert.notEqual(codes[0], codes[1])
			await clients[0].close()
			const status = await clients[1].callTool({ name: 'get_connection_status', arguments: {} })
			assert.equal(JSON.parse(status.content[0].text).listening, true)
		} finally {
			await Promise.all(clients.map((client) => client.close()))
		}
	},
)
