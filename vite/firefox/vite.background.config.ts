import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '../..')
const srcRoot = path.resolve(projectRoot, 'src')

export default defineConfig({
	publicDir: false,
	resolve: { alias: { '@': srcRoot } },
	build: {
		outDir: path.resolve(projectRoot, 'dist/firefox'),
		emptyOutDir: false,
		rollupOptions: {
			input: { background: path.join(srcRoot, 'background.ts') },
			output: {
				format: 'iife',
				entryFileNames: 'js/background.js',
				globals: {
					chrome: 'chrome',
				},
			},
		},
	},
})
