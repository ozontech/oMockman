import React from 'react'

import type { Row } from '../../model/types'
import type { CreateMocksTableSchemaParams } from '../mocks-table-schema.types'

import type { TableSchema } from '@/panel/app/blocks'
import { CollectionActions } from '@/panel/app/mocks/components/collection-actions'
import { MockActions } from '@/panel/app/mocks/components/mock-actions'
import type { IMockResponse } from '@/interface/mock'

function getIdsToAnimateForCollectionDelete(input: {
	rows: Row[]
	collectionNodes: CreateMocksTableSchemaParams['collectionNodes']
	collectionId: string
}): string[] {
	const { rows, collectionNodes, collectionId } = input

	const isDescendant = (maybeChild: string, ancestor: string): boolean => {
		let cur = collectionNodes[maybeChild]
		while (cur?.parentId) {
			if (cur.parentId === ancestor) return true
			cur = collectionNodes[cur.parentId]
		}
		return false
	}

	return rows
		.filter((row) => {
			if (row.rowType === 'collection') {
				return row.node.id === collectionId || isDescendant(row.node.id, collectionId)
			}
			const parentCollectionId = row.parentCollectionId
			return !!parentCollectionId && (parentCollectionId === collectionId || isDescendant(parentCollectionId, collectionId))
		})
		.map((row) => row.id)
}

export function createActionsColumn(params: CreateMocksTableSchemaParams): TableSchema<Row>[number] {
	const {
		t,
		isDark,
		getCellDndHandlers,
		actions,
		collectionActions,
		ensureCollectionExpanded,
		setSelectedMock,
		onCollectionSettings,
		exportCollection,
		maxCollectionDepth,
		rows,
		collectionNodes,
		animateRemove,
	} = params

	return {
		header: t.mocks_colActions,
		minWidth: 150,
		width: 180,
		content: (row) => (
			<div style={{ width: '100%', height: '100%' }} {...getCellDndHandlers(row)}>
				{row.rowType === 'mock' ? (
					<MockActions
						mock={row.mock}
						isDark={isDark}
						onEdit={(mock) => actions.editMock(mock)}
						onDuplicate={(mock) => actions.duplicateMock(mock)}
						onDelete={(mock) => {
							animateRemove([mock.id], () => actions.deleteMock(mock))
						}}
					/>
				) : (
					<CollectionActions
						collectionId={row.node.id}
						collectionName={row.node.name}
						isDark={isDark}
						hasContents={Array.isArray(row.node.entries) && row.node.entries.length > 0}
						onAddMock={(collectionId) => {
							ensureCollectionExpanded(collectionId)
							setSelectedMock({ collectionId } as unknown as IMockResponse)
						}}
						canAddSubcollection={row.level < maxCollectionDepth}
						onAddSubcollection={(id) => {
							ensureCollectionExpanded(id)
							collectionActions.createCollection(id)
						}}
						onSettings={onCollectionSettings}
						onExport={(id, name) => exportCollection(id, name)}
						onDelete={(id) => {
							const idsToAnimate = getIdsToAnimateForCollectionDelete({
								rows,
								collectionNodes,
								collectionId: id,
							})
							animateRemove(idsToAnimate, () => collectionActions.deleteCollection(id))
						}}
					/>
				)}
			</div>
		),
	}
}
