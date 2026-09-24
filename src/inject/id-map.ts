import { normalizeUrl } from '@/services/url'

export class RequestIdManager {
	private requestToId = new WeakMap<Request, string>()
	private idToRequestBody = new Map<string, string>()
	private keyToId = new Map<string, string>()
	private loggedAtRequest = new Set<string>()
	private loggedAtResponse = new Set<string>()

	setRequestId(request: Request, id: string): void {
		this.requestToId.set(request, id)
	}

	hasLoggedAtRequest(id: string): boolean { return this.loggedAtRequest.has(id) }
	markLoggedAtRequest(id: string): void { this.loggedAtRequest.add(id) }
	hasLoggedAtResponse(id: string): boolean { return this.loggedAtResponse.has(id) }
	markLoggedAtResponse(id: string): void { this.loggedAtResponse.add(id) }

	storeBody(request: Request, id: string, body: string): void {
		this.idToRequestBody.set(id, body)
		const k = this.composeKey(request, body)
		this.keyToId.set(k, id)
	}

	getBodyById(id: string): string { return this.idToRequestBody.get(id) ?? '' }

	resolveId(request: Request, fallbackId: string): string {
		const stored = this.requestToId.get(request)
		if (stored) return stored
		try {
			const k = this.composeKey(request, this.getBodyById(fallbackId))
			const recovered = this.keyToId.get(k)
			return recovered ?? fallbackId
		} catch {
			return fallbackId
		}
	}

	cleanup(request: Request, id: string): void {
		try {
			const k = this.composeKey(request, this.getBodyById(id))
			this.keyToId.delete(k)
		} catch {
			return
		}
	}

	private composeKey(request: Request, body: string): string {
		const bodyKey = `${body.length}:${body.slice(0, 256)}`
		return `${request.method}|${normalizeUrl(request.url)}|${bodyKey}`
	}
}

