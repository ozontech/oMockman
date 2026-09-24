import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
	tsconfig: './tsconfig.playwright.json',
	testDir: './playwright/tests',
	timeout: 60000,
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: 1,
	// Allure is opt-in: a plain checkout only needs the line reporter.
	reporter: process.env.ALLURE_RESULTS
		? [['line'], ['allure-playwright', { resultsFolder: process.env.ALLURE_RESULTS }]]
		: [['line']],
	snapshotPathTemplate: 'playwright/snapshots/{testFilePath}/{arg}{ext}',
	use: {
		headless: true,
		trace: process.env.CI ? 'on-first-retry' : 'on-first-retry',
		screenshot: 'only-on-failure',
		video: 'retain-on-failure',
		viewport: { width: 1920, height: 1080 },
		testIdAttribute: 'data-testid',
	},
	projects: [
		{
			name: 'extension',
			testDir: './playwright/tests/extension',
			use: {
				...devices['Desktop Chrome'],
				channel: 'chromium',
			},
		},
	],
})