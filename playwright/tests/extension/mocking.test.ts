import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { BrowserContext, Page, Worker } from '@playwright/test'
import { chromium, expect, test } from '@playwright/test'


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
	sitePermissions: { [SITE]: { grantedOn: 1 } },
}

const storeWithoutPermission = { ...store, sitePermissions: {} }

const storeWithAutoGrant = { ...store, sitePermissions: {}, autoGrantSites: true }

const PATCHED_PATH = '/api/v1/orders'
const HEADERS_PATH = '/api/v1/profile'

const storeWithRequestPatch = {
	...store,
	mocks: [
		...store.mocks,
		{
			id: 'mock-e2e-patch',
			name: 'order patch',
			method: 'POST',
			url: `${SITE}${PATCHED_PATH}`,
			status: 200,
			response: MOCK_BODY,
			headers: [],
			active: true,
			createdOn: 1,
			requestPatch: { mode: 'merge', body: '{"qty":999,"comment":null}' },
		},
		{
			id: 'mock-e2e-headers',
			name: 'profile headers',
			method: 'GET',
			url: `${SITE}${HEADERS_PATH}`,
			status: 200,
			response: MOCK_BODY,
			headers: [{ name: 'x-feature', value: 'on' }],
			active: true,
			createdOn: 1,
			apply: { responseBody: false, responseHeaders: true, requestBody: false },
		},
	],
}

const TASKS = `${SITE}/api/v3/tasks`
const LIST_BODY = '{"tasks":[1]}'
const EMPTY_BODY = '{"tasks":[]}'

/** A collection with two answers for one endpoint; the second one is off and only a scenario serves it. */
const flowMocks = [
	{ id: 'tasks-list', name: 'tasks list', method: 'POST', url: `${TASKS}/query`, status: 200, response: LIST_BODY, headers: [], active: true, createdOn: 1, collectionId: 'flow' },
	{ id: 'tasks-empty', name: 'tasks empty', method: 'POST', url: `${TASKS}/query`, status: 200, response: EMPTY_BODY, headers: [], active: false, createdOn: 2, collectionId: 'flow' },
]

const flowStore = (scenario?: unknown) => ({
	...store,
	totalMocksCreated: 2,
	mocks: flowMocks,
	collectionTree: {
		root: [{ id: 'flow', type: 'collection' }],
		nodes: {
			flow: {
				id: 'flow',
				name: 'Tasks flow',
				parentId: null,
				active: true,
				createdOn: 1,
				entries: flowMocks.map((m) => ({ id: m.id, type: 'mock' })),
				scenario,
			},
		},
	},
})

/** The first list has a task, every later one is empty; "complete" goes to the server. */
const tasksScenario = {
	enabled: true,
	rules: [
		{ id: 'r1', method: 'POST', url: `${TASKS}/query`, respond: { mockId: 'tasks-list' } },
		{ id: 'r2', method: 'POST', url: `${TASKS}/query`, respond: { mockId: 'tasks-empty' } },
		{ id: 'r3', method: 'POST', url: `${TASKS}/complete`, respond: { network: true } },
	],
}

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

async function openSite(context: BrowserContext, sentBodies: string[] = []): Promise<Page> {
	const page = await context.newPage()

	await page.route(`${SITE}/**`, async (route) => {
		const url = route.request().url()
		const postData = route.request().postData()
		if (postData !== null) sentBodies.push(postData)
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

	test('sends a fetch with the patched body and gives the page the real response', async () => {
		const launched = await launch(storeWithRequestPatch)
		context = launched.context
		const sentBodies: string[] = []
		const page = await openSite(context, sentBodies)

		const body = await page.evaluate(async (url) => {
			const response = await fetch(url, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ qty: 1, sku: 'A', comment: 'x' }),
			})
			return response.text()
		}, `${SITE}${PATCHED_PATH}`)

		expect(body).toBe(REAL_BODY)
		expect(sentBodies.map((sent) => JSON.parse(sent))).toEqual([{ qty: 999, sku: 'A' }])
	})

	test('sends an XHR with the patched body', async () => {
		const launched = await launch(storeWithRequestPatch)
		context = launched.context
		const sentBodies: string[] = []
		const page = await openSite(context, sentBodies)

		const body = await page.evaluate((url) => new Promise<string>((resolve) => {
			const xhr = new XMLHttpRequest()
			xhr.open('POST', url)
			xhr.setRequestHeader('content-type', 'application/json')
			xhr.addEventListener('load', () => resolve(xhr.responseText))
			xhr.addEventListener('error', () => resolve('error'))
			xhr.send(JSON.stringify({ qty: 1, sku: 'A' }))
		}), `${SITE}${PATCHED_PATH}`)

		expect(body).toBe(REAL_BODY)
		expect(sentBodies.map((sent) => JSON.parse(sent))).toEqual([{ qty: 999, sku: 'A' }])
	})

	test('sets mock headers on the real response and keeps its body', async () => {
		const launched = await launch(storeWithRequestPatch)
		context = launched.context
		const page = await openSite(context)

		const result = await page.evaluate(async (url) => {
			const response = await fetch(url)
			return { body: await response.text(), feature: response.headers.get('x-feature') }
		}, `${SITE}${HEADERS_PATH}`)

		expect(result).toEqual({ body: REAL_BODY, feature: 'on' })
	})

	test('patches the request body set up in the panel form', async () => {
		const launched = await launch({ ...store, mocks: [] })
		context = launched.context
		const sentBodies: string[] = []
		const page = await openSite(context, sentBodies)
		const extensionId = new URL(launched.worker.url()).host

		const panel = await context.newPage()
		await panel.goto(`chrome-extension://${extensionId}/public/html/panel.html`)
		await panel.getByTestId('add-mock-button').click()
		await panel.getByTestId('mock-name-input').locator('input').fill('order patch')
		await panel.getByTestId('mock-url-input').fill(`${SITE}${PATCHED_PATH}`)
		await panel.getByTestId('method-POST').click()
		await panel.getByTestId('apply-request-body').click()
		await expect(panel.getByTestId('request-send-now')).toBeVisible()
		await expect(panel.getByTestId('section-off')).toHaveCount(0)
		await panel.locator('.ui.tab.active .cm-content').fill('{"qty":999}')
		await panel.getByTestId('apply-response-headers').click()
		await expect(panel.getByTestId('request-send-now')).toHaveCount(0)
		await panel.getByTestId('apply-response-headers').click()
		await expect(panel.getByTestId('section-off')).toBeVisible()
		await expect(panel.getByTestId('request-send-now')).toHaveCount(0)
		await panel.getByTestId('apply-request-body').click()
		await expect(panel.locator('.ui.tab.active .cm-content')).toContainText('"qty":999')
		await panel.getByTestId('mock-save-button').click()
		await expect(panel.getByTestId('request-patch-badge')).toBeVisible()

		await page.bringToFront()
		const body = await page.evaluate((url) => fetch(url, { method: 'POST', body: '{"qty":1}' })
			.then((response) => response.text()), `${SITE}${PATCHED_PATH}`)

		expect(body).toBe(REAL_BODY)
		expect(sentBodies).toEqual(['{"qty":999}'])
	})

	test('sends a request-body rule from the panel through the page to another origin', async () => {
		const API = 'https://api-e2e.test'
		const rule = {
			...storeWithRequestPatch.mocks[1],
			url: `${API}${PATCHED_PATH}`,
			apply: { responseBody: false, responseHeaders: false, requestBody: true },
			requestPatch: { mode: 'replace', body: '{"qty":7}' },
		}
		const launched = await launch({ ...store, mocks: [rule] })
		context = launched.context
		const received: Array<{ method: string; body: string | null; auth?: string }> = []
		await context.route(`${API}/**`, async (route) => {
			const req = route.request()
			const cors = {
				'access-control-allow-origin': SITE,
				'access-control-allow-credentials': 'true',
				'access-control-allow-headers': 'content-type, authorization',
				'access-control-allow-methods': 'POST',
			}
			if (req.method() === 'OPTIONS') {
				await route.fulfill({ status: 204, headers: cors })
				return
			}
			received.push({ method: req.method(), body: req.postData(), auth: (await req.allHeaders()).authorization })
			await route.fulfill({ status: 201, contentType: 'application/json', headers: cors, body: '{"created":true}' })
		})
		await openSite(context)

		const extensionId = new URL(launched.worker.url()).host
		const panel = await context.newPage()
		await panel.goto(`chrome-extension://${extensionId}/public/html/panel.html`)
		await panel.evaluate(async (site) => {
			const [siteTab] = await chrome.tabs.query({ url: `${site}/*` })
			localStorage.setItem('mockman.selectedTabId', String(siteTab.id))
		}, SITE)
		await panel.reload()
		await panel.getByTestId('mock-edit-button').first().click()
		await panel.getByTestId('request-send-now').click()
		const modal = panel.getByTestId('send-modal')
		const body = modal.locator('.cm-content').first()
		const setBody = async (text: string) => {
			await body.click()
			await panel.keyboard.press('ControlOrMeta+a')
			await panel.keyboard.insertText(text)
			await expect(body).toHaveText(text)
		}
		await setBody('{"qty":')
		await expect(panel.getByTestId('send-body-error')).toBeVisible()
		await expect(panel.getByTestId('send-button')).toBeDisabled()
		await setBody('{"qty":7}')
		await expect(panel.getByTestId('send-body-error')).toHaveCount(0)
		await modal.locator('.item', { hasText: 'Headers' }).first().click()
		await modal.getByRole('button', { name: 'Add Header' }).click()
		await modal.getByPlaceholder('Name', { exact: true }).last().fill('Authorization')
		await modal.getByPlaceholder('Value', { exact: true }).last().fill('Bearer e2e')
		await panel.getByTestId('send-button').click()

		await expect(panel.getByTestId('send-response-tab')).toContainText('201')
		await expect(panel.getByTestId('send-response')).toContainText('created')
		await panel.getByTestId('send-close').click()
		await expect(panel.getByTestId('send-modal')).toHaveCount(0)
		expect(received).toEqual([{ method: 'POST', body: '{"qty":7}', auth: 'Bearer e2e' }])
	})

	test('sends with the token the page used for another endpoint of the same site', async () => {
		const API = 'https://api-e2e.test'
		const rule = {
			...storeWithRequestPatch.mocks[1],
			url: `${API}/v1/obstacles/get`,
			apply: { responseBody: false, responseHeaders: false, requestBody: true },
			requestPatch: { mode: 'replace', body: '{"floor":0}' },
		}
		const launched = await launch({ ...store, mocks: [rule] })
		context = launched.context
		const received: Array<{ path: string; auth?: string; type?: string }> = []
		await context.route(`${API}/**`, async (route) => {
			const req = route.request()
			const cors = {
				'access-control-allow-origin': SITE,
				'access-control-allow-credentials': 'true',
				'access-control-allow-headers': 'content-type, authorization',
				'access-control-allow-methods': 'GET, POST',
			}
			if (req.method() === 'OPTIONS') {
				await route.fulfill({ status: 204, headers: cors })
				return
			}
			const headers = await req.allHeaders()
			received.push({ path: new URL(req.url()).pathname, auth: headers.authorization, type: headers['content-type'] })
			await route.fulfill({ status: headers.authorization ? 200 : 401, contentType: 'application/json', headers: cors, body: '{}' })
		})
		const page = await openSite(context)
		const panel = await context.newPage()
		await panel.goto(`chrome-extension://${new URL(launched.worker.url()).host}/public/html/panel.html`)
		await panel.evaluate(async (site) => {
			const [siteTab] = await chrome.tabs.query({ url: `${site}/*` })
			localStorage.setItem('mockman.selectedTabId', String(siteTab.id))
		}, SITE)
		await panel.reload()
		await panel.getByTestId('tab-logs').click()
		await page.evaluate((url) => fetch(url, { headers: { authorization: 'Bearer from-page' } }).then((r) => r.text()), `${API}/v1/obstacles/list`)
		await expect(panel.getByTestId('table-row')).toHaveCount(1)
		received.length = 0

		await panel.getByTestId('tab-mocks').click()
		await panel.getByTestId('mock-edit-button').first().click()
		await panel.getByTestId('request-send-now').click()
		await expect(panel.getByTestId('send-headers-from-site')).toContainText('api-e2e.test')
		await panel.getByTestId('send-button').click()

		await expect(panel.getByTestId('send-response-tab')).toContainText('200')
		expect(received).toEqual([{ path: '/v1/obstacles/get', auth: 'Bearer from-page', type: 'application/json' }])
	})

	test('sends from a mock form opened in a separate window, without breaking that window', async () => {
		const rule = {
			...storeWithRequestPatch.mocks[1],
			apply: { responseBody: false, responseHeaders: false, requestBody: true },
			requestPatch: { mode: 'replace', body: '{"qty":3}' },
		}
		const launched = await launch({ ...store, mocks: [rule] })
		context = launched.context
		const sentBodies: string[] = []
		await openSite(context, sentBodies)

		const panel = await context.newPage()
		await panel.goto(`chrome-extension://${new URL(launched.worker.url()).host}/public/html/panel.html`)
		await panel.evaluate(async (site) => {
			const [siteTab] = await chrome.tabs.query({ url: `${site}/*` })
			localStorage.setItem('mockman.selectedTabId', String(siteTab.id))
		}, SITE)
		await panel.reload()
		await panel.getByTestId('mock-edit-button').first().click()
		const popupOpened = context.waitForEvent('page')
		await panel.getByTitle('Open in separate window').click()
		const popup = await popupOpened

		await popup.getByTestId('request-send-now').click()
		await expect(popup.getByTestId('send-modal')).toBeVisible()
		await expect(panel.getByTestId('send-modal')).toHaveCount(0)
		await popup.getByTestId('send-button').click()
		await expect(popup.getByTestId('send-response-tab')).toContainText('200')
		expect(sentBodies).toEqual(['{\n  "qty": 3\n}'])

		await popup.getByRole('button', { name: 'Close' }).last().click()
		await expect(popup.getByTestId('send-modal')).toHaveCount(0)
		await expect(popup.locator('body')).not.toHaveClass(/dimmed/)
		await expect(popup.getByTestId('request-send-now')).toBeVisible()

		await popup.getByTestId('request-send-now').click()
		await expect(popup.getByTestId('send-modal')).toBeVisible()
		await popup.close()
		await expect(panel.getByTestId('send-modal')).toHaveCount(0)
	})

	test('switching a collection off turns its mocks off, and switching it on leaves them off', async () => {
		const launched = await launch(flowStore())
		context = launched.context
		const page = await openSite(context)
		const panel = await context.newPage()
		await panel.goto(`chrome-extension://${new URL(launched.worker.url()).host}/public/html/panel.html`)
		const post = () => page.evaluate((u) => fetch(u, { method: 'POST', body: '{}' }).then((r) => r.text()), `${TASKS}/query`)
		const toggle = panel.locator('[class*="collectionMockingBtn"]').first()
		const readMocks = () => panel.evaluate(() => new Promise<Array<{ id: string; active: boolean }>>((resolve) => {
			chrome.storage.local.get('mockman.extension.main.db', (d) => resolve((d['mockman.extension.main.db'] as { mocks: Array<{ id: string; active: boolean }> }).mocks))
		}))

		expect(await post()).toBe(LIST_BODY)

		await toggle.click()
		await expect.poll(post).toBe(REAL_BODY)
		expect((await readMocks()).map((m) => [m.id, m.active])).toEqual([['tasks-list', false], ['tasks-empty', false]])

		await toggle.click()
		await expect.poll(async () => (await readMocks()).length).toBe(2)
		expect((await readMocks()).map((m) => [m.id, m.active])).toEqual([['tasks-list', false], ['tasks-empty', false]])
		expect(await post()).toBe(REAL_BODY)
	})

	test('opens the body search with Ctrl/Cmd+F from anywhere in the mock form', async () => {
		const launched = await launch({ ...store, mocks: [] })
		context = launched.context
		const panel = await context.newPage()
		await panel.goto(`chrome-extension://${new URL(launched.worker.url()).host}/public/html/panel.html`)
		await panel.getByTestId('add-mock-button').click()
		await panel.getByTestId('mock-name-input').locator('input').click()
		await panel.evaluate(() => {
			const w = window as unknown as { forwardedToDevtools: number }
			w.forwardedToDevtools = 0
			document.addEventListener('keydown', (event) => {
				if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
					event.preventDefault()
					w.forwardedToDevtools += 1
				}
			})
		})

		await panel.keyboard.press('ControlOrMeta+f')
		const responseFind = panel.locator('.ui.tab.active [data-testid="editor-find-bar"]')
		await expect(responseFind).toBeVisible()
		await expect(responseFind.locator('input').first()).toBeFocused()
		expect(await panel.evaluate(() => (window as unknown as { forwardedToDevtools: number }).forwardedToDevtools)).toBe(0)

		await panel.keyboard.press('Escape')
		await panel.getByTestId('apply-request-body').click()
		await panel.getByTestId('mock-url-input').click()
		await panel.keyboard.press('ControlOrMeta+f')
		await expect(panel.locator('.ui.tab.active [data-testid="editor-find-bar"]')).toBeVisible()
	})

	test('shows a multi-megabyte response whole, scrolling inside its editor', async () => {
		const items = Array.from({ length: 12000 }, (_, i) => ({ id: i, name: `Cell type ${i}`, zone_ids: [1, 2, 3], flags: { is_active: true } }))
		const big = JSON.stringify({ items, total: items.length })
		const launched = await launch({ ...store, mocks: [] })
		context = launched.context
		const page = await context.newPage()
		await page.route(`${SITE}/**`, (route) => route.request().url().includes('/api/')
			? route.fulfill({ status: 200, contentType: 'application/json', body: big })
			: route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>ok</body></html>' }))
		await page.goto(`${SITE}/index.html`)
		const panel = await context.newPage()
		await panel.goto(`chrome-extension://${new URL(launched.worker.url()).host}/public/html/panel.html`)
		await panel.evaluate(async (site) => {
			const [siteTab] = await chrome.tabs.query({ url: `${site}/*` })
			localStorage.setItem('mockman.selectedTabId', String(siteTab.id))
		}, SITE)
		await panel.reload()
		await panel.getByTestId('tab-logs').click()
		await page.evaluate((url) => fetch(url).then((r) => r.text()), `${SITE}/api/v2/celltypes/get-all`)
		await panel.getByTestId('log-time').first().click()

		await expect(panel.getByTestId('log-body-large')).toBeVisible()
		const height = await panel.locator('.cm-editor').first().evaluate((el) => el.getBoundingClientRect().height)
		expect(height).toBeLessThan(2000)
		await panel.locator('.cm-scroller').first().evaluate((el) => { el.scrollTop = el.scrollHeight })
		await expect(panel.locator('.cm-line', { hasText: '"total": 12000' })).toBeVisible()
	})

	test('walks a collection scenario: one endpoint answers differently call after call', async () => {
		const launched = await launch(flowStore(tasksScenario))
		context = launched.context
		const page = await openSite(context)
		const panel = await context.newPage()
		await panel.goto(`chrome-extension://${new URL(launched.worker.url()).host}/public/html/panel.html`)
		await panel.evaluate(async (site) => {
			const [siteTab] = await chrome.tabs.query({ url: `${site}/*` })
			localStorage.setItem('mockman.selectedTabId', String(siteTab.id))
		}, SITE)
		await panel.reload()
		await panel.getByTestId('tab-logs').click()
		const post = (url: string) => page.evaluate((u) => fetch(u, { method: 'POST', body: '{}' }).then((r) => r.text()), url)

		expect(await post(`${TASKS}/query`)).toBe(LIST_BODY)
		expect(await post(`${TASKS}/complete`)).toBe(REAL_BODY)
		expect(await post(`${TASKS}/query`)).toBe(EMPTY_BODY)
		// The endpoint's last rule answers every later call too.
		expect(await post(`${TASKS}/query`)).toBe(EMPTY_BODY)
		await expect(panel.getByTestId('log-scenario-icon')).toHaveCount(4)

		await panel.getByTestId('tab-mocks').click()
		await panel.getByTestId('scenario-state-badge').click()
		await expect(panel.getByText('The call count starts over')).toBeVisible()
		expect(await post(`${TASKS}/query`)).toBe(LIST_BODY)

		expect(await post(`${TASKS}/query`)).toBe(EMPTY_BODY)
		await page.reload()
		expect(await post(`${TASKS}/query`)).toBe(LIST_BODY)

		await panel.getByTestId('collection-settings-button').click()
		await panel.getByTestId('scenario-reset').click()
		await expect(panel.getByText('The call count starts over').last()).toBeVisible()
		expect(await post(`${TASKS}/query`)).toBe(LIST_BODY)
	})

	test('answers an endpoint in turn with rules set up in the collection settings', async () => {
		const launched = await launch(flowStore())
		context = launched.context
		const page = await openSite(context)
		const panel = await context.newPage()
		await panel.goto(`chrome-extension://${new URL(launched.worker.url()).host}/public/html/panel.html`)
		await panel.evaluate(async (site) => {
			const [siteTab] = await chrome.tabs.query({ url: `${site}/*` })
			localStorage.setItem('mockman.selectedTabId', String(siteTab.id))
		}, SITE)
		await panel.reload()

		await panel.getByTestId('collection-settings-button').click()
		await panel.getByTestId('scenario-enabled').click()
		await panel.getByTestId('scenario-add-rule').click()
		await panel.getByTestId('scenario-add-rule').click()
		const rules = panel.getByTestId('scenario-rule')
		await expect(rules).toHaveCount(2)
		await expect(rules.nth(0).getByTestId('scenario-rule-call')).toHaveText('1')
		await expect(rules.nth(1).getByTestId('scenario-rule-call')).toHaveText('2')
		const respond = rules.nth(1).getByTestId('scenario-rule-respond')
		await respond.click()
		await panel.keyboard.press('Escape')
		await expect(respond.locator('.menu')).toBeHidden()
		await expect(panel.getByTestId('collection-modal')).toBeVisible()
		await respond.click()
		await respond.locator('.item', { hasText: 'tasks empty' }).click()
		await panel.getByTestId('collection-modal-save').click()
		await expect(panel.getByTestId('collection-modal')).toHaveCount(0)
		await expect(panel.getByTestId('scenario-state-badge')).toBeVisible()

		const post = () => page.evaluate((u) => fetch(u, { method: 'POST', body: '{}' }).then((r) => r.text()), `${TASKS}/query`)
		expect(await post()).toBe(LIST_BODY)
		expect(await post()).toBe(EMPTY_BODY)
		expect(await post()).toBe(EMPTY_BODY)

		await panel.getByTestId('collection-settings-button').click()
		await expect(panel.getByTestId('scenario-rule')).toHaveCount(2)
		await panel.getByTestId('collection-modal-close').click()
		await expect(panel.getByTestId('collection-modal')).toHaveCount(0)
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
