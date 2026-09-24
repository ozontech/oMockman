import { useCallback } from 'react'

import { useChromeStore } from '../store'

export function useAddMock() {
	const setSelectedMock = useChromeStore((s) => s.setSelectedMock)
	return useCallback(() => {
		setSelectedMock({})
	}, [setSelectedMock])
}

