import React from 'react'
import { Button, Icon } from 'semantic-ui-react'

import { useGlobalStore } from '@/panel/app/store'
import type { IMockResponse } from '@/interface/mock'
import { downloadJsonFile } from '@/services/helper'

interface MockActionsProps {
	mock: IMockResponse
	isDark: boolean
	onEdit: (mock: IMockResponse) => void
	onDuplicate: (mock: IMockResponse) => void
	onDelete: (mock: IMockResponse) => void
}

export const MockActions: React.FC<MockActionsProps> = ({ mock, isDark, onEdit, onDuplicate, onDelete }) => {
	const t = useGlobalStore((s) => s.t)

	const handleExport = (e: React.MouseEvent) => {
		e.stopPropagation()
		const fileName = `mock-${mock.method}-${(mock.name || 'unnamed').replace(/\s+/g, '_')}.json`
		downloadJsonFile(fileName, mock)
	}

	return (
		<Button.Group size="mini" inverted={isDark}>
			<Button
				icon
				basic
				color="blue"
				title={t.mock_edit(mock.name)}
				onClick={(e) => { e.stopPropagation(); onEdit(mock) }}
				style={{ marginRight: '2px' }}
			>
				<Icon name="edit" />
			</Button>
			<Button
				icon
				basic
				color="blue"
				title={t.mock_export(mock.name)}
				onClick={handleExport}
				style={{ margin: '0 1px' }}
			>
				<Icon name="download" />
			</Button>
			<Button
				icon
				basic
				color="blue"
				title={t.mock_duplicate(mock.name)}
				onClick={(e) => { e.stopPropagation(); onDuplicate(mock) }}
				style={{ margin: '0 1px' }}
			>
				<Icon name="copy" />
			</Button>
			<Button
				icon
				basic
				color="red"
				title={t.mock_delete(mock.name)}
				onClick={(e) => { e.stopPropagation(); onDelete(mock) }}
				style={{ marginLeft: '2px' }}
			>
				<Icon name="trash" />
			</Button>
		</Button.Group>
	)
}
