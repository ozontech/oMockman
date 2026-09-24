import { useEffect, useMemo, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'

import { safeNumberInt } from '@/services/number'
import type { IMockResponse, IMockResponseRaw } from '@/interface/mock'
import { MethodEnum } from '@/interface/network'
import { isJsonValid, prettifyJson } from '@/services/json'

const formatStatusInput = (value: unknown): string => {
	if (value == null) return ''
	const raw = String(value).trim()
	if (!raw) return ''
	const parsed = typeof value === 'number' ? value : safeNumberInt(raw)
	if (parsed == null) return ''
	if (parsed <= 0) return ''
	return String(parsed).padStart(3, '0')
}

interface UseAddMockFormStateInput {
	selectedMock?: Partial<IMockResponse>
	selectedCollectionOpenApiUrl: string
}

interface UseAddMockFormStateResult {
	values: IMockResponseRaw
	setValues: Dispatch<SetStateAction<IMockResponseRaw>>
	statusInput: string
	setStatusInput: Dispatch<SetStateAction<string>>
	formKey: string
}

export function useAddMockFormState(input: UseAddMockFormStateInput): UseAddMockFormStateResult {
	const { selectedMock, selectedCollectionOpenApiUrl } = input

	const [values, setValues] = useState<IMockResponseRaw>({
		id: selectedMock?.id,
		name: selectedMock?.name || '',
		url: selectedMock?.url || '',
		openApiUrl: selectedMock?.openApiUrl || (!selectedMock?.id ? selectedCollectionOpenApiUrl : ''),
		method: selectedMock?.method ?? MethodEnum.GET,
		status: selectedMock?.status ?? 200,
		delay: selectedMock?.delay,
		active: selectedMock?.active ?? true,
		response: selectedMock?.response || '',
		headers: Array.isArray(selectedMock?.headers) ? selectedMock?.headers : [],
		description: selectedMock?.description || '',
		createdOn: selectedMock?.createdOn,
		dynamic: selectedMock?.dynamic ?? false,
		collectionId: selectedMock?.collectionId ?? null,
	})

	const [statusInput, setStatusInput] = useState<string>(formatStatusInput(selectedMock?.status))

	useEffect(() => {
		if (selectedMock?.response && isJsonValid(selectedMock.response)) {
			const formatted = prettifyJson(selectedMock.response)
			setValues((prev) => ({ ...prev, response: formatted }))
		}
	}, [selectedMock])

	useEffect(() => {
		setStatusInput(formatStatusInput(selectedMock?.status))
	}, [selectedMock?.id, selectedMock?.url, selectedMock?.status])

	useEffect(() => {
		const nextOpenApiUrl = selectedMock?.openApiUrl || (!selectedMock?.id ? selectedCollectionOpenApiUrl : '')
		setValues((prev) => ({
			...prev,
			openApiUrl: nextOpenApiUrl,
			collectionId: selectedMock?.collectionId ?? null,
		}))
	}, [selectedMock?.id, selectedMock?.url, selectedMock?.collectionId, selectedMock?.openApiUrl, selectedCollectionOpenApiUrl])

	const formKey = useMemo(
		() => (selectedMock ? `${selectedMock.id}-${selectedMock.url}` : 'new'),
		[selectedMock],
	)

	return {
		values,
		setValues,
		statusInput,
		setStatusInput,
		formKey,
	}
}
