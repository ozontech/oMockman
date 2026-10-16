import { describe, expect, it } from 'vitest'

type Wrapped = { __mockmanWrapped?: boolean }

describe('NetworkIndicator footprint', () => {
	it('leaves history alone until a request is mocked', async () => {
		const { networkIndicator } = await import('../../inject/network-indicator')

		expect((history.pushState as unknown as Wrapped).__mockmanWrapped).toBeUndefined()
		expect((history.replaceState as unknown as Wrapped).__mockmanWrapped).toBeUndefined()

		networkIndicator.addMockedRequest('/api/users', 'GET')

		expect((history.pushState as unknown as Wrapped).__mockmanWrapped).toBe(true)
		networkIndicator.clear()
	})
})
