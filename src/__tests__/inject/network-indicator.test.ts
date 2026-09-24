import { describe, it, expect, beforeEach, afterEach } from 'vitest'

const { networkIndicator } = await import('../../inject/network-indicator')

describe('NetworkIndicator', () => {
	beforeEach(() => {
		document.body.innerHTML = ''
		document.head.innerHTML = ''
		networkIndicator.clear()
	})

	afterEach(() => {
		networkIndicator.clear()
	})

	describe('addMockedRequest', () => {
		it('adds a request to the list', () => {
			networkIndicator.addMockedRequest('/api/users', 'GET')
			const requests = networkIndicator.getMockedRequests()
			expect(requests).toHaveLength(1)
			expect(requests[0].url).toBe('/api/users')
			expect(requests[0].method).toBe('GET')
		})

		it('upper-cases the method', () => {
			networkIndicator.addMockedRequest('/api/users', 'post')
			const requests = networkIndicator.getMockedRequests()
			expect(requests[0].method).toBe('POST')
		})

		it('ignores duplicates', () => {
			networkIndicator.addMockedRequest('/api/users', 'GET')
			networkIndicator.addMockedRequest('/api/users', 'GET')
			const requests = networkIndicator.getMockedRequests()
			expect(requests).toHaveLength(1)
		})

		it('does not treat different URLs as duplicates', () => {
			networkIndicator.addMockedRequest('/api/users', 'GET')
			networkIndicator.addMockedRequest('/api/posts', 'GET')
			const requests = networkIndicator.getMockedRequests()
			expect(requests).toHaveLength(2)
		})

		it('does not treat different methods on one URL as duplicates', () => {
			networkIndicator.addMockedRequest('/api/users', 'GET')
			networkIndicator.addMockedRequest('/api/users', 'POST')
			const requests = networkIndicator.getMockedRequests()
			expect(requests).toHaveLength(2)
		})

		it('caps the number of requests at MAX_REQUESTS', () => {
			for (let i = 0; i < 150; i++) {
				networkIndicator.addMockedRequest(`/api/test${i}`, 'GET')
			}
			const requests = networkIndicator.getMockedRequests()
			expect(requests.length).toBeLessThanOrEqual(100)
		})
	})

	describe('getMockedRequests', () => {
		it('returns a copy of the array', () => {
			networkIndicator.addMockedRequest('/api/users', 'GET')
			const requests1 = networkIndicator.getMockedRequests()
			const requests2 = networkIndicator.getMockedRequests()
			expect(requests1).not.toBe(requests2)
			expect(requests1).toEqual(requests2)
		})
	})

	describe('clear', () => {
		it('clears the request list', () => {
			networkIndicator.addMockedRequest('/api/users', 'GET')
			networkIndicator.clear()
			const requests = networkIndicator.getMockedRequests()
			expect(requests).toHaveLength(0)
		})
	})

	describe('destroy', () => {
		it('removes the container from the DOM', () => {
			networkIndicator.addMockedRequest('/api/users', 'GET')
			const container = document.getElementById('__mockman_indicator__')
			expect(container).toBeInTheDocument()
			networkIndicator.destroy()
			const containerAfter = document.getElementById('__mockman_indicator__')
			expect(containerAfter).not.toBeInTheDocument()
		})

		it('does not throw when called twice', () => {
			networkIndicator.addMockedRequest('/api/users', 'GET')
			networkIndicator.destroy()
			expect(() => networkIndicator.destroy()).not.toThrow()
		})
	})
})