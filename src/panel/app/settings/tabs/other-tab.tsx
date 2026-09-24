import React, { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { Button, Checkbox, Radio } from 'semantic-ui-react'

import { useChromeStore, useGlobalStore } from '../../store'
import sm from '../settings-modal.module.scss'
import type { SettingsTabProps } from '../settings-modal.types'

import { describeSaveError, storeActions } from '@/panel/app/service'
import type { ColorScheme } from '@/panel/app/store/use-global-store'
import type { Lang } from '@/panel/app/i18n/translations'

export const OtherTab: React.FC<SettingsTabProps> = ({ isDark }) => {
	const t = useGlobalStore((g) => g.t)
	const scheme = useGlobalStore((g) => g.scheme)
	const setScheme = useGlobalStore((g) => g.setScheme)
	const lang = useGlobalStore((g) => g.lang)
	const setLang = useGlobalStore((g) => g.setLang)
	const store = useChromeStore((c) => c.store)
	const setStoreProperties = useChromeStore((c) => c.setStoreProperties)
	const allowLocalOpenApi = store?.security?.allowLocalOpenApi === true
	const [draftScheme, setDraftScheme] = useState<ColorScheme>(scheme)
	const [draftLang, setDraftLang] = useState<Lang>(lang)
	const [draftAllowLocalOpenApi, setDraftAllowLocalOpenApi] = useState(allowLocalOpenApi)

	useEffect(() => setDraftScheme(scheme), [scheme])
	useEffect(() => setDraftLang(lang), [lang])
	useEffect(() => setDraftAllowLocalOpenApi(allowLocalOpenApi), [allowLocalOpenApi])

	const labelClass = `${sm.fieldLabel} ${isDark ? sm.labelDark : ''}`
	const optionClass = `${sm.optionLabel} ${isDark ? sm.labelDark : ''}`

	const themeOptions: Array<{ value: ColorScheme; label: string }> = [
		{ value: 'light', label: t.other_themeLight },
		{ value: 'dark', label: t.other_themeDark },
		{ value: 'system', label: t.other_themeSystem },
	]
	const langOptions: Array<{ value: Lang; label: string }> = [
		{ value: 'en', label: t.other_languageEn },
		{ value: 'ru', label: t.other_languageRu },
	]

	const dirty = draftScheme !== scheme
		|| draftLang !== lang
		|| draftAllowLocalOpenApi !== allowLocalOpenApi

	const handleSave = async () => {
		setScheme(draftScheme)
		setLang(draftLang)
		if (store && draftAllowLocalOpenApi !== allowLocalOpenApi) {
			try {
				setStoreProperties(await storeActions.updateStoreInDB({
					...store,
					security: { ...store.security, allowLocalOpenApi: draftAllowLocalOpenApi },
				}))
			} catch (error) {
				toast.error(describeSaveError(error, t, t.toast_storageWriteFailed(error instanceof Error ? error.message : 'unknown error')))
				return
			}
		}
		toast.success(t.toast_settingsSaved)
	}

	return (
		<div className={sm.tabContent}>
			<div className={sm.optionGroup}>
				<span className={labelClass}>{t.other_theme}</span>
				{themeOptions.map((opt) => (
					<label key={opt.value} className={optionClass}>
						<Radio
							name="theme"
							value={opt.value}
							checked={draftScheme === opt.value}
							onChange={() => setDraftScheme(opt.value)}
							data-testid={`theme-${opt.value}`}
						/>
						{opt.label}
					</label>
				))}
			</div>

			<div className={sm.optionGroup}>
				<span className={labelClass}>{t.other_language}</span>
				{langOptions.map((opt) => (
					<label key={opt.value} className={optionClass}>
						<Radio
							name="lang"
							value={opt.value}
							checked={draftLang === opt.value}
							onChange={() => setDraftLang(opt.value)}
						/>
						{opt.label}
					</label>
				))}
			</div>

			<div className={sm.optionGroup}>
				<span className={labelClass}>{t.other_security}</span>
				<label className={optionClass}>
					<Checkbox
						checked={draftAllowLocalOpenApi}
						onChange={(_, data) => setDraftAllowLocalOpenApi(Boolean(data.checked))}
						data-testid="allow-local-openapi"
					/>
					{t.other_allowLocalOpenApi}
				</label>
				<span className={sm.fieldHint}>{t.other_allowLocalOpenApi_hint}</span>
			</div>

			<div className={sm.saveRow}>
				<Button primary disabled={!dirty} onClick={handleSave} data-testid="settings-save">
					{t.env_save}
				</Button>
			</div>
		</div>
	)
}
