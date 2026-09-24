import React from 'react'
import { Form } from 'semantic-ui-react'

import { MethodToggle } from './controls'
import s from './request-settings-row.module.scss'

import { safeNumberInt } from '@/services/number'
import type { IMockResponseRaw } from '@/interface/mock'
import type { MethodEnum } from '@/interface/network'
import { parsePositiveIntFromInput } from '@/services/helper'

export const RequestSettingsRow: React.FC<{
	isDark: boolean
	method: MethodEnum
	onMethodChange: (m: MethodEnum) => void
	statusInput: string
	onStatusInputChange: (raw: string, parsed?: number) => void
	delay: IMockResponseRaw['delay']
	onDelayChange: (val: IMockResponseRaw['delay']) => void
}> = ({ isDark, method, onMethodChange, statusInput, onStatusInputChange, delay, onDelayChange }) => {
	return (
		<Form.Group className={s.row}>
			<MethodToggle
				method={method}
				onChange={onMethodChange}
				isDark={isDark}
			/>
			<Form.Field className={s.fixed80}>
				<Form.Input
					className={['compact-number', isDark ? s.darkInput : ''].filter(Boolean).join(' ')}
					required
					type="text"
					inputMode="numeric"
					pattern="[0-9]*"
					label="Status"
					placeholder="200"
					name="status"
					value={statusInput}
					onChange={(e) => {
						const raw = e.currentTarget?.value ?? ''
						const next = raw.replace(/\D+/g, '').slice(0, 3)
						const parsed = next === '' ? undefined : (safeNumberInt(next) ?? undefined)
						onStatusInputChange(next, parsed)
					}}
					style={{ width: '100%' }}
				/>
			</Form.Field>
			<Form.Field className={s.fixed80}>
				<Form.Input
					className={['compact-number', isDark ? s.darkInput : ''].filter(Boolean).join(' ')}
					type="text"
					inputMode="numeric"
					pattern="[0-9]*"
					label="Delay (ms)"
					placeholder=""
					name="delay"
					value={delay ?? ''}
					onChange={(_, data) => onDelayChange(parsePositiveIntFromInput(data.value))}
					style={{ width: '100%' }}
				/>
			</Form.Field>
		</Form.Group>
	)
}

