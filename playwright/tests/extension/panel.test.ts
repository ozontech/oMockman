import type { Page } from '@playwright/test'
import { test, expect } from '@playwright/test'
import { allure } from 'allure-playwright'

import { InitExtension } from '../../init-extension'
import { ExtensionPage } from '../../pages/extension-page'

async function expectWithScreenshot(page: Page, assertion: () => Promise<void>, testName: string) {
	try {
		await assertion()
	} catch (e) {
		const screenshot = await page.screenshot({ fullPage: true })
		allure.attachment(`${testName} - actual`, screenshot, 'image/png')
		throw e
	}
}

test.describe('Mockman Extension Panel', { tag: '@extension' }, () => {
	let initExtension: InitExtension

	test.beforeEach(async () => {
		await allure.epic('Extension Panel')
		initExtension = new InitExtension()
	})

	test.afterEach(async () => {
		await initExtension.closeContext()
	})

	test('Mocks tab screenshot (light theme, no mocks)', async () => {
		await allure.story('Mocks - screenshots')
		const extensionId = await initExtension.installExtension()
		const page = await ExtensionPage.create(initExtension.context!, extensionId)
		await page.go()
		await page.setTheme('light')

		await expectWithScreenshot(page.page, async () => {
			await expect(page.page).toHaveScreenshot('mocks-tab-light.png', { fullPage: true, maxDiffPixelRatio: 0.02 })
		}, 'mocks-tab-light')
		await page.close()
	})

	test('Mocks tab screenshot (dark theme, no mocks)', async () => {
		await allure.story('Mocks - screenshots')
		const extensionId = await initExtension.installExtension()
		const page = await ExtensionPage.create(initExtension.context!, extensionId)
		await page.go()
		await page.setTheme('dark')

		await expectWithScreenshot(page.page, async () => {
			await expect(page.page).toHaveScreenshot('mocks-tab-dark.png', { fullPage: true, maxDiffPixelRatio: 0.02 })
		}, 'mocks-tab-dark')
		await page.close()
	})

	test('Logs tab screenshot (light theme, empty)', async () => {
		await allure.story('Logs - screenshots')
		const extensionId = await initExtension.installExtension()
		const page = await ExtensionPage.create(initExtension.context!, extensionId)
		await page.go()
		await page.setTheme('light')
		await page.clickLogsTab()

		await expectWithScreenshot(page.page, async () => {
			await expect(page.page).toHaveScreenshot('logs-tab-light.png', { fullPage: true, maxDiffPixelRatio: 0.02 })
		}, 'logs-tab-light')
		await page.close()
	})

	test('Logs tab screenshot (dark theme, empty)', async () => {
		await allure.story('Logs - screenshots')
		const extensionId = await initExtension.installExtension()
		const page = await ExtensionPage.create(initExtension.context!, extensionId)
		await page.go()
		await page.setTheme('dark')
		await page.clickLogsTab()

		await expectWithScreenshot(page.page, async () => {
			await expect(page.page).toHaveScreenshot('logs-tab-dark.png', { fullPage: true, maxDiffPixelRatio: 0.02 })
		}, 'logs-tab-dark')
		await page.close()
	})

	test('Mocks tab screenshot (light theme, with mocks)', async () => {
		await allure.story('Mocks - screenshots')
		const extensionId = await initExtension.installExtension(true)
		const page = await ExtensionPage.create(initExtension.context!, extensionId)
		await page.go()
		await page.setTheme('light')

		await page.page.waitForTimeout(5000)

		await expectWithScreenshot(page.page, async () => {
			await expect(page.page).toHaveScreenshot('mocks-tab-light-with-data.png', { fullPage: true, maxDiffPixelRatio: 0.02 })
		}, 'mocks-tab-light-with-data')
		await page.close()
	})

	test('Mocks tab screenshot (dark theme, with mocks)', async () => {
		await allure.story('Mocks - screenshots')
		const extensionId = await initExtension.installExtension(true)
		const page = await ExtensionPage.create(initExtension.context!, extensionId)
		await page.go()
		await page.setTheme('dark')

		await page.page.waitForTimeout(5000)

		await expectWithScreenshot(page.page, async () => {
			await expect(page.page).toHaveScreenshot('mocks-tab-dark-with-data.png', { fullPage: true, maxDiffPixelRatio: 0.02 })
		}, 'mocks-tab-dark-with-data')
		await page.close()
	})
})
