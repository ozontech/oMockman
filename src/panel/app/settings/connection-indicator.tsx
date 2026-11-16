import React from 'react'

import styles from './connection-indicator.module.scss'
import type { ConnectionIndicator } from './connection-status'

export const ConnectionDot: React.FC<{ indicator: ConnectionIndicator }> = ({ indicator }) => (
	<span
		className={`${styles.dot} ${styles[indicator.tone]}`}
		title={indicator.description}
		role="img"
		aria-label={indicator.description}
		data-state={indicator.tone}
	/>
)
