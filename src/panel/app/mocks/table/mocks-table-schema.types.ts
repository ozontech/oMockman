import type { Row, DragEntryPayload } from '../model/types'

import type { ICollectionNode } from '@/interface/collection'
import type { IMockResponse } from '@/interface/mock'
import type { Translations } from '@/panel/app/i18n/translations'

export type CreateMocksTableSchemaParams = {
	s: Record<string, string>
	t: Translations
	isFirefox: boolean
	isDark: boolean
	allMocksEnabled: boolean
	handleToggleAllMocks: () => void
	editCol: { id: string; name: string } | null
	setEditCol: (v: { id: string; name: string } | null) => void
	expanded: Set<string>
	toggleExpanded: (id: string) => void
	expandToFirstActive: (collectionId: string) => void
	getRowPath: (row: Row) => string
	getCellDndHandlers: (row: Row) => {
		onDragOver: (e: React.DragEvent) => void
		onDrop: (e: React.DragEvent) => void
		onDragEnd: (e: React.DragEvent) => void
	}
	allowDrop: (e: React.DragEvent) => void
	handleRowDrag: (row: Row | null, e: React.DragEvent) => void
	clearPreview: () => void
	performDrop: (e: React.DragEvent, containerId: string | null, index?: number) => void
	onDragStart: (payload: DragEntryPayload) => (e: React.DragEvent) => void
	onCopyUrl: (url: string) => void
	columnWidths: {
		name: number
		url: number
	}
	envVars: Record<string, string>
	collectionMockCounts: Record<string, number>
	collectionHasActive: Record<string, boolean>
	collectionBranchEnabled: Record<string, boolean>
	collectionToggleAllowed: Record<string, boolean>
	actions: {
		toggleMock: (mockToUpdate: IMockResponse) => void
		editMock: (mock: IMockResponse) => void
		duplicateMock: (mock: IMockResponse) => void
		deleteMock: (mock: IMockResponse) => void
	}
	collectionActions: {
		renameCollection: (collectionId: string, name: string) => void
		createCollection: (parentId: string | null) => void
		deleteCollection: (collectionId: string) => void
		toggleCollectionMocking: (collectionId: string, active: boolean) => void
	}
	ensureCollectionExpanded: (collectionId: string | null) => void
	setSelectedMock: (mock: IMockResponse | null) => void
	onCollectionSettings?: (collectionId: string) => void
	exportCollection: (collectionId: string, name: string) => void
	maxCollectionDepth: number
	rows: Row[]
	collectionNodes: Record<string, ICollectionNode>
	animateRemove: (ids: Array<string>, cb: () => void) => void
}
