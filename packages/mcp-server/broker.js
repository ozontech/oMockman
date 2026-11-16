import { createBridge } from './bridge.js'

// Standalone process: closing the first MCP client must not close other clients' bridge.
try {
	const bridge = await createBridge(process.env.MOCKMAN_BROKER_SOCKET ? { port: 0, socketPath: process.env.MOCKMAN_BROKER_SOCKET } : {})
	let emptySince = Date.now()
	const idle = setInterval(() => {
		if (bridge.agentCount() > 0) emptySince = Date.now()
		else if (Date.now() - emptySince > 30000) void close()
	}, 1000)
	let closing = false
	async function close() {
		if (closing) return
		closing = true
		clearInterval(idle)
		await bridge.close()
	}
	process.once('SIGTERM', close)
	process.once('SIGINT', close)
} catch (error) {
	// Concurrent starters elect the process that successfully binds the port.
	if (error.code !== 'EADDRINUSE') console.error(error.message)
	process.exitCode = 1
}
