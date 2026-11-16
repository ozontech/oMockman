/** Cross-platform packaging. Firefox archives are unsigned; no signing keys are read. */
import fs from 'node:fs'
import path from 'node:path'

import { zipSync } from 'fflate'

const root = path.resolve(import.meta.dirname, '..')
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version
const targets = process.argv.slice(2)
const selected = targets.length ? targets : ['chrome', 'firefox', 'mcp']
for (const target of selected) {
	if (!['chrome', 'firefox', 'mcp'].includes(target)) throw new Error(`Unknown package: ${target}`)
	const source = path.join(root, 'dist', target)
	const files = {}
	function collect(directory) {
		for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
			if (entry.name.startsWith('.')) continue
			const file = path.join(directory, entry.name)
			if (entry.isDirectory()) collect(file)
			else if (entry.isFile()) {
				const name = path.relative(source, file).split(path.sep).join('/')
				files[name] = fs.readFileSync(file)
			}
		}
	}
	collect(source)
	const manifestName = target === 'mcp' ? 'package.json' : 'manifest.json'
	if (!files[manifestName]) throw new Error(`Build ${target} before packaging`)
	if (target === 'chrome') {
		const manifest = JSON.parse(files[manifestName].toString())
		delete manifest.key
		files[manifestName] = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`)
	}
	const suffix = target === 'firefox' ? 'xpi' : 'zip'
	fs.mkdirSync(path.join(root, 'release'), { recursive: true })
	const destination = path.join(root, 'release', `omockman-${target}-v${version}.${suffix}`)
	fs.writeFileSync(destination, zipSync(files, { level: 6 }))
	console.log(`Created ${path.relative(root, destination)}${target === 'firefox' ? ' (unsigned)' : ''}`)
}
