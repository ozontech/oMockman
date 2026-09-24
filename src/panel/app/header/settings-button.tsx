import React, { useState } from 'react'
import { Button, Icon } from 'semantic-ui-react'

import { SettingsModal } from '@/panel/app/settings/settings-modal'
import { useGlobalStore } from '@/panel/app/store'

export const SettingsButton: React.FC = () => {
	const t = useGlobalStore((s) => s.t)
	const [open, setOpen] = useState(false)

	return (
		<>
			<Button
				icon
				compact
				size="small"
				basic
				color="blue"
				className="mm-hover-dim"
				onClick={() => setOpen(true)}
				title={t.settingsTitle}
				aria-label={t.settingsTitle}
				data-testid="settings-button"
			>
				<Icon name="cog" />
			</Button>

			<SettingsModal
				open={open}
				onClose={() => setOpen(false)}
			/>
		</>
	)
}
