#!/usr/bin/env node
import { readFileSync } from 'node:fs'

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

import { getBroker } from './broker-client.js'
import { runTool, toolDefinitions } from './tools.js'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
const bridge = await getBroker()
const server = new Server({ name: 'mockman', version }, { capabilities: { tools: {} }, instructions: `Mockman is the local browser-extension MCP already configured in this agent. For “подключи Mockman”, “подключи мокман” or “connect Mockman”, use these tools to pair the browser, not a marketplace search. First get_connection_status and list_connections. If the broker is incompatible, stop and explain the required restart; do not generate a code. If a compatible broker has no browser connection, call begin_pairing once and ask the user to enter its code in Mockman → Settings → MCP. After the user replies, list_connections, list_tabs and get_capabilities verify the connection. A code is not a completed connection. BROKER_DISCONNECTED means reconnect/restart the configured Mockman MCP, not install a different plugin. Missing tools in another session mean the configured server is unavailable there; a marketplace search result cannot establish whether a local MCP is installed.` })
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolDefinitions }))
server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
	try {
		const result = await runTool(bridge, params.name, params.arguments)
		return {
			isError: result?.kind === 'error',
			content: [{ type: 'text', text: JSON.stringify(result) }],
		}
	} catch (error) {
		return { isError: true, content: [{ type: 'text', text: error.message }] }
	}
})
let closing = false
async function close() {
	if (closing) return
	closing = true
	await bridge.close()
	await server.close()
}
process.once('SIGINT', close)
process.once('SIGTERM', close)
process.stdin.once('end', close)
await server.connect(new StdioServerTransport())
