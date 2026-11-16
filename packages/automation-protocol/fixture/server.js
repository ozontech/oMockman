import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'

const html = await readFile(new URL('./index.html', import.meta.url))
const server = createServer((request, response) => {
	if (request.method === 'GET' && request.url === '/') {
		response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
		response.end(html)
		return
	}
	const routes = {
		'GET /api/items': { items: [] },
		'GET /api/configuration': { features: { returns: false }, permissions: [] },
		'GET /api/tasks': { items: [] },
		'POST /api/save': { saved: true },
	}
	const data = routes[`${request.method} ${request.url}`]
	response.writeHead(data ? 200 : 404, {
		'Content-Type': 'application/json',
		'Cache-Control': 'no-store',
	})
	response.end(JSON.stringify(data ?? { error: 'NOT_FOUND' }))
})
server.listen(Number(process.argv[2] ?? 4174), '127.0.0.1', () => {
	const address = server.address()
	console.log(`Mockman fixture: http://127.0.0.1:${address.port}`)
})
