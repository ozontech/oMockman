import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { copyFile, cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'

const source = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const root = resolve(source, '../..')
const out = resolve(root, 'dist/mcp')
if (process.argv.includes('--release') && execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { cwd: root, encoding: 'utf8' }).trim()) {
	throw new Error('Release MCP builds require a clean source checkout')
}
await rm(out, { recursive: true, force: true })
await mkdir(out, { recursive: true })
const result = await build({
	absWorkingDir: root,
	entryPoints: [join(source, 'index.js'), join(source, 'broker.js')],
	outdir: out,
	bundle: true,
	platform: 'node',
	format: 'esm',
	target: 'node22',
	metafile: true,
	legalComments: 'eof',
	external: ['bufferutil', 'utf-8-validate'],
	banner: {
		js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
	},
})
const packages = new Map()
for (const input of Object.keys(result.metafile.inputs)) {
	if (!input.includes('node_modules/')) continue
	let directory = dirname(resolve(root, input))
	while (directory.startsWith(root) && !existsSync(join(directory, 'package.json')))
		directory = dirname(directory)
	if (!directory.startsWith(root)) throw new Error('Unexpected dependency outside build root')
	let manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))
	while (!manifest.name) {
		directory = dirname(directory)
		if (!directory.startsWith(root)) throw new Error('Cannot identify dependency')
		if (existsSync(join(directory, 'package.json')))
			manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))
	}
	if (manifest.name?.startsWith('@fe/')) throw new Error('Corporate dependency in artifact')
	packages.set(`${manifest.name}@${manifest.version}`, { directory, manifest })
}
const notices = ['# Third-party notices\n\nLicenses of dependencies bundled into the Mockman MCP server.\n']
const licenses = []
for (const [key, { directory, manifest }] of [...packages].sort(([a], [b]) => a.localeCompare(b))) {
	const files = (await readdir(directory)).filter((name) =>
		/^(license|licence|notice|copying)(\.|$)/i.test(name),
	).sort()
	if (!files.length) throw new Error(`Missing license: ${key}`)
	notices.push(`## ${key}\n`)
	for (const file of files) {
		const text = await readFile(join(directory, file), 'utf8')
		notices.push(`### ${file}\n\n\`\`\`text\n${text}${text.endsWith('\n') ? '' : '\n'}\`\`\`\n`)
	}
	licenses.push({ name: manifest.name, version: manifest.version, license: manifest.license })
}
await writeFile(join(out, 'THIRD_PARTY_NOTICES.md'), notices.join('\n'))
await copyFile(join(root, 'LICENSE.md'), join(out, 'LICENSE'))
await cp(resolve(source, '../skills'), join(out, 'skills'), { recursive: true })
const pkg = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'))
await writeFile(
	join(out, 'package.json'),
	JSON.stringify(
		{
			name: '@mockman/mcp-server',
			version: pkg.version,
			type: 'module',
			private: true,
			engines: { node: '>=22.12.0' },
			bin: { 'mockman-mcp': 'index.js' },
			license: 'Apache-2.0',
		},
		null,
		2,
	) + '\n',
)
await copyFile(join(source, 'PUBLIC-README.md'), join(out, 'README.md'))
const hashes = {}
for (const file of ['index.js', 'broker.js'])
	hashes[file] = createHash('sha256')
		.update(await readFile(join(out, file)))
		.digest('hex')
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
const dirty =
	execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], {
		cwd: root,
		encoding: 'utf8',
	}).trim().length > 0
await writeFile(
	join(out, 'provenance.json'),
	JSON.stringify(
		{ version: pkg.version, protocolVersion: 1, commit, dirty, hashes, dependencies: licenses },
		null,
		2,
	) + '\n',
)
console.log(
	`Built standalone MCP in ${out}; ${licenses.length} dependency notices included. Uncommitted source: ${dirty}`,
)
