import React from 'react'
import { Icon, Popup } from 'semantic-ui-react'

import type { Row } from '../../model/types'
import type { CreateMocksTableSchemaParams } from '../mocks-table-schema.types'

import { buildMockDragProps } from './cell-helpers'
import badgeS from './status-column.module.scss'

import { StatusBadge } from '@/panel/app/blocks'
import type { IMockResponse } from '@/interface/mock'
import type { ICollectionNode } from '@/interface/collection'
import tableS from '@/panel/app/blocks/table.module.scss'
import { resolveMockApply } from '@/services/mock-apply'
import type { TableSchema } from '@/panel/app/blocks'

/** A collection whose scenario is on says so; a click starts its call counts over. */
function ScenarioStateBadge({ node, params }: { node: ICollectionNode; params: CreateMocksTableSchemaParams }): React.ReactElement | null {
	const scenario = node.scenario
	if (!scenario?.enabled || !scenario.rules?.length) return null
	return (
		<button
			type="button"
			className={badgeS.scenario}
			title={params.t.sc_badgeTitle}
			aria-label={params.t.sc_badge}
			onClick={(event) => {
				event.stopPropagation()
				params.onResetScenario(node.id)
			}}
			data-testid="scenario-state-badge"
		>
			<Icon name="sitemap" />
		</button>
	)
}

/** A served response shows its status; a rule the server answers shows the same icon as its Logs entry. */
function MockStatusBadge({ mock, t, isDark }: {
	mock: IMockResponse
	t: CreateMocksTableSchemaParams['t']
	isDark: boolean
}): React.ReactElement {
	const apply = resolveMockApply(mock)
	if (apply.responseBody) return <StatusBadge value={mock.status} inverted={isDark} />
	if (apply.requestBody) {
		return <Popup content={t.log_patchedCall} trigger={<Icon name="exchange" color="yellow" data-testid="request-patch-badge" />} />
	}
	return <Popup content={t.log_mockedHeaders} trigger={<Icon name="microchip" color="blue" data-testid="headers-only-badge" />} />
}

export function createStatusColumn(params: CreateMocksTableSchemaParams): TableSchema<Row>[number] {
	const { t, isFirefox, isDark, getCellDndHandlers, onDragStart } = params

	return {
		header: t.mocks_colStatus,
		width: 90,
		content: (row) => row.rowType === 'mock' ? (
			<div {...buildMockDragProps({ isFirefox, onDragStart }, row)}>
				<MockStatusBadge mock={row.mock} t={t} isDark={isDark} />
			</div>
		) : (
			<div {...getCellDndHandlers(row)} className={tableS.scenarioCell}>
				<ScenarioStateBadge node={row.node} params={params} />
			</div>
		),
	}
}
