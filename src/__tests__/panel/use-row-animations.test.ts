import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

import { useRowAnimations } from '../../panel/app/common/use-row-animations'

describe('useRowAnimations', () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
		vi.clearAllTimers()
	})

	it('starts with empty sets', () => {
		const { result } = renderHook(() => useRowAnimations({ items: [] }))
		expect(result.current.enteringIds.size).toBe(0)
		expect(result.current.leavingIds.size).toBe(0)
		expect(result.current.movedIds.size).toBe(0)
	})

	it('adds new items to enteringIds', () => {
		const items = [{ id: '1' }, { id: '2' }]
		const { result } = renderHook(() => useRowAnimations({ items }))

		expect(result.current.enteringIds.size).toBe(2)
		expect(result.current.enteringIds.has('1')).toBe(true)
		expect(result.current.enteringIds.has('2')).toBe(true)
	})

	it('does not add items it has already seen', () => {
		const { result, rerender } = renderHook(({ items }) => useRowAnimations({ items }), {
			initialProps: { items: [{ id: '1' }] },
		})

		expect(result.current.enteringIds.has('1')).toBe(true)

		rerender({ items: [{ id: '1' }, { id: '2' }] })

		expect(result.current.enteringIds.size).toBe(2)
	})

	it('removes from enteringIds after durationMs', () => {
		const { result } = renderHook(() => useRowAnimations({ items: [{ id: '1' }], durationMs: 100 }))

		expect(result.current.enteringIds.has('1')).toBe(true)

		act(() => {
			vi.advanceTimersByTime(100)
		})

		expect(result.current.enteringIds.has('1')).toBe(false)
	})

	it('markMoved adds the id to movedIds', () => {
		const { result } = renderHook(() => useRowAnimations({ items: [{ id: '1' }] }))

		act(() => {
			result.current.markMoved('1')
		})

		expect(result.current.movedIds.has('1')).toBe(true)
	})

	it('markMoved removes the id after durationMs', () => {
		const { result } = renderHook(() => useRowAnimations({ items: [{ id: '1' }], durationMs: 100 }))

		act(() => {
			result.current.markMoved('1')
		})

		expect(result.current.movedIds.has('1')).toBe(true)

		act(() => {
			vi.advanceTimersByTime(100)
		})

		expect(result.current.movedIds.has('1')).toBe(false)
	})

	it('animateRemove adds ids to leavingIds and calls commit', () => {
		const commitFn = vi.fn()
		const { result } = renderHook(() => useRowAnimations({ items: [{ id: '1' }], durationMs: 100 }))

		act(() => {
			result.current.animateRemove(['1', '2'], commitFn)
		})

		expect(result.current.leavingIds.has('1')).toBe(true)
		expect(result.current.leavingIds.has('2')).toBe(true)
		expect(commitFn).not.toHaveBeenCalled()

		act(() => {
			vi.advanceTimersByTime(100)
		})

		expect(commitFn).toHaveBeenCalled()
	})

	it('animateRemove removes ids from leavingIds after durationMs', () => {
		const commitFn = vi.fn()
		const { result } = renderHook(() => useRowAnimations({ items: [{ id: '1' }], durationMs: 100 }))

		act(() => {
			result.current.animateRemove(['1'], commitFn)
		})

		expect(result.current.leavingIds.has('1')).toBe(true)

		act(() => {
			vi.advanceTimersByTime(100)
		})

		expect(result.current.leavingIds.has('1')).toBe(false)
	})

	it('clears timers on unmount', () => {
		const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')
		const { result, unmount } = renderHook(() => useRowAnimations({ items: [{ id: '1' }] }))

		result.current.markMoved('1')

		unmount()

		expect(clearTimeoutSpy).toHaveBeenCalled()
	})

	it('uses a custom durationMs', () => {
		const { result } = renderHook(() => useRowAnimations({ items: [{ id: '1' }], durationMs: 500 }))

		expect(result.current.enteringIds.has('1')).toBe(true)

		act(() => {
			vi.advanceTimersByTime(180)
		})

		expect(result.current.enteringIds.has('1')).toBe(true)

		act(() => {
			vi.advanceTimersByTime(320)
		})

		expect(result.current.enteringIds.has('1')).toBe(false)
	})
})