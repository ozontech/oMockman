/**
 * Regenerates THIRD-PARTY-NOTICES.md from the installed dependency tree.
 *
 * Only what is actually distributed is listed: the runtime subtree, minus packages whose
 * code never reaches dist/ (build-time helpers such as the Babel chain behind
 * @emotion/babel-plugin). Run `npm run build` first, so dist/ reflects the current source.
 *
 * Usage: node scripts/generate-third-party-notices.mjs [--check]
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const OUTPUT = path.join(ROOT, 'THIRD-PARTY-NOTICES.md')
const BUNDLE_DIRS = [path.join(ROOT, 'dist/chrome'), path.join(ROOT, 'dist/firefox')]

/**
 * Bundled assets are not npm code, so they carry their own terms and are listed by hand.
 * Semantic UI ships the Font Awesome icon fonts, whose icons are CC BY 4.0 — attribution
 * is required, and semantic-ui-css's own MIT licence does not cover it.
 */
const ASSET_NOTICES = [
	{
		name: 'Font Awesome Free 5.0.8',
		homepage: 'https://fontawesome.com',
		via: 'bundled with semantic-ui-css as the icons/outline-icons/brand-icons webfonts',
		license: 'Icons: CC BY 4.0 · Fonts: SIL OFL 1.1 · Code: MIT',
		licenseUrl: 'https://fontawesome.com/license',
	},
]

/**
 * Runtime packages, read from the lockfile rather than `npm ls`: the tree output omits a
 * package that is deduplicated under another parent, which silently drops entries.
 * Returns the install path per package, so a nested copy is read from where it lives.
 */
function readRuntimePackages() {
	const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'))
	const found = new Map()
	for (const [installPath, info] of Object.entries(lock.packages ?? {})) {
		if (!installPath.startsWith('node_modules/') || info.dev) continue
		const name = installPath.replace(/^.*node_modules\//, '')
		// A root-level copy wins over a nested one; either carries the same licence.
		if (!found.has(name) || installPath.split('node_modules/').length === 2) {
			found.set(name, installPath)
		}
	}
	return found
}

function readPackage(name, installPath) {
	const dir = path.join(ROOT, installPath)
	try {
		return { dir, meta: JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) }
	} catch {
		return null
	}
}

function readLicenseText(dir) {
	let entries
	try {
		entries = fs.readdirSync(dir)
	} catch {
		return null
	}
	const file = entries.find((entry) => /^(license|licence|copying)(\.|$)/i.test(entry))
	if (!file) return null
	try {
		const text = fs.readFileSync(path.join(dir, file), 'utf8').trim()
		return text || null
	} catch {
		return null
	}
}

/** Everything the built bundles contain, as one lowercased haystack. */
function readBundles() {
	const chunks = []
	for (const dir of BUNDLE_DIRS) {
		if (!fs.existsSync(dir)) continue
		const stack = [dir]
		while (stack.length) {
			const current = stack.pop()
			for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
				const full = path.join(current, entry.name)
				if (entry.isDirectory()) {
					stack.push(full)
				} else if (/\.(js|css)$/.test(entry.name)) {
					chunks.push(fs.readFileSync(full, 'utf8'))
				}
			}
		}
	}
	if (!chunks.length) {
		throw new Error('No built bundles found. Run `npm run build:chrome` and `npm run build:firefox` first.')
	}
	return chunks.join('\n').toLowerCase()
}

/**
 * A package counts as distributed when the bundle carries its name, its own marker string,
 * or a file path from it. Minification drops most identifiers, so misses are possible:
 * KNOWN_BUNDLED lists what was confirmed by hand.
 */
const KNOWN_BUNDLED = new Set([
	'react', 'react-dom', 'scheduler', 'object-assign', 'loose-envify', 'js-tokens',
	'semantic-ui-react', 'semantic-ui-css', 'prop-types', 'react-is', 'warning',
	'@popperjs/core', 'react-popper', 'react-fast-compare',
	'@fluentui/react-component-event-listener', '@fluentui/react-component-ref',
	'@semantic-ui-react/event-stack', 'clsx', 'keyboard-key', 'shallowequal',
	'hoist-non-react-statics', 'exenv', 'lodash', 'lodash-es',
	'react-toastify', 'zustand', 'use-sync-external-store',
	'jsonschema', 'jsonc-parser', 'path-to-regexp',
	'@babel/runtime',
	'@emotion/react', '@emotion/cache', '@emotion/serialize', '@emotion/sheet',
	'@emotion/utils', '@emotion/hash', '@emotion/memoize', '@emotion/unitless',
	'@emotion/weak-memoize', '@emotion/use-insertion-effect-with-fallbacks', 'stylis',
	'@uiw/react-codemirror', '@uiw/codemirror-extensions-basic-setup', 'codemirror',
	'@codemirror/autocomplete', '@codemirror/commands', '@codemirror/lang-json',
	'@codemirror/language', '@codemirror/lint', '@codemirror/search', '@codemirror/state',
	'@codemirror/theme-one-dark', '@codemirror/view',
	'@lezer/common', '@lezer/highlight', '@lezer/json', '@lezer/lr',
	'style-mod', 'crelt', 'w3c-keyname', '@marijn/find-cluster-break',
])

function main() {
	const check = process.argv.includes('--check')
	const runtime = readRuntimePackages()
	const bundles = readBundles()

	const rows = []
	const skipped = []
	for (const name of [...runtime.keys()].sort()) {
		const pkg = readPackage(name, runtime.get(name))
		if (!pkg) continue

		// A short or dictionary-word name ("ms", "resolve", "debug") matches as a substring of
		// unrelated code, so those count only when listed in KNOWN_BUNDLED.
		const nameIsDistinctive = name.startsWith('@') || (name.length > 8 && name.includes('-'))
		const distributed = KNOWN_BUNDLED.has(name) || (nameIsDistinctive && bundles.includes(name.toLowerCase()))
		if (!distributed) {
			skipped.push(name)
			continue
		}

		const { meta, dir } = pkg
		const license = typeof meta.license === 'string'
			? meta.license
			: meta.license?.type ?? (Array.isArray(meta.licenses) ? meta.licenses.map((l) => l.type).join(' OR ') : 'UNKNOWN')

		rows.push({
			name,
			license,
			homepage: meta.homepage ?? (typeof meta.repository === 'string' ? meta.repository : meta.repository?.url) ?? '',
			text: readLicenseText(dir),
		})
	}

	const unknown = rows.filter((row) => row.license === 'UNKNOWN')
	if (unknown.length) {
		throw new Error(`Packages without a declared licence: ${unknown.map((r) => r.name).join(', ')}`)
	}

	const lines = []
	lines.push('# Third-party notices')
	lines.push('')
	lines.push('Mockman redistributes the third-party software listed here. Each entry keeps its own')
	lines.push('licence, which applies to that component rather than to Mockman as a whole.')
	lines.push('')
	lines.push('Generated by `npm run notices`. Do not edit by hand.')
	lines.push('')

	lines.push('## Bundled assets')
	lines.push('')
	for (const asset of ASSET_NOTICES) {
		lines.push(`### ${asset.name}`)
		lines.push('')
		lines.push(`- Source: ${asset.homepage}`)
		lines.push(`- Included as: ${asset.via}`)
		lines.push(`- Licence: ${asset.license}`)
		lines.push(`- Full terms: ${asset.licenseUrl}`)
		lines.push('')
	}

	const byLicense = new Map()
	for (const row of rows) {
		byLicense.set(row.license, (byLicense.get(row.license) ?? 0) + 1)
	}

	lines.push('## npm packages')
	lines.push('')
	lines.push(`${rows.length} packages: ${[...byLicense].sort((a, b) => b[1] - a[1]).map(([l, c]) => `${l} (${c})`).join(', ')}.`)
	lines.push('')
	// No versions: a licence belongs to the package, and a patch bump must not make every
	// dependency update fail the check. A new package or a changed licence still does.
	lines.push('| Package | Licence |')
	lines.push('|---|---|')
	for (const row of rows) {
		lines.push(`| ${row.name} | ${row.license} |`)
	}
	lines.push('')
	lines.push('## Licence texts')
	lines.push('')
	for (const row of rows) {
		lines.push(`### ${row.name}`)
		lines.push('')
		lines.push(`Licence: ${row.license}`)
		if (row.homepage) lines.push(`Homepage: ${row.homepage.replace(/^git\+/, '').replace(/\.git$/, '')}`)
		lines.push('')
		if (row.text) {
			lines.push('```')
			lines.push(row.text)
			lines.push('```')
		} else {
			lines.push(`_No licence file shipped in the package; the declared licence is ${row.license}._`)
		}
		lines.push('')
	}

	const content = `${lines.join('\n').trimEnd()}\n`

	if (check) {
		const current = fs.existsSync(OUTPUT) ? fs.readFileSync(OUTPUT, 'utf8') : ''
		if (current !== content) {
			console.error('THIRD-PARTY-NOTICES.md is out of date. Run `npm run notices`.')
			process.exit(1)
		}
		console.log(`THIRD-PARTY-NOTICES.md is up to date (${rows.length} packages).`)
		return
	}

	fs.writeFileSync(OUTPUT, content)
	console.log(`Wrote ${path.relative(ROOT, OUTPUT)}: ${rows.length} distributed packages, ${skipped.length} build-only skipped.`)
	console.log(`Skipped: ${skipped.join(', ')}`)
}

main()
