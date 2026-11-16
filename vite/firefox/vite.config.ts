import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vite'

import { copyStatic } from '../copy-static'
import { stripExternalImports } from '../strip-external-imports'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '../..')
const src = path.resolve(projectRoot, 'src')

export default defineConfig({
	plugins: [
		{
			name: 'lodash-global-without-eval',
			enforce: 'pre',
			transform(_code, id) {
				// Lodash's legacy Function('return this') fallback is unnecessary in
				// supported Firefox versions and is flagged by the add-on validator.
				if (/[/\\]node_modules[/\\]lodash[/\\]_root\.js$/.test(id)) {
					return { code: 'module.exports = globalThis;', map: null }
				}
				if (/[/\\]node_modules[/\\]lodash-es[/\\]_root\.js$/.test(id)) {
					return { code: 'export default globalThis;', map: null }
				}
			},
		},
		copyStatic([
			{ from: path.resolve(projectRoot, 'public/firefox/manifest.json'), to: '.' },
			{ from: path.resolve(projectRoot, 'public/icons'), to: 'public/icons', include: /\.(svg|png)$/ },
		]),
	],
	css: {
		postcss: {
			plugins: [stripExternalImports()],
		},
	},
	publicDir: false,
	root: projectRoot,
	resolve: {
		alias: {
			'@': path.resolve(projectRoot, 'src'),
			'keyboard-key': path.resolve(projectRoot, 'src/vendor/keyboard-key.ts'),
		},
		extensions: ['.js', '.ts', '.jsx', '.tsx'],
	},
	build: {
		outDir: path.resolve(projectRoot, 'dist/firefox'),
		rollupOptions: {
			input: {
				panel: path.resolve(projectRoot, 'public/html/panel.html'),
				mcp: path.resolve(projectRoot, 'public/html/mcp.html'),
				devtool: path.join(projectRoot, 'public/html/devtool.html'),
				popup: path.join(projectRoot, 'public/html/popup.html'),
				content_script: path.join(src, 'content-script.ts'),
				inject: path.join(src, 'inject/inject.ts'),
			},
			output: {
				entryFileNames: 'js/[name].js',
				chunkFileNames: 'js/chunk-[name].[hash].js',
				manualChunks: (id) => {
					if (!id.includes('node_modules')) return undefined

					if (id.includes('@uiw/react-codemirror') || id.includes('@codemirror')) {
						return 'codemirror'
					}

					if (
						id.includes('react')
						|| id.includes('react-dom')
						|| id.includes('react-redux')
						|| id.includes('@reduxjs/toolkit')
						|| id.includes('semantic-ui-react')
						|| id.includes('lodash')
					) {
						return 'react-vendor'
					}

					return undefined
				},
				assetFileNames: (assetInfo) => {
					const ext = path.extname(assetInfo.name || '').slice(1)
					if (/png|jpe?g|gif|svg/.test(ext)) return 'assets/images/[name].[hash][extname]'
					if (/ttf|woff2?|eot/.test(ext)) return 'assets/fonts/[name].[hash][extname]'
					return 'assets/[name].[hash][extname]'
				},
			},
		},
	},
})
