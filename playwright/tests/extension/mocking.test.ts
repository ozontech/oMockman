import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { BrowserContext, Page, Worker } from '@playwright/test'
import { chromium, expect, test } from '@playwright/test'

/** E2E in a real Chrome: mocks replace responses and page scripts cannot read the store. */

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const EXTENSION_PATH = path.join(__dirname, '../../../dist/chrome')

const SITE = 'https://mockman-e2e.test'
const MOCKED_PATH = '/api/v1/secret-endpoint'
const MOCK_BODY = '{"mocked":true,"secret":"e2e-secret-body"}'
const REAL_BODY = '{"mocked":false}'
const STORE_KEY = 'mockman.extension.main.db'

const store = {
	theme: 'light',
	active: true,
	totalMocksCreated: 1,
	mocks: [
		{
			id: 'mock-e2e-1',
			name: 'secret endpoint',
			method: 'GET',
			url: `${SITE}${MOCKED_PATH}`,
			status: 201,
			response: MOCK_BODY,
			headers: [{ name: 'content-type', value: 'application/json' }],
			active: true,
			createdOn: 1,
		},
	],
	env: { activeId: 'default', profiles: [{ id: 'default', name: 'default', vars: { BASE_URL: SITE } }] },
	// Mocks are served only on an origin the user allowed; a grant covers the whole site.
	sitePermissions: { [SITE]: { grantedOn: 1 } },
}

/** The same store with nothing granted, to check that the page is refused by default. */
const storeWithoutPermission = { ...store, sitePermissions: {} }

/** Nothing granted, but the user opted out of confirming each site. */
const storeWithAutoGrant = { ...store, sitePermissions: {}, autoGrantSites: true }

async function launch(seed: unknown = store): Promise<{ context: BrowserContext; worker: Worker }> {
	const context = await chromium.launchPersistentContext('', {
		headless: process.env.HEADLESS !== 'false',
		args: [
			`--disable-extensions-except=${EXTENSION_PATH}`,
			`--load-extension=${EXTENSION_PATH}`,
			'--no-sandbox',
			'--disable-setuid-sandbox',
			'--disable-dev-shm-usage',
		],
	})

	let [worker] = context.serviceWorkers()
	if (!worker) {
		worker = await context.waitForEvent('serviceworker', { timeout: 30_000 })
	}

	await worker.evaluate(
		([key, value]) => new Promise<void>((resolve) => {
			chrome.storage.local.set({ [key as string]: value }, () => resolve())
		}),
		[STORE_KEY, seed] as const,
	)

	return { context, worker }
}

async function openSite(context: BrowserContext): Promise<Page> {
	const page = await context.newPage()

	await page.route(`${SITE}/**`, async (route) => {
		const url = route.request().url()
		if (url.includes('/api/')) {
			await route.fulfill({ status: 200, contentType: 'application/json', body: REAL_BODY })
			return
		}
		await route.fulfill({
			status: 200,
			contentType: 'text/html',
			body: '<!doctype html><html><head><title>e2e</title></head><body>ok</body></html>',
		})
	})

	await page.goto(`${SITE}/index.html`, { waitUntil: 'load' })
	return page
}

test.describe('Mockman interception', { tag: '@extension' }, () => {
	let context: BrowserContext | undefined

	test.afterEach(async () => {
		await context?.close()
		context = undefined
	})

	test('replaces a fetch response with the stored mock', async () => {
		const launched = await launch()
		context = launched.context
		const page = await openSite(context)

		const result = await page.evaluate(async (url) => {
			const response = await fetch(url)
			return { status: response.status, body: await response.text() }
		}, `${SITE}${MOCKED_PATH}`)

		expect(result.body).toBe(MOCK_BODY)
		expect(result.status).toBe(201)
	})

	test('replaces an XHR response with the stored mock', async () => {
		const launched = await launch()
		context = launched.context
		const page = await openSite(context)

		const body = await page.evaluate((url) => new Promise<string>((resolve) => {
			const xhr = new XMLHttpRequest()
			xhr.open('GET', url)
			xhr.addEventListener('load', () => resolve(xhr.responseText))
			xhr.addEventListener('error', () => resolve('error'))
			xhr.send()
		}), `${SITE}${MOCKED_PATH}`)

		expect(body).toBe(MOCK_BODY)
	})

	test('serves nothing on an origin the user never allowed', async () => {
		const launched = await launch(storeWithoutPermission)
		context = launched.context
		const page = await openSite(context)

		const result = await page.evaluate(async (url) => {
			const response = await fetch(url)
			return { status: response.status, body: await response.text() }
		}, `${SITE}${MOCKED_PATH}`)

		// The very mock that works with a grant must not be served without one.
		expect(result.body).toBe(REAL_BODY)
		expect(result.status).toBe(200)
	})

	test('serves an ungranted origin once auto-grant is on', async () => {
		const launched = await launch(storeWithAutoGrant)
		context = launched.context
		const page = await openSite(context)

		const body = await page.evaluate(async (url) => {
			const response = await fetch(url)
			return response.text()
		}, `${SITE}${MOCKED_PATH}`)

		expect(body).toBe(MOCK_BODY)
	})

	test('lets unmocked requests reach the network', async () => {
		const launched = await launch()
		context = launched.context
		const page = await openSite(context)

		const body = await page.evaluate(async (url) => {
			const response = await fetch(url)
			return response.text()
		}, `${SITE}/api/v1/not-mocked`)

		expect(body).toBe(REAL_BODY)
	})

	test('does not expose the mock store to page scripts', async () => {
		const launched = await launch()
		context = launched.context
		const page = await context.newPage()

		await page.route(`${SITE}/**`, async (route) => {
			if (route.request().url().includes('/api/')) {
				await route.fulfill({ status: 200, contentType: 'application/json', body: REAL_BODY })
				return
			}
			await route.fulfill({
				status: 200,
				contentType: 'text/html',
				body: `<!doctype html><html><head><script>
					window.__seenMessages = [];
					window.addEventListener('message', (event) => {
						try { window.__seenMessages.push(JSON.stringify(event.data)); } catch (e) { window.__seenMessages.push('unserializable'); }
					});
				</script></head><body>ok</body></html>`,
			})
		})

		await page.goto(`${SITE}/index.html`, { waitUntil: 'load' })

		await page.evaluate(async (base) => {
			await fetch(`${base}/api/v1/secret-endpoint`).then((r) => r.text())
			await fetch(`${base}/api/v1/not-mocked`).then((r) => r.text())
		}, SITE)

		const seen = await page.evaluate(() => (window as unknown as { __seenMessages: string[] }).__seenMessages)
		const globals = await page.evaluate(() => ({
			mocks: (window as unknown as Record<string, unknown>).__MOCKMAN_MOCKS__,
			keys: Object.keys(window).filter((key) => key.startsWith('__MOCKMAN')),
		}))

		const serialized = seen.join('\n')
		expect(serialized).not.toContain('e2e-secret-body')
		expect(serialized).not.toContain('secret-endpoint')
		expect(globals.mocks).toBeUndefined()
		// Only boolean guards against double-patching remain; they hold no data.
		expect(globals.keys.sort()).toEqual([
			'__MOCKMAN_FETCH_WRAPPED__',
			'__MOCKMAN_INJECT_READY__',
			'__MOCKMAN_LOADED__',
			'__MOCKMAN_XHR_WRAPPED__',
		])
		const values = await page.evaluate(() => Object.keys(window)
			.filter((key) => key.startsWith('__MOCKMAN'))
			.map((key) => typeof (window as unknown as Record<string, unknown>)[key]))
		expect(values.every((type) => type === 'boolean')).toBe(true)
	})
})
