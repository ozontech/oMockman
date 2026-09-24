import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Checkbox } from 'semantic-ui-react'
import { toast } from 'react-toastify'

import { useChromeStore, useGlobalStore } from '../../store'
import sm from '../settings-modal.module.scss'
import s from '../settings.module.scss'
import type { SettingsTabProps } from '../settings-modal.types'

import type { IStore } from '@/interface/mock'
import { describeSaveError, persistStoreChange } from '@/panel/app/service'
import { revokeSitePermission } from '@/services/origin'

/** Every granted origin, so a grant made months ago is not left working out of sight. */
export const SitesTab: React.FC<SettingsTabProps> = ({ isDark }) => {
	const t = useGlobalStore((g) => g.t)
	const tabId = useGlobalStore((g) => g.meta.tab?.id)
	const store = useChromeStore((c) => c.store)
	const setStoreProperties = useChromeStore((c) => c.setStoreProperties)
	const autoGrant = store?.autoGrantSites === true

	const entries = useMemo(() => Object.keys(store?.sitePermissions ?? {}).sort((a, b) => a.localeCompare(b)),
		[store?.sitePermissions])

	const [draftAutoGrant, setDraftAutoGrant] = useState(autoGrant)
	const [pendingRevokes, setPendingRevokes] = useState<string[]>([])

	useEffect(() => setDraftAutoGrant(autoGrant), [autoGrant])
	useEffect(() => setPendingRevokes((current) => current.filter((origin) => entries.includes(origin))), [entries])
	useEffect(() => {
		if (draftAutoGrant) setPendingRevokes([])
	}, [draftAutoGrant])

	const toggleRevoke = useCallback((origin: string) => {
		setPendingRevokes((current) => (current.includes(origin)
			? current.filter((item) => item !== origin)
			: [...current, origin]))
	}, [])

	const dirty = draftAutoGrant !== autoGrant || pendingRevokes.length > 0

	const handleSave = useCallback(async () => {
		const current = useChromeStore.getState().store
		const updatedStore = pendingRevokes.reduce<IStore>(
			(draft, origin) => revokeSitePermission(draft, origin),
			{ ...current, autoGrantSites: draftAutoGrant },
		)
		try {
			await persistStoreChange({ updatedStore, setStoreProperties, tabId, applyMocksNow: false })
			setPendingRevokes([])
			toast.success(t.toast_settingsSaved)
		} catch (error) {
			toast.error(describeSaveError(error, t, t.toast_settingsSaved))
		}
	}, [draftAutoGrant, pendingRevokes, setStoreProperties, tabId, t])

	return (
		<div className={sm.tabContent}>
			<div className={sm.optionGroup}>
				<span className={`${sm.fieldLabel} ${isDark ? sm.labelDark : ''}`}>{t.siteAccess_title}</span>

				<label className={`${sm.optionLabel} ${isDark ? sm.labelDark : ''}`}>
					<Checkbox
						checked={draftAutoGrant}
						onChange={(_, data) => setDraftAutoGrant(Boolean(data.checked))}
						data-testid="site-access-auto-grant"
					/>
					{t.siteAccess_autoGrant}
				</label>

				{/* A revoke would be undone on the next visit, so say why instead of doing nothing. */}
				{draftAutoGrant && entries.length > 0 && (
					<span className={sm.fieldHint} data-testid="site-access-revoke-blocked">
						{t.siteAccess_revokeBlocked}
					</span>
				)}

				{entries.length === 0 ? (
					<div className={s.siteAccessEmpty} data-testid="site-access-none">{t.siteAccess_empty}</div>
				) : (
					<div data-testid="site-access-entries">
						{entries.map((origin) => {
							const staged = pendingRevokes.includes(origin)
							return (
								<div
									key={origin}
									className={`${s.siteAccessEntry} ${staged ? s.siteAccessEntryStaged : ''}`}
									data-testid={`site-access-entry-${origin}`}
								>
									<span className={s.siteAccessOrigin}>{origin}</span>
									<Button
										size="mini"
										basic
										negative={!staged}
										inverted={isDark}
										disabled={draftAutoGrant}
										onClick={() => toggleRevoke(origin)}
										data-testid={`site-access-revoke-${origin}`}
									>
										{staged ? t.siteAccess_undoRevoke : t.siteAccess_revoke}
									</Button>
								</div>
							)
						})}
					</div>
				)}
			</div>

			<div className={sm.saveRow}>
				<Button primary disabled={!dirty} onClick={handleSave} data-testid="site-access-save">
					{t.env_save}
				</Button>
			</div>
		</div>
	)
}
