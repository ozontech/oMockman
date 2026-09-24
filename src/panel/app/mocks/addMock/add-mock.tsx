import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { useChromeStoreState } from '../../store'
import { useChromeStore, useDetachedStore } from '../../store'

import { AddMockForm } from './add-mock-form'

import { SideDrawer } from '@/panel/app/blocks'

const useMockStoreSelector = (s: useChromeStoreState) => ({
	store: s.store,
	selectedMock: s.selectedMock,
	setSelectedMock: s.setSelectedMock,
	setStoreProperties: s.setStoreProperties,
})

export const AddMock: React.FC = () => {
	const {
		store,
		selectedMock,
		setSelectedMock,
		setStoreProperties,
	} = useChromeStore(useMockStoreSelector)

	const addDetachedMock = useDetachedStore((s) => s.addDetachedMock)

	const key = selectedMock ? `${selectedMock.id}-${selectedMock.url}` : 'new'
	const [closing, setClosing] = useState(false)
	const closeTimer = useRef<number | null>(null)

	const clearCloseTimer = () => {
		if (closeTimer.current != null) {
			window.clearTimeout(closeTimer.current)
			closeTimer.current = null
		}
	}

	useEffect(() => {
		setClosing(false)
		clearCloseTimer()
	}, [key])

	useEffect(() => () => clearCloseTimer(), [])

	const handleDetach = () => {
		if (selectedMock) {
			addDetachedMock(selectedMock)
			setClosing(true)
			closeTimer.current = window.setTimeout(() => setSelectedMock(undefined), 180)
		}
	}

	const handleClose = useCallback(() => {
		setClosing(true)
		closeTimer.current = window.setTimeout(() => setSelectedMock(undefined), 180)
	}, [setSelectedMock])

	const drawerClassName = useMemo(() => (closing ? 'mm-sd-leave' : 'mm-sd-enter'), [closing])

	return (
		<SideDrawer minWidth={550} storageKey="mockman.drawer.add" className={drawerClassName} onClickOutside={handleClose}>
			<AddMockForm
				key={key}
				store={store}
				selectedMock={selectedMock}
				setSelectedMock={setSelectedMock}
				setStoreProperties={setStoreProperties}
				isDetached={false}
				onToggleDetach={(next) => next && handleDetach()}
				onClose={handleClose}
			/>
		</SideDrawer>
	)
}
