import React, { useMemo, useState } from 'react'
import { Form, Popup } from 'semantic-ui-react'

import s from './url-template-input.module.scss'

import { useGlobalStore } from '@/panel/app/store'
import { extractTemplateVars, resolveTemplate } from '@/services/env'

type HighlightPart =
	| { text: string; kind: 'plain' }
	| { text: string; kind: 'var_ok' }
	| { text: string; kind: 'var_missing' }
	| { text: string; kind: 'invalid' }

export const UrlTemplateInput: React.FC<{
	value: string
	onChange: (next: string) => void
	envVars: Record<string, string>
	isDark: boolean
}> = ({ value, onChange, envVars, isDark }) => {
	const t = useGlobalStore((s) => s.t)
	const urlVars = useMemo(() => extractTemplateVars(value ?? ''), [value])
	const resolvedUrl = useMemo(() => resolveTemplate(value ?? '', envVars), [envVars, value])

	const missingVars = useMemo(
		() => urlVars.filter((k) => !(k in envVars)),
		[envVars, urlVars],
	)

	const templateSyntaxInvalid = useMemo(() => {
		const raw = String(value ?? '')
		if (raw.includes('{{') || raw.includes('}}')) return true
		if (!raw.includes('{') && !raw.includes('}')) return false
		const rest = raw.replace(/\{\s*[A-Za-z0-9_]+\s*\}/g, '')
		return rest.includes('{') || rest.includes('}')
	}, [value])

	const hasTemplates = urlVars.length > 0 || String(value ?? '').includes('{') || String(value ?? '').includes('}')
	const templatesOk = hasTemplates && !templateSyntaxInvalid && missingVars.length === 0

	const [scrollLeft, setScrollLeft] = useState(0)

	const highlightParts = useMemo((): HighlightPart[] => {
		const raw = String(value ?? '')
		if (!raw) return []
		const re = /(\{\{\s*[A-Za-z0-9_]+\s*\}\}|\{\{|\}\}|\{\s*[A-Za-z0-9_]+\s*\}|\{|\})/g
		const parts = raw.split(re).filter((p) => p !== '')
		return parts.map((p) => {
			if (p === '{' || p === '}' || p === '{{' || p === '}}') return { text: p, kind: 'invalid' }
			if (/^\{\s*[A-Za-z0-9_]+\s*\}$/.test(p)) {
				const key = p.replace(/^\{\s*/, '').replace(/\s*\}$/, '').trim()
				const kind: HighlightPart['kind'] = (key in envVars) ? 'var_ok' : 'var_missing'
				return { text: p, kind }
			}
			return { text: p, kind: 'plain' }
		})
	}, [envVars, value])

	return (
		<Form.Field required>
			<label>{t.mock_urlLabel}</label>
			<Popup
				disabled={!hasTemplates}
				position="bottom left"
				hoverable
				inverted={isDark}
				content={(
					<div className={s.tooltipContent}>
						<div className={s.tooltipTitle}>{t.mock_resolvedUrl}</div>
						<div className={s.tooltipUrl}>{resolvedUrl}</div>
					</div>
				)}
				trigger={(
					<div
						className={[
							s.trigger,
							isDark ? s.triggerDark : '',
							hasTemplates && templatesOk ? (isDark ? s.okDark : s.okLight) : '',
							hasTemplates && (templateSyntaxInvalid || missingVars.length) ? (isDark ? s.warnDark : s.warnLight) : '',
						].filter(Boolean).join(' ')}
					>
						<div
							aria-hidden
							className={s.overlay}
						>
							<div style={{ transform: `translateX(${-scrollLeft}px)` }}>
								{value ? highlightParts.map((p, i) => {
									if (p.kind === 'plain') return <span key={i} style={{ color: 'transparent' }}>{p.text}</span>
									if (p.kind === 'invalid') {
										return (
											<span
												key={i}
												className={`${s.hl} ${isDark ? s.hlInvalidDark : s.hlInvalidLight}`}
											>
												{p.text}
											</span>
										)
									}
									const ok = p.kind === 'var_ok'
									return (
										<span
											key={i}
											className={`${s.hl} ${ok ? (isDark ? s.hlOkDark : s.hlOkLight) : (isDark ? s.hlMissingDark : s.hlMissingLight)}`}
										>
											{p.text}
										</span>
									)
								}) : (
									<span style={{ color: 'transparent' }}>{''}</span>
								)}
							</div>
						</div>

						<input
							required
							name="url"
							value={value ?? ''}
							placeholder={t.mock_urlPlaceholder}
							onChange={(e) => onChange(e.currentTarget?.value ?? '')}
							onScroll={(e) => setScrollLeft(e.currentTarget?.scrollLeft ?? 0)}
							className={`${s.input} ${isDark ? s.inputDark : s.inputLight}`}
							title={hasTemplates ? resolvedUrl : undefined}
						/>
					</div>
				)}
			/>
		</Form.Field>
	)
}
