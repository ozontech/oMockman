import React from 'react'
import { Form, Icon } from 'semantic-ui-react'

import s from './add-mock.module.scss'

import { useGlobalStore } from '@/panel/app/store'

interface Suggestion {
	url: string
	label: string
}

interface OpenApiUrlFieldProps {
	isDark: boolean
	value: string
	inputRef: React.RefObject<HTMLInputElement>
	error?: string
	loading: boolean
	ready: boolean
	suggestionsPartial: boolean
	suggestions: Suggestion[]
	suggestOpen: boolean
	onChange: (next: string) => void
	onFocus: () => void
	onBlur: () => void
	onSelectSuggestion: (url: string) => void
}

export const OpenApiUrlField: React.FC<OpenApiUrlFieldProps> = ({
	isDark,
	value,
	inputRef,
	error,
	loading,
	ready,
	suggestionsPartial,
	suggestions,
	suggestOpen,
	onChange,
	onFocus,
	onBlur,
	onSelectSuggestion,
}) => {
	const t = useGlobalStore((store) => store.t)

	return (
		<Form.Field error={Boolean(error)}>
			<label>
				{t.mock_fieldOpenApi}
				{loading ? <Icon name="spinner" loading style={{ marginLeft: 8 }} /> : null}
				{ready ? <Icon name="check circle" color="green" style={{ marginLeft: 8 }} /> : null}
			</label>
			<div className={s.openApiInputWrap}>
				<div className={`ui fluid input${isDark ? ` ${s.darkField}` : ''}${error ? ' error' : ''}`}>
					<input
						ref={inputRef}
						type="text"
						placeholder={t.mock_openApiPlaceholder}
						name="openApiUrl"
						value={value}
						autoComplete="off"
						onChange={(e) => onChange(e.target.value)}
						onFocus={onFocus}
						onBlur={onBlur}
					/>
				</div>
				{suggestOpen && suggestions.length > 0 && (
					<ul className={`${s.openApiSuggestList} ${isDark ? s.openApiSuggestDark : ''}`}>
						{suggestions.map((item) => (
							<li
								key={item.url}
								className={s.openApiSuggestItem}
								onMouseDown={() => onSelectSuggestion(item.url)}
							>
								{item.url}
							</li>
						))}
					</ul>
				)}
			</div>
			{error ? <div className={s.openapiError}>{error}</div> : null}
			{suggestionsPartial ? (
				<div className={s.openapiHint}>{t.mock_openApiPartial}</div>
			) : null}
		</Form.Field>
	)
}
