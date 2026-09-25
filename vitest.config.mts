import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { defineConfig } from 'vitest/config'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

// Allure is opt-in via ALLURE_RESULTS.
const allureResults = process.env.ALLURE_RESULTS

export default defineConfig({
	resolve: {
		alias: {
			'@': path.resolve(__dirname, 'src'),
		},
	},
	test: {
		environment: 'jsdom',
		globals: true,
		watch: false,
		include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
		exclude: ['**/node_modules/**', '**/dist/**', 'playwright/**'],
		setupFiles: [
			...(allureResults ? ['allure-vitest/setup'] : []),
			path.resolve(__dirname, 'src/__tests__/setup.ts'),
		],
		reporters: [
			'default',
			'junit',
			...(allureResults ? [['allure-vitest/reporter', { resultsDir: allureResults }] as [string, Record<string, unknown>]] : []),
		],
		outputFile: { junit: 'junit.xml' },
		coverage: {
			provider: 'istanbul',
			include: ['src/**'],
			exclude: ['**/__tests__/**', '**/__fixtures__/**', '**/__mocks__/**', 'src/types/**', '**/*.d.ts'],
			reporter: ['text', 'text-summary', 'json', 'json-summary', 'html', 'cobertura', 'lcov'],
			thresholds: {
				lines: 50,
				statements: 50,
			},
		},
	},
})
