import React from 'react'
import { Button, Icon } from 'semantic-ui-react'

import { useGlobalStore } from '@/panel/app/store'

export const ThemeButton: React.FC = () => {
	const scheme = useGlobalStore((s) => s.scheme)
	const toggleScheme = useGlobalStore((s) => s.toggleScheme)
	const dark = scheme === 'dark'

	return (
		<Button
			icon
			compact
			size="small"
			basic
			color={dark ? 'yellow' : 'blue'}
			className="mm-hover-dim"
			onClick={toggleScheme}
			title={dark ? 'White theme' : 'Dark theme'}
		>
			<Icon name={dark ? 'sun' : 'moon'} />
		</Button>
	)
}
