import fs from 'node:fs'
import path from 'node:path'

import type { Plugin } from 'vite'

export interface CopyTarget {
	/** Absolute path to a file or a directory. */
	from: string
	/** Destination directory, relative to the build output. */
	to: string
	/** For a directory source: which entries to copy. */
	include?: RegExp
}

/** Copies the manifest and icons into the build output. */
export function copyStatic(targets: CopyTarget[]): Plugin {
	let outDir = 'dist'

	return {
		name: 'mockman-copy-static',
		apply: 'build',
		configResolved(config) {
			outDir = config.build.outDir
		},
		writeBundle() {
			for (const { from, to, include } of targets) {
				const destDir = path.resolve(outDir, to)
				fs.mkdirSync(destDir, { recursive: true })

				if (fs.statSync(from).isDirectory()) {
					for (const entry of fs.readdirSync(from)) {
						if (include && !include.test(entry)) continue
						fs.copyFileSync(path.join(from, entry), path.join(destDir, entry))
					}
					continue
				}

				fs.copyFileSync(from, path.join(destDir, path.basename(from)))
			}
		},
	}
}
