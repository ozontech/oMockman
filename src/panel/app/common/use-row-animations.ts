import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type Id = string | number

export function useRowAnimations<T extends { id: Id }>(opts: {
	items: readonly T[]
	durationMs?: number
}): {
	enteringIds: ReadonlySet<string>
	leavingIds: ReadonlySet<string>
	movedIds: ReadonlySet<string>
	markMoved: (id: Id) => void
	animateRemove: (ids: readonly Id[], commit: () => void) => void
} {
	const { items, durationMs = 180 } = opts

	const seenRef = useRef<Set<string>>(new Set())
	const timersRef = useRef<number[]>([])

	const [enteringIds, setEnteringIds] = useState<Set<string>>(new Set())
	const [leavingIds, setLeavingIds] = useState<Set<string>>(new Set())
	const [movedIds, setMovedIds] = useState<Set<string>>(new Set())

	useEffect(() => {
		const seen = seenRef.current
		const newly: string[] = []
		for (const item of items) {
			const id = String(item.id)
			if (!seen.has(id)) {
				seen.add(id)
				newly.push(id)
			}
		}

		if (newly.length) {
			setEnteringIds((prev) => {
				const next = new Set(prev)
				newly.forEach((id) => next.add(id))
				return next
			})
			newly.forEach((id) => {
				const t = window.setTimeout(() => {
					setEnteringIds((prev) => {
						const next = new Set(prev)
						next.delete(id)
						return next
					})
				}, durationMs)
				timersRef.current.push(t)
			})
		}
	}, [durationMs, items])

	useEffect(() => () => {
		timersRef.current.forEach((t) => clearTimeout(t))
		timersRef.current = []
	}, [])

	const animateRemove = useCallback((ids: readonly Id[], commit: () => void) => {
		const keys = ids.map((id) => String(id))
		setLeavingIds((prev) => {
			const next = new Set(prev)
			keys.forEach((k) => next.add(k))
			return next
		})
		window.setTimeout(() => {
			commit()
			setLeavingIds((prev) => {
				const next = new Set(prev)
				keys.forEach((k) => next.delete(k))
				return next
			})
		}, durationMs)
	}, [durationMs])

	const markMoved = useCallback((id: Id) => {
		const key = String(id)
		setMovedIds((prev) => {
			const next = new Set(prev)
			next.add(key)
			return next
		})
		const t = window.setTimeout(() => {
			setMovedIds((prev) => {
				const next = new Set(prev)
				next.delete(key)
				return next
			})
		}, durationMs)
		timersRef.current.push(t)
	}, [durationMs])

	return useMemo(() => ({
		enteringIds,
		leavingIds,
		movedIds,
		markMoved,
		animateRemove,
	}), [animateRemove, enteringIds, leavingIds, markMoved, movedIds])
}
