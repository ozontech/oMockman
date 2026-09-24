import type React from 'react'

import type { Row } from '../model/types'

export function computeDropIntent(row: Row, e: React.DragEvent): {
	containerId: string | null
	index: number
	previewRowId: string
	previewPosition: 'before' | 'after' | 'inside'
} {
	const rawTarget = (e.currentTarget as HTMLElement) ?? (e.target as HTMLElement)
	const rowElement = rawTarget?.closest('tr') as HTMLElement | null
	const rect = rowElement?.getBoundingClientRect()
	const offsetY = rect ? e.clientY - rect.top : 0
	const height = rect?.height || 1

	if (row.rowType === 'collection') {
		const upperThreshold = height * 0.3
		if (offsetY < upperThreshold) {
			return {
				containerId: row.parentCollectionId ?? null,
				index: row.indexInParent,
				previewRowId: row.id,
				previewPosition: 'before',
			}
		}
		return {
			containerId: row.node.id,
			index: row.node.entries.length,
			previewRowId: row.id,
			previewPosition: 'inside',
		}
	}

	const containerId = row.parentCollectionId ?? null
	return {
		containerId,
		index: row.indexInParent + 1,
		previewRowId: row.id,
		previewPosition: 'after',
	}
}
