/** Scan publishable sources and bundles, never developer profiles or environment files. */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const blocked = /(?:^|\/)(?:\.env(?:\..*)?|\.idea|\.vscode|\.cursor|node_modules|\.git)(?:\/|$)/
const files = new Set(execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean))
function walk(directory) {
	if (!fs.existsSync(path.join(root, directory))) return
	for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
		const file = `${directory}/${entry.name}`
		if (blocked.test(file) || entry.isSymbolicLink()) continue
		if (entry.isDirectory()) walk(file)
		else if (entry.isFile()) files.add(file)
	}
}
for (const directory of ['dist/chrome', 'dist/firefox', 'dist/mcp']) walk(directory)
const forbidden = [
	/\b(?:[\w-]+\.)*(?:o3\.ru|o3t\.ru|ozon\.ru|ozonru\.me|ozonteam\.me|o3t\.me|ozone\.ru)\b/i,
	/\bo3\s+agent\b/i,
	/\b(?:WMSFE|SIGMA|WMS)-\d+\b/,
	/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
	/\b(?:ghp_|github_pat_|glpat-)[A-Za-z0-9_-]{15,}/,
]
const failures = []
for (const file of files) {
	if (blocked.test(file) || file === 'scripts/check-public-content.mjs') continue
	const absolute = path.join(root, file)
	if (!fs.existsSync(absolute) || !fs.lstatSync(absolute).isFile()) continue
	const buffer = fs.readFileSync(absolute)
	if (buffer.includes(0)) continue
	const contents = buffer.toString('utf8')
	if (forbidden.some(pattern => pattern.test(contents))) failures.push(file)
}
if (failures.length) {
	console.error(`Non-public content detected in:\n${failures.join('\n')}`)
	process.exitCode = 1
} else console.log('Public source and bundle content checks passed.')
