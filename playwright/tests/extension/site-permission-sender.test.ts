import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { chromium, expect, test } from '@playwright/test'

test('saves site access from the packaged panel with a real sender.tab', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'mockman-site-access-'))
    const extension = path.resolve('dist/chrome')
    const context = await chromium.launchPersistentContext(directory, {
        channel: 'chromium', headless: true,
        args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    })
    try {
        const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')
        const origin = 'https://mockman-site-access.test'
        await context.route(`${origin}/**`, route => route.fulfill({ contentType: 'text/html', body: '<title>Application</title>' }))
        const app = await context.newPage()
        await app.goto(`${origin}/`)
        const tabId = await worker.evaluate(async url => (await chrome.tabs.query({})).find(tab => tab.url === url)?.id, `${origin}/`)
        expect(tabId).toBeDefined()
        const panel = await context.newPage()
        await panel.addInitScript(id => {
            localStorage.setItem('mockman.selectedTabId', String(id))
            localStorage.setItem('mockman.lang', 'en')
        }, tabId)
        // No mocked sendMessage and no popup relay: Chrome provides the real sender.
        await panel.goto(`chrome-extension://${new URL(worker.url()).host}/public/html/panel.html`)
        await expect(panel.getByTestId('site-access-banner')).toBeVisible()
        await panel.getByTestId('site-access-banner-action').click()
        await expect(panel.getByTestId('site-access-banner')).toHaveCount(0)
        await expect.poll(() => worker.evaluate(async site => {
            const data = await chrome.storage.local.get('mockman.extension.main.db')
            const library = data['mockman.extension.main.db'] as { sitePermissions?: Record<string, unknown> } | undefined
            return Boolean(library?.sitePermissions?.[site])
        }, origin)).toBe(true)
        await expect(panel.locator('.Toastify__toast--error')).toHaveCount(0)
    } finally {
        await context.close()
        await rm(directory, { recursive: true, force: true })
    }
})
