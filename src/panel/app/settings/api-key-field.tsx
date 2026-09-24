import React from 'react'
import { Form } from 'semantic-ui-react'

import { useGlobalStore } from '../store'

import s from './settings.module.scss'

import type { IApiKeyFieldProps } from '@/interface/ai'

export const ApiKeyField: React.FC<IApiKeyFieldProps> = ({ value, onChange }) => {
	const t = useGlobalStore((s) => s.t)
	return (
		<Form.Field required>
			<label>{t.field_apiKey}</label>
			<input
				type="password"
				value={value}
				onChange={(e) => onChange(e.currentTarget.value)}
				placeholder={t.apiKey_placeholder}
				className={s.apiKeyInput}
			/>
			<div className={s.fieldHint}>{t.field_apiKey_hint}</div>
		</Form.Field>
	)
}
