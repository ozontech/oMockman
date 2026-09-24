import React from 'react'
import { createPortal } from 'react-dom'

import { useChromeStore, useLogStore, useDetachedStore } from '../store'

import { AddMock } from '@/panel/app/mocks/addMock/add-mock'
import { AddMockDetached } from '@/panel/app/mocks/addMock/add-mock-detached'
import { LogDetails } from '@/panel/app/logs/logDetails/log-details'
import { LogDetailsDetached } from '@/panel/app/logs/logDetails/log-details-detached'

export const Modal: React.FC = () => {
	const selectedMock = useChromeStore((s) => s.selectedMock)
	const { selectedLog, setSelectedLog } = useLogStore((s) => ({
		selectedLog: s.selectedLog,
		setSelectedLog: s.setSelectedLog,
	}))
	const { detachedMocks, detachedLogs, removeDetachedMock, removeDetachedLog } = useDetachedStore()

	return createPortal(
		<>
			{selectedLog && <LogDetails log={selectedLog} onClose={() => setSelectedLog()} />}
			{selectedMock && <AddMock />}

			{detachedMocks.map((item) => (
				<AddMockDetached
					key={item.id}
					mock={item.mock}
					onClose={() => removeDetachedMock(item.id)}
				/>
			))}
			{detachedLogs.map((item) => (
				<LogDetailsDetached
					key={item.id}
					log={item.log}
					onClose={() => removeDetachedLog(item.id)}
				/>
			))}
		</>,
		document.body,
	)
}
