import React from 'react'
import { Button, Icon } from 'semantic-ui-react'

import { useGlobalStore, useLogStore } from '../store'

export const ClearButton: React.FC = () => {
	const clearLogs = useLogStore((s) => s.clearLogs)
	const t = useGlobalStore((s) => s.t)

	return (
		<Button
			icon
			compact
			size="small"
			basic
			circular
			color="blue"
			className="mm-hover-dim"
			onClick={clearLogs}
			title={t.header_clearLogs}
			aria-label={t.header_clearLogs}
		>
			<Icon name="eraser" />
		</Button>
	)
}
