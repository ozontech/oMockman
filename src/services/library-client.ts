import type { IStore } from '@/interface/mock'

/** A fresh operation identity survives transport retries; never retry a conflict with a new revision. */
export function libraryOperation() {
	const issuedAt = Date.now()
	return { operationId: crypto.randomUUID(), issuedAt, expiresAt: issuedAt + 300000 }
}

export function sendLibraryCommand(
	command: Record<string, unknown>,
): Promise<{ ok: boolean; store?: IStore; error?: string }> {
	return new Promise((resolve, reject) => {
		chrome.runtime.sendMessage(
			{ type: 'LIBRARY_COMMAND', ...libraryOperation(), ...command },
			(answer) => {
				const error = chrome.runtime.lastError
				if (error) reject(new Error(error.message ?? 'BACKGROUND_UNAVAILABLE'))
				else if (!answer || typeof answer.ok !== 'boolean')
					reject(new Error('BACKGROUND_UNAVAILABLE'))
				else resolve(answer)
			},
		)
	})
}
