import { cp, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createBridge } from '../bridge.js'

/** Test only: never connect the integration suite to an installed user's broker. */
export async function isolatedRuntime(directory, browser) {
	const bridge = await createBridge({ port: 0 })
	const extensionPath = path.join(directory, 'extension')
	try {
		await cp(fileURLToPath(new URL(`../../../dist/${browser}`, import.meta.url)), extensionPath, { recursive: true })
		const backgroundFile = path.join(extensionPath, 'js/background.js')
		await writeFile(backgroundFile, (await readFile(backgroundFile, 'utf8')).replaceAll('127.0.0.1:19772', `127.0.0.1:${bridge.port}`))
		const entrypoint = path.join(directory, 'mcp.mjs')
		await cp(new URL('../package.json', import.meta.url), path.join(directory, 'package.json'))
		let source = await readFile(new URL('../index.js', import.meta.url), 'utf8')
		source = source.replaceAll('getBroker', 'connectBroker').replace('await connectBroker()', `await connectBroker({ port: ${bridge.port} })`)
		source = source.replace(/from '([^']+)'/g, (_match, specifier) => {
			const resolved = specifier.startsWith('.') ? new URL(specifier, new URL('../index.js', import.meta.url)).href : import.meta.resolve(specifier)
			return `from '${resolved}'`
		})
		await writeFile(entrypoint, source)
		return { extensionPath, entrypoint, close: () => bridge.close() }
	} catch (error) {
		await bridge.close()
		throw error
	}
}
