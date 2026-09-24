import type { IMockResponse } from '@/interface/mock'
import type { ICollectionNode } from '@/interface/collection'

export const DND_MIME = 'application/mockman-entry'
export const DND_FALLBACK_MIME = 'text/plain'
export const DND_FALLBACK_PREFIX = 'mockman:'

export type DragEntryPayload = {
	type: 'mock' | 'collection'
	id: string
}

export type Row =
	| {
		id: string
		rowType: 'collection'
		level: number
		node: ICollectionNode
		parentCollectionId: string | null
		indexInParent: number
	}
	| {
		id: string
		rowType: 'mock'
		level: number
		mock: IMockResponse
		parentCollectionId: string | null
		indexInParent: number
	}
