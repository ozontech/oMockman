import assert from 'node:assert/strict'
import { chmod, mkdtemp, mkdir, rm, symlink, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { brokerKey, nonce, proof, validProof } from '../broker-auth.js'

test('credentials are private, stable and never loaded through a symlink or permissive directory', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'mm-key-'))
	try {
		const key = brokerKey(join(directory, 'private'))
		assert.equal(key.length, 32)
		assert.deepEqual(brokerKey(join(directory, 'private')), key)
		assert.equal((await stat(join(directory, 'private/key'))).mode & 0o777, 0o600)
		await symlink(join(directory, 'private'), join(directory, 'linked'))
		assert.throws(() => brokerKey(join(directory, 'linked')), /BROKER_UNSAFE_CREDENTIALS/)
		await mkdir(join(directory, 'public'), { mode: 0o755 })
		assert.throws(() => brokerKey(join(directory, 'public')), /BROKER_UNSAFE_CREDENTIALS/)
		await chmod(join(directory, 'private/key'), 0o644)
		assert.throws(() => brokerKey(join(directory, 'private')), /BROKER_UNSAFE_CREDENTIALS/)
	} finally { await rm(directory, { recursive: true, force: true }) }
})

test('authentication proofs cannot be reflected or replayed in a different handshake', () => {
	const key = Buffer.alloc(32, 7)
	const client = nonce(), server = nonce()
	const original = proof(key, 'broker', client, server, 'owner')
	assert.ok(validProof(original, proof(key, 'broker', client, server, 'owner')))
	assert.equal(validProof(original, proof(key, 'agent', client, server, 'owner')), false)
	assert.equal(validProof(original, proof(key, 'broker', nonce(), server, 'owner')), false)
	assert.equal(validProof(original, proof(key, 'broker', client, nonce(), 'owner')), false)
	assert.equal(validProof(original, proof(key, 'broker', client, server, 'another-owner')), false)
})
