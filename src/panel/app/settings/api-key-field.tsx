import React from 'react'
import { Form } from 'semantic-ui-react'

import { useGlobalStore } from '../store'

import s from './settings.module.scss'

import type { IApiKeyFieldProps } from '@/interface/ai'

/** Takes a new key only: a saved key is never shown, just its mask in the placeholder. */
export const ApiKeyField: React.FC<IApiKeyFieldProps> = ({ value, onChange, savedMask, needsNewKey }) => {
	const t = useGlobalStore((s) => s.t)
	return (
		<Form.Field required={!savedMask}>
			<label>{t.field_apiKey}</label>
			<input
				type="password"
				autoComplete="off"
				value={value}
				onChange={(e) => onChange(e.currentTarget.value)}
				placeholder={savedMask ? t.apiKey_keepPlaceholder(savedMask) : t.apiKey_placeholder}
				className={s.apiKeyInput}
				data-testid="api-key-input"
			/>
			<div className={s.fieldHint}>{needsNewKey ? t.field_apiKey_rebind : t.field_apiKey_hint}</div>
		</Form.Field>
	)
}
