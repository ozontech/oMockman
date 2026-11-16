import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { constants, closeSync, fstatSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

// A separate trust root for each OS account. Never accept keys from shared /tmp.
export const brokerDirectory = () => join(homedir(), '.mockman-mcp')
export const brokerSocket = () => join(brokerDirectory(), 'agent.sock')

export function brokerKey(directory = brokerDirectory()) {
	if (process.platform === 'win32') throw new Error('BROKER_SECURE_IPC_UNSUPPORTED_PLATFORM')
	try { mkdirSync(directory, { mode: 0o700 }) } catch (error) { if (error.code !== 'EEXIST') throw error }
	const check = (stat, directory = false) => {
		if (stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0 || (directory ? !stat.isDirectory() : !stat.isFile()))
			throw new Error('BROKER_UNSAFE_CREDENTIALS')
	}
	check(lstatSync(directory), true)
	const path = join(directory, 'key')
	try {
		lstatSync(path)
	} catch (error) {
		if (error.code !== 'ENOENT') throw error
		const temporary = join(directory, `key-${randomBytes(16).toString('hex')}`)
		writeFileSync(temporary, randomBytes(32), { flag: 'wx', mode: 0o600 })
		try { linkSync(temporary, path) } catch (error) { if (error.code !== 'EEXIST') throw error } finally { unlinkSync(temporary) }
	}
	const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW)
	try {
		check(fstatSync(fd))
		const key = readFileSync(fd)
		if (key.length !== 32) throw new Error('BROKER_INVALID_CREDENTIALS')
		return key
	} finally { closeSync(fd) }
}

export const nonce = () => randomBytes(32).toString('hex')
export const proof = (key, role, clientNonce, serverNonce, owner) =>
	createHmac('sha256', key).update(JSON.stringify(['mockman-ipc-v1', role, clientNonce, serverNonce, owner])).digest('hex')
export const validProof = (actual, expected) => typeof actual === 'string' && /^[a-f0-9]{64}$/.test(actual) && timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
