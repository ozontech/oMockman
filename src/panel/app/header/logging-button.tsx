import React from 'react'
import { Button, Icon } from 'semantic-ui-react'
import type { SemanticCOLORS } from 'semantic-ui-react'

import { useGlobalStore } from '../store'

export const LoggingButton: React.FC = () => {
	const loggingEnabled = useGlobalStore((s) => s.loggingEnabled)
	const toggleLogging = useGlobalStore((s) => s.toggleLogging)
	const t = useGlobalStore((s) => s.t)

	const color: SemanticCOLORS = loggingEnabled ? 'red' : 'green'
	const label = loggingEnabled ? t.header_stopLogging : t.header_startLogging

	return (
		<Button
			icon
			compact
			size="small"
			basic
			color={color}
			className="mm-hover-dim"
			title={label}
			aria-pressed={loggingEnabled}
			aria-label={label}
			onClick={toggleLogging}
		>
			<Icon name={loggingEnabled ? 'pause' : 'play'} style={{ margin: 0, lineHeight: 1 }} />
		</Button>
	)
}
