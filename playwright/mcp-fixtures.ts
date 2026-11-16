import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { BrowserContext, Page, Worker } from '@playwright/test'
import { test as base, chromium, expect } from '@playwright/test'

import { browserTestClient } from '../packages/mcp-server/browser/client.js'
import { isolatedRuntime } from '../packages/mcp-server/browser/isolated.js'

type McpFixture = {
	setup: Page
	context: BrowserContext
	worker: Worker
	origin: string
	call: (name: string, args?: Record<string, unknown>) => Promise<unknown>
	pair: () => Promise<string>
	tab: (name: string) => Promise<{ page: Page; id: string }>
}

export const test = base.extend<{ mcp: McpFixture }>({
	// Playwright requires a destructured first parameter even without dependencies.
	// eslint-disable-next-line no-empty-pattern
	mcp: async ({}, use) => {
		const directory = await mkdtemp(path.join(tmpdir(), 'mockman-pw-mcp-'))
		const runtime = await isolatedRuntime(directory, 'chrome')
		const client = await browserTestClient(runtime.entrypoint)
		const server = createServer((_req, res) => {
			res.setHeader('Content-Type', 'text/html')
			res.end('<!doctype html><title>Test application</title><h1>Test application</h1>')
		})
		let context: BrowserContext | undefined
		try {
			await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
			const address = server.address()
			if (!address || typeof address === 'string') throw new Error('Missing fixture port')
			const origin = `http://127.0.0.1:${address.port}`
			const call = client.call
			context = await chromium.launchPersistentContext(path.join(directory, 'profile'), {
				channel: 'chromium',
				headless: true,
				args: [
					`--disable-extensions-except=${runtime.extensionPath}`,
					`--load-extension=${runtime.extensionPath}`,
				],
			})
			const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
			const extensionId = new URL(worker.url()).hostname
			const setup = await context.newPage()
			await setup.addInitScript(() => localStorage.setItem('mockman.lang', 'en'))
			await setup.goto(`chrome-extension://${extensionId}/public/html/mcp.html`)
			const pair = async () => {
				const pairing = (await call('begin_pairing')) as { code: string }
				await setup.getByRole('textbox', { name: 'MCP code' }).fill(pairing.code)
				await setup.getByRole('button', { name: 'Pair', exact: true }).click()
				await expect
					.poll(() => call('list_connections'))
					.toEqual([expect.objectContaining({ connected: true })])
				const connections = (await call('list_connections')) as { connectionId: string }[]
				await expect(setup.getByLabel('MCP tab')).toBeEnabled()
				return connections[0].connectionId
			}
			const tab = async (name: string) => {
				if (!context) throw new Error('Browser context is closed')
				const page = await context.newPage()
				await page.goto(`${origin}/${encodeURIComponent(name)}`)
				await page.evaluate((title) => {
					document.title = title
				}, name)
				await setup.getByRole('button', { name: 'Refresh tabs' }).click()
				const option = setup.getByRole('option', { name, exact: true })
				await expect(option).toHaveCount(1)
				const id = await option.getAttribute('value')
				if (!id) throw new Error('Missing tab id')
				return { page, id }
			}
			await use({ setup, context, worker, origin, call, pair, tab })
		} finally {
			await context?.close()
			await client.close()
			await runtime.close()
			await new Promise<void>((resolve, reject) =>
				server.close((error) => (error ? reject(error) : resolve())),
			)
			await rm(directory, { recursive: true, force: true })
		}
	},
})
export { expect }
