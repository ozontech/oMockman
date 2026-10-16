import type { Page, BrowserContext } from '@playwright/test'

const BASE_URL = (extensionId: string) => {
	return `chrome-extension://${extensionId}/public/html/panel.html`
}

const CHROME_EXTENSION_ID = 'dbkpaefljpbnilbfokieiiliihgcjgipj'

/**
 * The panel shows when a log came and when a mock was made: with the real clock every screenshot
 * would differ. Only `Date` stands still; timers and animations run as usual.
 */
export const FIXED_NOW = new Date('2026-01-15T10:30:00+03:00')

function freezeDate(fixed: number): void {
	const RealDate = Date
	function FixedDate(this: unknown, ...args: unknown[]): Date | string {
		if (!(this instanceof FixedDate)) return new RealDate(fixed).toString()
		return args.length === 0 ? new RealDate(fixed) : new (RealDate as unknown as new (...a: unknown[]) => Date)(...args)
	}
	FixedDate.prototype = RealDate.prototype
	FixedDate.now = () => fixed
	FixedDate.parse = RealDate.parse
	FixedDate.UTC = RealDate.UTC
	;(globalThis as unknown as { Date: unknown }).Date = FixedDate
}

export class ExtensionPage {
	constructor(
		public page: Page,
		public extensionId: string = CHROME_EXTENSION_ID,
	) {}

	static async create(context: BrowserContext, extensionId?: string): Promise<ExtensionPage> {
		const page = await context.newPage()
		await page.addInitScript(freezeDate, FIXED_NOW.getTime())

		await page.route('https://fonts.googleapis.com/**', async (route) => {
			await route.fulfill({ status: 200, body: '' })
		})

		return new ExtensionPage(page, extensionId)
	}

	async go(): Promise<void> {
		const url = BASE_URL(this.extensionId)
		await this.page.goto(url, { waitUntil: 'load' })
	}

	async setTheme(theme: 'light' | 'dark'): Promise<void> {
		await this.page.getByTestId('settings-button').click()
		await this.page.getByTestId('nav-other').click()

		const currentTheme = await this.page.locator('input[name="theme"]:checked').inputValue()

		if (currentTheme === theme) {
			await this.page.getByTestId('settings-close').click()
			return
		}

		await this.page.getByTestId(`theme-${theme}`).click({ force: true })

		await this.page.getByTestId('settings-save').click()
		await this.page.waitForTimeout(500)
		await this.page.getByTestId('settings-close').click()
	}

	async clickMocksTab(): Promise<void> {
		await this.page.getByTestId('tab-mocks').click()
	}

	async clickLogsTab(): Promise<void> {
		await this.page.waitForTimeout(500)
		await this.page.getByTestId('tab-logs').click()
	}

	async close(): Promise<void> {
		await this.page.close()
	}
}
