import { describe, it, expect, vi } from 'vitest'

import { buildMockDragProps } from '../../panel/app/mocks/table/columns/cell-helpers'
import type { Row } from '../../panel/app/mocks/model/types'

import { MethodEnum } from '@/interface/network'

describe('buildMockDragProps', () => {
	const createMockRow = (mockId: string): Row => ({
		id: mockId,
		rowType: 'mock',
		mock: {
			id: mockId,
			name: 'Test Mock',
			url: '/api/test',
			method: MethodEnum.GET,
			status: 200,
			active: true,
			createdOn: Date.now(),
			response: '{}',
			description: '',
		},
		level: 0,
		parentCollectionId: null,
		indexInParent: 0,
	})

	it('returns draggable=true outside Firefox', () => {
		const onDragStart = vi.fn()
		const row = createMockRow('mock-1') as Row & { rowType: 'mock' }

		const result = buildMockDragProps({ isFirefox: false, onDragStart }, row)

		expect(result.draggable).toBe(true)
	})

	it('returns draggable=false in Firefox', () => {
		const onDragStart = vi.fn()
		const row = createMockRow('mock-1') as Row & { rowType: 'mock' }

		const result = buildMockDragProps({ isFirefox: true, onDragStart }, row)

		expect(result.draggable).toBe(false)
		expect(result.onDragStart).toBeUndefined()
	})
})