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
		target: 'es2022',
		outDir: path.resolve(projectRoot, 'dist/firefox'),
		emptyOutDir: false,
		rollupOptions: {
			input: { inject: path.join(srcRoot, 'inject', 'inject.ts') },
			output: {
				format: 'iife',
				entryFileNames: 'js/inject.js',
			},
		},
	},
})
