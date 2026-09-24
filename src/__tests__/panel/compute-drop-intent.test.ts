import { describe, it, expect } from 'vitest'

import { MethodEnum } from '@/interface'
import { computeDropIntent } from '@/panel/app/mocks/dnd/compute-drop-intent'
import type { Row } from '@/panel/app/mocks/model/types'
import type { ICollectionEntry } from '@/interface/collection'

describe('computeDropIntent', () => {
	const createMockTR = (height = 100): HTMLElement => ({
		getBoundingClientRect: () => ({ top: 0, height, left: 0, right: 0, bottom: height, width: 0, x: 0, y: 0 } as DOMRect),
	} as unknown as HTMLElement)

	const createMockRowElement = (height = 100): HTMLElement => ({
		closest: () => createMockTR(height),
		getBoundingClientRect: () => ({ top: 0, height, left: 0, right: 0, bottom: height, width: 0, x: 0, y: 0 } as DOMRect),
	} as unknown as HTMLElement)

	const createMockEvent = (clientY: number, target?: HTMLElement): React.DragEvent => {
		const mockTarget = target ?? createMockRowElement()
		return {
			clientY,
			currentTarget: mockTarget,
			target: mockTarget,
		} as unknown as React.DragEvent
	}

	const createCollectionRow = (id: string, parentId: string | null, entries: ICollectionEntry[] = []): Row => ({
		id,
		rowType: 'collection',
		level: 0,
		node: { id, name: 'Test', parentId, active: true, createdOn: Date.now(), entries },
		parentCollectionId: parentId,
		indexInParent: 0,
	})

	const createMockRow = (id: string, parentId: string | null): Row => ({
		id,
		rowType: 'mock',
		level: 0,
		mock: {
			id,
			name: 'Test',
			url: '/test',
			method: MethodEnum.GET,
			status: 200,
			active: true,
			createdOn: Date.now(),
			response: '',
			description: '',
		},
		parentCollectionId: parentId,
		indexInParent: 0,
	})

	it('returns before for the top part of a collection', () => {
		const row = createCollectionRow('col1', null)
		const event = createMockEvent(10)

		const result = computeDropIntent(row, event)

		expect(result.previewPosition).toBe('before')
		expect(result.containerId).toBeNull()
		expect(result.index).toBe(0)
	})

	it('returns inside for the bottom part of a collection', () => {
		const row = createCollectionRow('col1', null)
		const event = createMockEvent(50)

		const result = computeDropIntent(row, event)

		expect(result.previewPosition).toBe('inside')
		expect(result.containerId).toBe('col1')
	})

	it('returns after for a mock', () => {
		const row = createMockRow('m1', null)
		const event = createMockEvent(50)

		const result = computeDropIntent(row, event)

		expect(result.previewPosition).toBe('after')
		expect(result.containerId).toBeNull()
		expect(result.index).toBe(1)
	})

	it('uses parentCollectionId for a mock', () => {
		const row = createMockRow('m1', 'col1')
		const event = createMockEvent(50)

		const result = computeDropIntent(row, event)

		expect(result.containerId).toBe('col1')
	})

	it('uses parentCollectionId for a collection', () => {
		const row = createCollectionRow('col2', 'col1')
		const event = createMockEvent(10)

		const result = computeDropIntent(row, event)

		expect(result.containerId).toBe('col1')
		expect(result.previewPosition).toBe('before')
	})

	it('uses entries.length for the inside position', () => {
		const row = createCollectionRow('col1', null, [{ id: 'm1', type: 'mock' }])
		const event = createMockEvent(50)

		const result = computeDropIntent(row, event)

		expect(result.index).toBe(1)
	})

	it('handles the boundary case (exactly 30%)', () => {
		const row = createCollectionRow('col1', null)
		const event = createMockEvent(30)

		const result = computeDropIntent(row, event)

		expect(result.previewPosition).toBe('inside')
	})
})
