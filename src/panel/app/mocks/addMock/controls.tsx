import React from 'react'
import { Button, Form } from 'semantic-ui-react'

import s from './controls.module.scss'

import { useGlobalStore } from '@/panel/app/store'
import { MethodEnum } from '@/interface/network'

export const StatusToggle: React.FC<{
	active: boolean
	onChange: (active: boolean) => void
	isDark: boolean
	className?: string
	disabled?: boolean
}> = ({ active, onChange, isDark, className, disabled }) => {
	const t = useGlobalStore((s) => s.t)
	return (
		<Form.Field className={[s.statusField, className].filter(Boolean).join(' ')}>
			<label>{t.mock_statusLabel}</label>
			<Button.Group>
				<Button
					type="button"
					size="small"
					inverted={isDark && !active}
					active={active}
					disabled={disabled}
					onClick={() => onChange(true)}
					className={[
						s.statusBtn,
						isDark ? s.statusBtnDark : s.statusBtnLight,
						active ? s.statusActiveOn : '',
					].filter(Boolean).join(' ')}
				>
					{t.mock_statusActive}
				</Button>
				<Button
					type="button"
					size="small"
					inverted={isDark && active}
					active={!active}
					disabled={disabled}
					onClick={() => onChange(false)}
					className={[
						s.statusBtn,
						isDark ? s.statusBtnDark : s.statusBtnLight,
						!active ? s.statusInactiveOn : '',
					].filter(Boolean).join(' ')}
				>
					{t.mock_statusInactive}
				</Button>
			</Button.Group>
		</Form.Field>
	)
}

export const MethodToggle: React.FC<{
	method: MethodEnum
	onChange: (method: MethodEnum) => void
	isDark: boolean
}> = ({ method, onChange, isDark }) => {
	const t = useGlobalStore((s) => s.t)
	return (
		<Form.Field className={s.methodField}>
			<label>{t.mock_methodLabel}</label>
			<Button.Group size="small">
				{Object.values(MethodEnum).map((methodOption) => {
					const isActive = method === methodOption
					return (
						<Button
							key={methodOption}
							type="button"
							size="small"
							color="blue"
							active={isActive}
							onClick={() => onChange(methodOption)}
							className={[
								s.methodBtn,
								isDark ? s.methodBtnDark : s.methodBtnLight,
								isActive ? s.methodBtnActive : '',
							].filter(Boolean).join(' ')}
						>
							{methodOption}
						</Button>
					)
				})}
			</Button.Group>
		</Form.Field>
	)
}
