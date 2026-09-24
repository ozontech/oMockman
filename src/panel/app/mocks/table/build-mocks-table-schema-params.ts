import type { CreateMocksTableSchemaParams } from './mocks-table-schema.types'

import type { OmitStrict } from '@/interface/utility'
import type { IMockResponse } from '@/interface/mock'

export function buildMocksTableSchemaParams(
	params: OmitStrict<CreateMocksTableSchemaParams, 'setSelectedMock' | 'onCollectionSettings'> & {
		setSelectedMockRaw: (mock?: Partial<IMockResponse>) => void
		setSelectedSettingsCollectionId: (collectionId: string | null) => void
	},
): CreateMocksTableSchemaParams {
	const {
		setSelectedMockRaw,
		setSelectedSettingsCollectionId,
		...rest
	} = params

	return {
		...rest,
		setSelectedMock: (mock) => {
			setSelectedMockRaw(mock ?? undefined)
		},
		onCollectionSettings: (collectionId) => {
			setSelectedSettingsCollectionId(collectionId)
		},
	}
}
