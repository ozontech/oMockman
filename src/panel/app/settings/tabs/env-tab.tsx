import React from 'react'
import { toast } from 'react-toastify'
import { Button, Dropdown, Form, Icon, Input } from 'semantic-ui-react'

import { useGlobalStore } from '../../store'
import { useEnvEditor } from '../use-env-editor'
import sm from '../settings-modal.module.scss'
import type { SettingsTabProps } from '../settings-modal.types'

export const EnvTab: React.FC<SettingsTabProps> = ({ isDark }) => {
	const t = useGlobalStore((g) => g.t)
	const env = useEnvEditor()

	const labelClass = `${sm.fieldLabel} ${isDark ? sm.labelDark : ''}`

	if (!env.draft) return <div className={sm.tabContent} />

	return (
		<div className={sm.tabContent}>
			<Form>
				<Form.Field>
					<label className={labelClass}>{t.env_selected}</label>
					<div className={sm.profileRow}>
						<Dropdown
							selection
							options={env.envOptions}
							value={env.draft.activeId}
							onChange={(_, d) => env.selectProfile(String(d.value || ''))}
						/>
						<Button
							type="button"
							basic
							inverted={isDark}
							size="mini"
							onClick={env.addProfile}
							title={t.env_add}
						>
							<Icon name="add" /> {t.env_add}
						</Button>
						<Button
							type="button"
							basic
							inverted={isDark}
							size="mini"
							disabled={env.draft.profiles.length <= 1}
							onClick={env.removeProfile}
							title={t.env_delete}
						>
							<Icon name="trash" /> {t.env_delete}
						</Button>
					</div>
				</Form.Field>

				{env.currentProfile ? (
					<>
						<Form.Field>
							<label className={labelClass}>{t.env_nameLabel}</label>
							<Input
								value={env.currentProfile.name}
								onChange={(e) => env.renameProfile(e.currentTarget.value)}
							/>
						</Form.Field>

						<Form.Field>
							<label className={labelClass}>{t.env_varsLabel}</label>

							{env.varsRows.map((row) => (
								<div key={row.id} className={sm.varRow}>
									<Input
										className={sm.varKeyInput}
										value={row.key}
										placeholder="KEY"
										onChange={(e) => env.updateVar(row.id, { key: e.currentTarget.value })}
									/>
									<Input
										className={sm.varValueInput}
										value={row.value}
										placeholder="value"
										onChange={(e) => env.updateVar(row.id, { value: e.currentTarget.value })}
									/>
									<Button
										icon
										type="button"
										basic
										inverted={isDark}
										size="mini"
										onClick={() => env.removeVar(row.id)}
										title={t.env_removeVar}
									>
										<Icon name="close" />
									</Button>
								</div>

							))}

							<Button type="button" basic inverted={isDark} size="mini" onClick={env.addVar}>
								<Icon name="add" /> {t.env_addVar}
							</Button>
						</Form.Field>
					</>
				) : null}

				<div className={sm.saveRow}>
					<Button
						primary
						onClick={() => {
							void env.save().then((ok) => {
								if (ok) toast.success(t.toast_envSaved)
							})
						}}
					>
						{t.env_save}
					</Button>
					{env.saved && (
						<span className={sm.savedIndicator}>
							<Icon name="check" color="green" size="small" />
							{t.systemPrompt_saved}
						</span>
					)}
				</div>
			</Form>
		</div>
	)
}
