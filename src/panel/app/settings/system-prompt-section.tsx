import React, { useEffect, useRef, useState } from 'react'
import { Form, Icon } from 'semantic-ui-react'

import { useGlobalStore } from '../store'

import s from './settings.module.scss'

import type { ISystemPromptSectionProps } from '@/interface/ai'

export const SystemPromptSection: React.FC<ISystemPromptSectionProps> = ({ isDark, value, onSave }) => {
	const t = useGlobalStore((s) => s.t)
	const [draft, setDraft] = useState(value)
	const [saved, setSaved] = useState(false)
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	useEffect(() => {
		setDraft(value)
	}, [value])

	const handleChange = (next: string) => {
		setDraft(next)
		setSaved(false)
		if (timerRef.current) clearTimeout(timerRef.current)
		timerRef.current = setTimeout(() => {
			onSave(next.trim() || undefined)
			setSaved(true)
		}, 800)
	}

	useEffect(() => () => {
		if (timerRef.current) clearTimeout(timerRef.current)
	}, [])

	return (
		<div>
			<Form inverted={isDark}>
				<Form.TextArea
					rows={3}
					value={draft}
					placeholder={t.systemPrompt_placeholder}
					onChange={(_, data) => handleChange(String(data.value ?? ''))}
				/>
			</Form>
			{saved && (
				<div className={s.systemPromptSaved}>
					<Icon name="check" color="green" size="small" />
					{t.systemPrompt_saved}
				</div>
			)}
		</div>
	)
}
