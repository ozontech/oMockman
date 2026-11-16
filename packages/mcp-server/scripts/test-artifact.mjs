import assert from 'node:assert/strict'
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const directory = await mkdtemp(join(tmpdir(), 'mockman-artifact-'))
const client = new Client({ name: 'artifact-test', version: '1' })
try {
	await cp(fileURLToPath(new URL('../../../dist/mcp', import.meta.url)), directory, {
		recursive: true,
	})
	// Use an empty environment apart from PATH; no corporate registry/configuration is required.
	await client.connect(
		new StdioClientTransport({
			command: process.execPath,
			args: [join(directory, 'index.js')],
			cwd: directory,
			env: { PATH: process.env.PATH ?? '', MOCKMAN_BROKER_SOCKET: join(directory, 'agent.sock') },
			stderr: 'pipe',
		}),
	)
	assert.ok((await client.listTools()).tools.some((tool) => tool.name === 'start_capture'))
	const result = await client.callTool({ name: 'begin_pairing', arguments: {} })
	assert.match(JSON.parse(result.content[0].text).code, /^[a-f0-9]{16}$/)
	const provenance = JSON.parse(await readFile(join(directory, 'provenance.json'), 'utf8'))
	assert.ok(provenance.dependencies.length > 0)
	console.log(
		'Standalone MCP initializes and pairs from an isolated directory without node_modules.',
	)
} finally {
	await client.close()
	await rm(directory, { recursive: true, force: true })
}
