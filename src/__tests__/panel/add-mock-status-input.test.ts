import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { IMockResponse } from '@/interface/mock'
import { MethodEnum } from '@/interface/network'
import { useAddMockFormState } from '@/panel/app/mocks/addMock/hooks/use-add-mock-form-state'

const mock = (status: number | undefined): IMockResponse => ({
	id: 'm1',
	name: 'x',
	url: 'http://localhost:8814/healthcheck',
	method: MethodEnum.GET,
	status,
	response: '',
	headers: [],
	active: true,
	createdOn: 1,
} as unknown as IMockResponse)

const statusInputFor = (status: number | undefined): string =>
	renderHook(() => useAddMockFormState({ selectedMock: mock(status), selectedCollectionOpenApiUrl: '' }))
		.result.current.statusInput

describe('status field of the mock form', () => {
	it('pads a real status to three digits', () => {
		expect(statusInputFor(200)).toBe('200')
		expect(statusInputFor(404)).toBe('404')
	})

	it('leaves the field empty when no response arrived', () => {
		// Creating a mock from a failed log entry (ERR_CONNECTION_REFUSED) used to show "000",
		// which is not a status that can be saved.
		expect(statusInputFor(0)).toBe('')
	})

	it('leaves the field empty when there is no status at all', () => {
		expect(statusInputFor(undefined)).toBe('')
	})
})
