import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

test(
	'synthetic server supplies the unmocked baseline for all four scenarios',
	{ timeout: 5000 },
	async () => {
		const child = spawn(
			process.execPath,
			[fileURLToPath(new URL('../fixture/server.js', import.meta.url)), '0'],
			{
				stdio: ['ignore', 'pipe', 'inherit'],
			},
		)
		try {
			const [output] = await once(child.stdout, 'data')
			const origin = output.toString().trim().split(' ').at(-1)
			assert.match(await (await fetch(origin)).text(), /Проверка сценариев MCP/)
			assert.deepEqual(await (await fetch(`${origin}/api/items`)).json(), { items: [] })
			assert.deepEqual(await (await fetch(`${origin}/api/tasks`)).json(), { items: [] })
			assert.deepEqual(await (await fetch(`${origin}/api/configuration`)).json(), {
				features: { returns: false },
				permissions: [],
			})
			assert.deepEqual(await (await fetch(`${origin}/api/save`, { method: 'POST' })).json(), {
				saved: true,
			})
			assert.equal((await fetch(`${origin}/api/save`)).status, 404)
		} finally {
			const closed = once(child, 'exit')
			child.kill()
			await closed
		}
	},
)
