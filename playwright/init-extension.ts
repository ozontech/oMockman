import path from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

import { chromium } from '@playwright/test'
import type { BrowserContext } from '@playwright/test'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export class InitExtension {
	public context: BrowserContext | null = null

	async installExtension(withData = false): Promise<string> {
		const pathToExtensionChrome = path.join(__dirname, '../dist/chrome')
		const headless = process.env.CI ? true : process.env.HEADLESS !== 'false'

		this.context = await chromium.launchPersistentContext('', {
			headless,
			timezoneId: 'Europe/Moscow',
			args: [
				'--disable-extensions-except=' + pathToExtensionChrome,
				'--load-extension=' + pathToExtensionChrome,
				'--no-sandbox',
				'--disable-setuid-sandbox',
				'--disable-dev-shm-usage',
			],
		})

		if (withData) {
			await this.context.addInitScript(() => {
				const SAMPLE_DATA = {
					'mockman.extension.main.db': {
						theme: 'light',
						active: true,
						mocks: [
							{ id: 'mock-1', name: 'Get User Profile', method: 'GET', url: '/api/v1/user/12345', response: { status: 200, body: { id: '12345', name: 'John Doe' } }, enabled: true },
							{ id: 'mock-2', name: 'Create Order', method: 'POST', url: '/api/v1/orders', response: { status: 201, body: { orderId: 'ORD-001' } }, enabled: true },
							{ id: 'mock-3', name: 'Update Product', method: 'PATCH', url: '/api/v1/products/:id', response: { status: 200, body: { id: 'prod-1' } }, enabled: false },
							{ id: 'mock-4', name: 'Delete User', method: 'DELETE', url: '/api/v1/user/:id', response: { status: 204, body: {} }, enabled: true },
							{ id: 'mock-5', name: 'Get Products List', method: 'GET', url: '/api/v1/products', response: { status: 200, body: [{ id: 1 }, { id: 2 }] }, enabled: true },
							{ id: 'mock-6', name: 'Get Categories', method: 'GET', url: '/api/v1/categories', response: { status: 200, body: [{ id: 1, name: 'Electronics' }] }, enabled: true },
							{ id: 'mock-7', name: 'Search Items', method: 'POST', url: '/api/v1/search', response: { status: 200, body: { results: [] } }, enabled: true },
							{ id: 'mock-8', name: 'Add to Cart', method: 'POST', url: '/api/v1/cart', response: { status: 201, body: { cartId: 'cart-1' } }, enabled: true },
							{ id: 'mock-9', name: 'Get Cart', method: 'GET', url: '/api/v1/cart/:id', response: { status: 200, body: { items: [] } }, enabled: true },
							{ id: 'mock-10', name: 'Checkout', method: 'POST', url: '/api/v1/checkout', response: { status: 200, body: { orderId: 'ORD-999' } }, enabled: true },
						],
						totalMocksCreated: 10,
						collectionTree: { root: 'root', nodes: { root: { id: 'root', name: 'Root', children: ['col-1', 'col-2'] }, 'col-1': { id: 'col-1', name: 'User API', children: ['mock-1', 'mock-3', 'mock-4', 'mock-6'] }, 'col-2': { id: 'col-2', name: 'Orders', children: ['mock-2', 'mock-7', 'mock-8', 'mock-9', 'mock-10'] } } },
						env: { activeId: 'default', profiles: [{ id: 'default', name: 'default', vars: { BASE_URL: 'https://api.example.com' } }] },
					},
				}

				const storage: Record<string, unknown> = JSON.parse(JSON.stringify(SAMPLE_DATA))

				window.localStorage.setItem('mockman.theme', 'light')
				window.localStorage.setItem('mockman.expandedCollections', JSON.stringify(['root', 'col-1']))

				const logsData = [
					{ id: 'log-1', request: { url: 'https://api.example.com/api/v1/users', method: 'GET', headers: [], queryParams: '' }, response: { status: 200, response: '{"users":[]}', headers: [{ name: 'Content-Type', value: 'application/json' }] } },
					{ id: 'log-2', request: { url: 'https://api.example.com/api/v1/users/123', method: 'GET', headers: [], queryParams: '' }, response: { status: 200, response: '{"id":123,"name":"John"}', headers: [{ name: 'Content-Type', value: 'application/json' }] } },
					{ id: 'log-3', request: { url: 'https://api.example.com/api/v1/products', method: 'POST', body: '{"name":"Test"}', headers: [], queryParams: '' }, response: { status: 201, response: '{"id":1}', headers: [{ name: 'Content-Type', value: 'application/json' }] } },
					{ id: 'log-4', request: { url: 'https://api.example.com/api/v1/orders', method: 'GET', headers: [], queryParams: 'limit=10' }, response: { status: 200, response: '{"orders":[]}', headers: [{ name: 'Content-Type', value: 'application/json' }] } },
					{ id: 'log-5', request: { url: 'https://api.example.com/api/v1/categories', method: 'GET', headers: [], queryParams: '' }, response: { status: 500, response: 'Internal Server Error', headers: [] } },
					{ id: 'log-6', request: { url: 'https://api.example.com/api/v1/search', method: 'POST', body: '{"query":"test"}', headers: [], queryParams: '' }, response: { status: 200, response: '{"results":[]}', headers: [{ name: 'Content-Type', value: 'application/json' }] } },
				]

				const panelReady = () =>
					Boolean((globalThis as { __MOCKMAN_PANEL_PORT__?: unknown }).__MOCKMAN_PANEL_PORT__)

				const emitLogs = () => {
					logsData.forEach((log) => {
						try {
							chrome.runtime.sendMessage({
								extensionName: 'MOCKMAN',
								to: 'PANEL',
								from: 'BACKGROUND',
								type: 'LOG',
								message: log,
							})
						} catch {
							void 0
						}
					})
				}

				const DEADLINE = Date.now() + 10000
				const timer = setInterval(() => {
					if (!panelReady() && Date.now() < DEADLINE) return
					clearInterval(timer)
					emitLogs()
					setTimeout(emitLogs, 300)
					setTimeout(emitLogs, 600)
				}, 200)

				chrome.storage.local.get = ((keys: string | string[], callback: (result: Record<string, unknown>) => void) => {
					const keyList = Array.isArray(keys) ? keys : [keys]
					const result: Record<string, unknown> = {}
					for (const key of keyList) {
						if (storage[key] !== undefined) {
							result[key] = storage[key]
						}
					}
					setTimeout(() => callback(result), 0)
				}) as unknown as typeof chrome.storage.local.get

				chrome.storage.local.set = ((items: Record<string, unknown>, callback?: () => void) => {
					Object.assign(storage, items)
					if (callback) setTimeout(callback, 0)
				}) as unknown as typeof chrome.storage.local.set
			})
		} else {
			const page = await this.context.newPage()
			await page.addInitScript(() => {
				window.localStorage.setItem('mockman.theme', 'light')
			})
		}

		let [serviceWorker] = this.context.serviceWorkers()
		if (!serviceWorker) {
			serviceWorker = await this.context.waitForEvent('serviceworker', { timeout: 30000 })
		}

		if (withData) {
			try {
				await serviceWorker.evaluate(() => {
					const SAMPLE_DATA = {
						'mockman.extension.main.db': {
							theme: 'light',
							active: true,
							mocks: [
								{ id: 'mock-1', name: 'Get User Profile', method: 'GET', url: '/api/v1/user/12345', response: { status: 200, body: { id: '12345', name: 'John Doe' } }, enabled: true },
								{ id: 'mock-2', name: 'Create Order', method: 'POST', url: '/api/v1/orders', response: { status: 201, body: { orderId: 'ORD-001' } }, enabled: true },
								{ id: 'mock-3', name: 'Update Product', method: 'PATCH', url: '/api/v1/products/:id', response: { status: 200, body: { id: 'prod-1' } }, enabled: false },
							],
							totalMocksCreated: 3,
							collectionTree: { root: 'root', nodes: { root: { id: 'root', name: 'Root', children: ['col-1'] }, 'col-1': { id: 'col-1', name: 'API Endpoints', children: ['mock-1', 'mock-2', 'mock-3'] } } },
							env: { activeId: 'default', profiles: [{ id: 'default', name: 'default', vars: { BASE_URL: 'https://api.example.com' } }] },
						},
					}

					const storage: Record<string, unknown> = JSON.parse(JSON.stringify(SAMPLE_DATA))

					chrome.storage.local.get = ((keys: string | string[], callback: (result: Record<string, unknown>) => void) => {
						const keyList = Array.isArray(keys) ? keys : [keys]
						const result: Record<string, unknown> = {}
						for (const key of keyList) {
							if (storage[key] !== undefined) {
								result[key] = storage[key]
							}
						}
						setTimeout(() => callback(result), 0)
					}) as unknown as typeof chrome.storage.local.get

					chrome.storage.local.set = ((items: Record<string, unknown>, callback?: () => void) => {
						Object.assign(storage, items)
						if (callback) setTimeout(callback, 0)
					}) as unknown as typeof chrome.storage.local.set
				})
			} catch (error) {
				console.log('Service worker mock failed:', error)
			}
		}

		return new URL(serviceWorker.url()).hostname
	}

	getContext(): BrowserContext {
		if (!this.context) throw new Error('installExtension() must be called first')
		return this.context
	}

	async closeContext(): Promise<void> {
		await this.context?.close()
	}
}