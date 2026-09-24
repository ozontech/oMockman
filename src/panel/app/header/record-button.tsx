import React from 'react'
import { Button, Icon } from 'semantic-ui-react'
import type { SemanticCOLORS } from 'semantic-ui-react'
import { toast } from 'react-toastify'

import { useGlobalStore } from '../store'

export const RecordButton: React.FC = () => {
	const recording = useGlobalStore((s) => s.recording)
	const toggleRecording = useGlobalStore((s) => s.toggleRecording)
	const t = useGlobalStore((s) => s.t)

	const handleClick = () => {
		if (recording) {
			toast.info(t.header_recordStopped, { autoClose: 2500, position: 'bottom-right' })
		} else {
			toast.success(t.header_recordStarted, { autoClose: 2500, position: 'bottom-right' })
		}
		toggleRecording()
	}

	const color: SemanticCOLORS = recording ? 'red' : 'blue'

	return (
		<Button
			icon
			compact
			size="small"
			basic
			color={color}
			className="mm-hover-dim"
			title={t.header_record}
			aria-pressed={recording}
			aria-label={t.header_record}
			onClick={handleClick}
		>
			<Icon name="circle" />
		</Button>
	)
}
