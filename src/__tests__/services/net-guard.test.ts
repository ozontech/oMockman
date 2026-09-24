import { describe, expect, it } from 'vitest'

import { checkOutboundUrl, isLoopbackHost, isPrivateHost, readTextCapped } from '@/services/net-guard'

describe('isLoopbackHost', () => {
	it.each([
		'localhost',
		'localhost.',
		'127.0.0.1',
		'127.1.2.3',
		'::1',
		'[::1]',
		'[::]',
		// IPv4-mapped IPv6, both as typed and as URL normalizes it.
		'::ffff:127.0.0.1',
		'[::ffff:7f00:1]',
	])('treats %s as loopback', (host) => {
		expect(isLoopbackHost(host)).toBe(true)
	})

	it.each(['example.com', '8.8.8.8', '10.0.0.1'])('does not treat %s as loopback', (host) => {
		expect(isLoopbackHost(host)).toBe(false)
	})
})

describe('isPrivateHost', () => {
	it.each([
		'localhost',
		'127.0.0.1',
		'10.1.2.3',
		'172.16.0.1',
		'172.31.255.255',
		'192.168.1.1',
		'169.254.169.254',
		'100.64.0.1',
		'0.0.0.0',
		'224.0.0.1',
		'service.local',
		'gateway.internal',
		'intranet',
		'intranet.',
		'fd00::1',
		'fe80::1',
		'[fd00::1]',
		// 10.0.0.1 mapped into IPv6, as URL normalizes it.
		'[::ffff:a00:1]',
	])('refuses %s', (host) => {
		expect(isPrivateHost(host)).toBe(true)
	})

	it.each(['example.com', 'api.example.com', '8.8.8.8', '[::ffff:808:808]', '172.32.0.1', '192.169.0.1', '2606:4700::1111'])(
		'allows %s',
		(host) => {
			expect(isPrivateHost(host)).toBe(false)
		},
	)
})

describe('checkOutboundUrl', () => {
	it('accepts a public https url', () => {
		const result = checkOutboundUrl('https://api.example.com/v1')
		expect(result.ok).toBe(true)
	})

	it('refuses a non-http protocol', () => {
		const result = checkOutboundUrl('file:///etc/passwd')
		expect(result).toEqual({ ok: false, reason: 'unsupported_protocol' })
	})

	it('refuses malformed input', () => {
		expect(checkOutboundUrl('not a url')).toEqual({ ok: false, reason: 'invalid_url' })
	})

	it('refuses plain http by default', () => {
		expect(checkOutboundUrl('http://api.example.com')).toEqual({ ok: false, reason: 'insecure_http' })
	})

	it('refuses private hosts by default', () => {
		expect(checkOutboundUrl('https://192.168.0.10/spec.json')).toEqual({ ok: false, reason: 'private_host' })
		expect(checkOutboundUrl('https://169.254.169.254/latest/meta-data')).toEqual({
			ok: false,
			reason: 'private_host',
		})
	})

	it('allows http on loopback when explicitly permitted', () => {
		const result = checkOutboundUrl('http://127.0.0.1:11434/v1', { allowInsecureHttp: true, allowLoopback: true })
		expect(result.ok).toBe(true)
	})

	it('refuses loopback when only http is permitted', () => {
		expect(checkOutboundUrl('http://127.0.0.1:11434/v1', { allowInsecureHttp: true })).toEqual({
			ok: false,
			reason: 'private_host',
		})
	})

	it('refuses a private non-loopback host even with loopback permitted', () => {
		expect(checkOutboundUrl('http://10.0.0.5/v1', { allowInsecureHttp: true, allowLoopback: true })).toEqual({
			ok: false,
			reason: 'private_host',
		})
	})

	it('allows private hosts only with the private opt-in', () => {
		const result = checkOutboundUrl('http://10.0.0.5/v1', { allowInsecureHttp: true, allowPrivateHosts: true })
		expect(result.ok).toBe(true)
	})
})

describe('readTextCapped', () => {
	it('reads a small body', async () => {
		expect(await readTextCapped(new Response('hello'), 1024)).toBe('hello')
	})

	it('throws once the cap is exceeded', async () => {
		await expect(readTextCapped(new Response('x'.repeat(2048)), 1024)).rejects.toThrow(/exceeds/)
	})
})
