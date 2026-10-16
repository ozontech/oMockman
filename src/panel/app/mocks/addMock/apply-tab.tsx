import React from 'react'
import { Checkbox, Tab } from 'semantic-ui-react'

import panesS from './add-mock-panes.module.scss'

import { useGlobalStore } from '@/panel/app/store'

/** A tab title with the switch that turns its part of the mock on and off without opening the tab. */
export const ApplyTabLabel: React.FC<{
	label: string
	on: boolean
	onToggle: (on: boolean) => void
	testId: string
}> = ({ label, on, onToggle, testId }) => {
	const t = useGlobalStore((s) => s.t)
	return (
		<span className={`${panesS.applyTab} ${on ? '' : panesS.applyTabOff}`}>
			<Checkbox
				toggle
				checked={on}
				onClick={(event: React.MouseEvent) => event.stopPropagation()}
				onChange={(_, data) => onToggle(Boolean(data.checked))}
				className={panesS.applySwitch}
				title={t.pane_switchTitle}
				data-testid={`apply-${testId}`}
			/>
			<span data-testid={`tab-${testId}`}>{label}</span>
		</span>
	)
}

/** `inert` keeps a switched-off part out of reach of the mouse and the keyboard alike. */
const LOCKED = { inert: '' } as Record<string, string>

/** A tab pane whose part, when switched off, stays visible as a dimmed, locked draft. */
export const ApplyPane: React.FC<{
	isDark: boolean
	on: boolean
	children: React.ReactNode
}> = ({ isDark, on, children }) => (
	<Tab.Pane attached={false} inverted={isDark}>
		<div
			className={`${panesS.applyBody} ${on ? '' : panesS.sectionOff}`}
			aria-disabled={!on}
			data-testid={on ? undefined : 'section-off'}
			{...(on ? {} : LOCKED)}
		>
			{children}
		</div>
	</Tab.Pane>
)
