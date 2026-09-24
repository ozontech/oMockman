import React, { useCallback, useState } from 'react'
import { toast } from 'react-toastify'
import { Button, Icon } from 'semantic-ui-react'

import { useGlobalStore } from '../../store'
import { ImportPreset } from '../import-preset'
import { ProviderForm } from '../provider-form'
import { ProvidersList } from '../providers-list'
import { useAIActions } from '../use-ai-actions'
import s from '../settings.module.scss'
import sm from '../settings-modal.module.scss'
import type { SettingsTabProps } from '../settings-modal.types'

import type { PresetImport, ProviderFormState } from '@/interface/ai'

export const AITab: React.FC<SettingsTabProps> = ({ isDark }) => {
	const t = useGlobalStore((g) => g.t)
	const {
		settings,
		addProvider,
		updateProvider,
		removeProvider,
		setActiveProvider,
		setSystemPrompt,
	} = useAIActions()

	const [providerFormState, setProviderFormState] = useState<ProviderFormState>({ mode: 'closed' })
	const [importOpen, setImportOpen] = useState(false)

	const closeProviderForm = useCallback(() => setProviderFormState({ mode: 'closed' }), [])

	const handleSubmitProvider = useCallback(
		async (values: Parameters<Parameters<typeof ProviderForm>[0]['onSubmit']>[0]) => {
			if (providerFormState.mode === 'edit') {
				await updateProvider(providerFormState.provider.id, values)
				return
			}
			await addProvider(values)
		},
		[providerFormState, addProvider, updateProvider],
	)

	const handleImportPreset = useCallback(
		async (preset: PresetImport) => {
			const provider = await addProvider({
				name: preset.name,
				baseURL: preset.baseURL,
				apiKey: '',
				model: preset.model,
				authHeader: preset.authHeader,
				authPrefix: preset.authPrefix,
				extraHeaders: preset.extraHeaders,
				temperature: preset.temperature,
				maxTokens: preset.maxTokens,
				supportsJsonMode: preset.supportsJsonMode,
				supportsStreaming: preset.supportsStreaming,
				setupHint: preset.setupHint,
			})
			setProviderFormState({ mode: 'edit', provider })
		},
		[addProvider],
	)

	const hasProviders = settings.providers.length > 0

	return (
		<div className={sm.tabContent}>
			{hasProviders ? (
				<>
					<div className={s.listHead}>
						<span className={s.listHint}>{t.ai_pickHint}</span>
						<div className={s.listActions}>
							<Button basic size="tiny" inverted={isDark} onClick={() => setImportOpen(true)}>
								<Icon name="upload" />
								{t.ai_importJson}
							</Button>
							<Button primary size="tiny" onClick={() => setProviderFormState({ mode: 'add' })}>
								<Icon name="plus" />
								{t.ai_add}
							</Button>
						</div>
					</div>

					<ProvidersList
						providers={settings.providers}
						activeProviderId={settings.activeProviderId}
						onSelectActive={(id) => setActiveProvider(id).catch(() => void 0)}
						onEdit={(provider) => setProviderFormState({ mode: 'edit', provider })}
						onRemove={(provider) => {
							removeProvider(provider.id)
								.then(() => toast.success(t.toast_connectionRemoved(provider.name)))
								.catch(() => void 0)
						}}
						isDark={isDark}
					/>
				</>
			) : (
				<div className={s.empty}>
					<Icon name="magic" size="huge" className={s.emptyIcon} />
					<div className={s.emptyTitle}>{t.ai_emptyTitle}</div>
					<div className={s.emptyHint}>{t.ai_emptyHint}</div>
					<Button primary size="large" onClick={() => setProviderFormState({ mode: 'add' })} className={s.emptyPrimaryBtn}>
						<Icon name="plus" />
						{t.ai_addConnection}
					</Button>
					<button type="button" className={s.emptyLink} onClick={() => setImportOpen(true)}>
						{t.ai_orPaste}
					</button>
				</div>
			)}

			<ProviderForm
				open={providerFormState.mode !== 'closed'}
				editing={providerFormState.mode === 'edit' ? providerFormState.provider : null}
				onClose={closeProviderForm}
				onSubmit={handleSubmitProvider}
				isDark={isDark}
				systemPrompt={settings.globalSystemPrompt ?? ''}
				onSaveSystemPrompt={(next) => setSystemPrompt(next).catch(() => void 0)}
			/>

			<ImportPreset
				open={importOpen}
				onClose={() => setImportOpen(false)}
				onImport={handleImportPreset}
				isDark={isDark}
			/>
		</div>
	)
}
