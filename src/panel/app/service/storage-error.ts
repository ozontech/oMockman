import type { Translations } from '@/panel/app/i18n/translations'

export class StorageWriteError extends Error {
	constructor(readonly reason: string) {
		super(`Storage write failed: ${reason}`)
		this.name = 'StorageWriteError'
	}
}

/** The storage-specific message for a failed write, or the fallback for any other error. */
export function describeSaveError(error: unknown, t: Translations, fallback: string): string {
	return error instanceof StorageWriteError ? t.toast_storageWriteFailed(error.reason) : fallback
}
