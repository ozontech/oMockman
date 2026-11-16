import { describe, expect, it } from 'vitest'

import type { LibraryStorage, WriteIdentity } from '@/background/library-writer'
import { createLibraryWriter } from '@/background/library-writer'
import { defaultLibrary } from '@/services/library-normalize'

const identity = (n: number): WriteIdentity => ({
	operationId: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
	issuedAt: 1000,
	expiresAt: 301000,
})
function fixture() {
	let saved: Awaited<ReturnType<LibraryStorage['read']>> = defaultLibrary()
	let fail = false
	const storage: LibraryStorage = {
		read: async () => structuredClone(saved),
		write: async (next) => {
			if (fail) throw new Error('quota')
			saved = structuredClone(next)
		},
	}
	return {
		storage,
		get: () => saved,
		fail: (value: boolean) => {
			fail = value
		},
		writer: createLibraryWriter(storage, () => 2000),
	}
}

describe('background library writer', () => {
	it('accepts only one of two concurrent snapshots at the same revision', async () => {
		const f = fixture()
		const results = await Promise.allSettled([
			f.writer.execute(identity(1), {
				type: 'replace',
				expectedRevision: 0,
				store: { ...defaultLibrary(), theme: 'dark' },
			}),
			f.writer.execute(identity(2), {
				type: 'replace',
				expectedRevision: 0,
				store: { ...defaultLibrary(), active: true },
			}),
		])
		expect(results[0].status).toBe('fulfilled')
		expect(results[1]).toMatchObject({
			status: 'rejected',
			reason: { message: 'REVISION_CONFLICT' },
		})
		expect(f.get()).toMatchObject({ theme: 'dark', active: false, revision: 1 })
	})
	it('replays after worker restart without another write, rejects changed command identity', async () => {
		const f = fixture()
		const command = { type: 'replace' as const, expectedRevision: 0, store: defaultLibrary() }
		await f.writer.execute(identity(1), command)
		const restarted = createLibraryWriter(f.storage, () => 3000)
		expect((await restarted.execute(identity(1), command)).committedRevision).toBe(1)
		expect(f.get()?.revision).toBe(1)
		await expect(
			restarted.execute(identity(1), { ...command, store: { ...command.store, active: true } }),
		).rejects.toThrow('OPERATION_ID_REUSED')
	})
	it('preserves newer edits when a saved command is redelivered', async () => {
		const f = fixture()
		const command = { type: 'replace' as const, expectedRevision: 0, store: defaultLibrary() }
		await f.writer.execute(identity(1), command)
		await f.writer.execute(identity(2), { type: 'set_active', active: true })
		const replay = await f.writer.execute(identity(1), command)
		expect(replay.committedRevision).toBe(1)
		expect(replay.store).toMatchObject({ active: true, revision: 2 })
	})
	it('failed storage write does not commit a receipt; the queue recovers and retry succeeds', async () => {
		const f = fixture()
		f.fail(true)
		await expect(
			f.writer.execute(identity(1), { type: 'set_active', active: true }),
		).rejects.toThrow('quota')
		expect(f.get()?.commandState).toBeUndefined()
		f.fail(false)
		await f.writer.execute(identity(1), { type: 'set_active', active: true })
		expect(f.get()).toMatchObject({ active: true, revision: 1 })
	})
	it('rejects expired operations even after their receipts were pruned and clock moved backwards', async () => {
		const f = fixture()
		await f.writer.execute(identity(1), { type: 'set_active', active: true })
		const later = createLibraryWriter(f.storage, () => 302000)
		await later.execute(
			{ ...identity(2), issuedAt: 302000, expiresAt: 602000 },
			{ type: 'set_active', active: false },
		)
		expect(f.get()?.commandState?.receipts).toHaveLength(1)
		const clockBack = createLibraryWriter(f.storage, () => 2000)
		await expect(
			clockBack.execute(identity(1), { type: 'set_active', active: true }),
		).rejects.toThrow('OPERATION_EXPIRED')
	})
	it('serializes a background migration and popup patch without losing either change', async () => {
		const f = fixture()
		await Promise.all([
			f.writer.migrate(async (store) => ({ ...store, theme: 'dark' })),
			f.writer.execute(identity(1), { type: 'set_active', active: true }),
		])
		expect(f.get()).toMatchObject({ theme: 'dark', active: true, revision: 2 })
	})
	it('refuses to evict receipts that still protect repeated delivery', async () => {
		const f = fixture()
		const receipt = { id: identity(1).operationId, digest: 'test', expiresAt: 301000, revision: 1 }
		await f.storage.write({
			...defaultLibrary(),
			commandState: { clock: 2000, receipts: Array.from({ length: 1000 }, () => receipt) },
		})
		await expect(
			f.writer.execute(identity(2), { type: 'set_active', active: true }),
		).rejects.toThrow('LIMIT_EXCEEDED')
	})
})

it('adds inline site grants to the latest library without replacing other permissions or settings', async () => {
	const f = fixture()
	await f.writer.execute(identity(10), { type: 'replace', expectedRevision: 0, store: { ...defaultLibrary(), theme: 'dark' } })
	await Promise.all([
		f.writer.execute(identity(11), { type: 'grant_site', origin: 'https://first.test' }),
		f.writer.execute(identity(12), { type: 'grant_site', origin: 'https://second.test' }),
	])
	expect(f.get()?.theme).toBe('dark')
	expect(Object.keys(f.get()?.sitePermissions ?? {})).toEqual(['https://first.test', 'https://second.test'])
	expect(f.get()?.revision).toBe(3)
})
