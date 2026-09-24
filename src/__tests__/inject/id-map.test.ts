import { describe, it, expect, beforeEach } from 'vitest'

import { RequestIdManager } from '../../inject'

describe('RequestIdManager', () => {
	let manager: RequestIdManager

	beforeEach(() => {
		manager = new RequestIdManager()
	})

	describe('setRequestId / resolveId', () => {
		it('sets and reads a request ID', () => {
			const request = new Request('http://example.com/api')
			manager.setRequestId(request, 'test-id-1')

			const resolved = manager.resolveId(request, 'fallback-id')
			expect(resolved).toBe('test-id-1')
		})

		it('returns fallbackId when the ID is not found', () => {
			const request = new Request('http://example.com/api')
			const resolved = manager.resolveId(request, 'fallback-id')
			expect(resolved).toBe('fallback-id')
		})
	})

	describe('storeBody / getBodyById', () => {
		it('stores and reads a body by ID', () => {
			const request = new Request('http://example.com/api')
			manager.storeBody(request, 'id-1', 'some-body')

			const body = manager.getBodyById('id-1')
			expect(body).toBe('some-body')
		})

		it('returns an empty string for an unknown ID', () => {
			const body = manager.getBodyById('non-existent')
			expect(body).toBe('')
		})
	})

	describe('hasLoggedAtRequest / markLoggedAtRequest', () => {
		it('hasLoggedAtRequest is false by default', () => {
			expect(manager.hasLoggedAtRequest('id-1')).toBe(false)
		})

		it('hasLoggedAtRequest is true after markLoggedAtRequest', () => {
			manager.markLoggedAtRequest('id-1')
			expect(manager.hasLoggedAtRequest('id-1')).toBe(true)
		})
	})

	describe('hasLoggedAtResponse / markLoggedAtResponse', () => {
		it('hasLoggedAtResponse is false by default', () => {
			expect(manager.hasLoggedAtResponse('id-1')).toBe(false)
		})

		it('hasLoggedAtResponse is true after markLoggedAtResponse', () => {
			manager.markLoggedAtResponse('id-1')
			expect(manager.hasLoggedAtResponse('id-1')).toBe(true)
		})
	})

	describe('cleanup', () => {
		it('clears a key', () => {
			const request = new Request('http://example.com/api', {
				method: 'POST',
				body: 'cleanup-body',
			})
			manager.storeBody(request, 'cleanup-id', 'cleanup-body')

			manager.cleanup(request, 'cleanup-id')

			const newRequest = new Request('http://example.com/api', {
				method: 'POST',
				body: 'cleanup-body',
			})
			const resolved = manager.resolveId(newRequest, 'fallback')
			expect(resolved).toBe('fallback')
		})
	})

	describe('composeKey', () => {
		it('different URLs give different keys', () => {
			const request1 = new Request('http://example.com/api1', {
				method: 'POST',
				body: 'same-body',
			})
			manager.storeBody(request1, 'id-1', 'same-body')

			const request2 = new Request('http://example.com/api2', {
				method: 'POST',
				body: 'same-body',
			})
			const resolved = manager.resolveId(request2, 'fallback')
			expect(resolved).toBe('fallback')
		})

		it('different methods give different keys', () => {
			const requestGet = new Request('http://example.com/api', {
				method: 'DELETE',
				body: 'same-body',
			})
			manager.storeBody(requestGet, 'delete-id', 'same-body')

			const requestPost = new Request('http://example.com/api', {
				method: 'POST',
				body: 'same-body',
			})
			const resolved = manager.resolveId(requestPost, 'fallback')
			expect(resolved).toBe('fallback')
		})
	})
})
