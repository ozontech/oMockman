import React, { useEffect, useRef } from 'react'

import { useChromeStore } from '../../store'
import type { useChromeStoreState } from '../../store'

import { AddMockForm } from './add-mock-form'

import { SideDrawer } from '@/panel/app/blocks'
import { useDetachedWindow } from '@/panel/app/hooks/use-detached-window'
import type { IMockResponse } from '@/interface/mock'

const useMockStoreSelector = (s: useChromeStoreState) => ({
	store: s.store,
	setStoreProperties: s.setStoreProperties,
})

interface Props {
	mock: Partial<IMockResponse>
	onClose: () => void
}

export const AddMockDetached: React.FC<Props> = ({ mock, onClose }) => {
	const { store, setStoreProperties } = useChromeStore(useMockStoreSelector)
	const wasDetachedRef = useRef(false)

	const key = mock ? `${mock.id}-${mock.url}` : 'new'

	const { render, detach, isDetached } = useDetachedWindow({
		title: mock?.id ? 'MockMan — Update Mock' : 'MockMan — Add Mock',
	})

	useEffect(() => {
		detach()
	}, [detach])

	useEffect(() => {
		if (isDetached) {
			wasDetachedRef.current = true
		}
	}, [isDetached])

	useEffect(() => {
		if (wasDetachedRef.current && !isDetached) {
			onClose()
		}
	}, [isDetached, onClose])

	const content = (
		<SideDrawer minWidth={550} storageKey="mockman.drawer.add" detached>
			<AddMockForm
				key={key}
				store={store}
				selectedMock={mock}
				setSelectedMock={() => onClose()}
				setStoreProperties={setStoreProperties}
				isDetached
				onClose={onClose}
			/>
		</SideDrawer>
	)

	return render(content)
}
