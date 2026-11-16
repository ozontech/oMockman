import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

/** Stdio client for browser tests; uses the SDK dependency owned by this package. */
export async function browserTestClient(entrypoint) {
	const client = new Client({ name: 'mockman-playwright', version: '1' })
	await client.connect(
		new StdioClientTransport({ command: process.execPath, args: [entrypoint], stderr: 'pipe' }),
	)
	return {
		async call(name, args = {}) {
			const response = await client.callTool({ name, arguments: args })
			const first = response.content?.[0]
			if (first?.type !== 'text') throw new Error('Missing MCP response')
			return JSON.parse(first.text)
		},
		close: () => client.close(),
	}
}
