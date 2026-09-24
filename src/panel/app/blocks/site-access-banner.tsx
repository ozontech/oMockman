import React, { useCallback, useState } from 'react'
import { Button } from 'semantic-ui-react'
import { toast } from 'react-toastify'

import { useChromeStore, useGlobalStore } from '../store'

import s from './site-access-banner.module.scss'

import { usePageOrigin } from '@/panel/app/hooks/use-page-origin'
import { describeSaveError, persistStoreChange } from '@/panel/app/service'
import { SettingsModal } from '@/panel/app/settings/settings-modal'
import { grantSitePermission, hasAnyPermission } from '@/services/origin'

/**
 * Tells the user why nothing is being mocked here, and grants access in one click.
 *
 * Granting reloads the tab: requests that already left cannot be mocked retroactively.
 */
export const SiteAccessBanner: React.FC = () => {
	const t = useGlobalStore((g) => g.t)
	const tabId = useGlobalStore((g) => g.meta.tab?.id)
	const store = useChromeStore((c) => c.store)
	const setStoreProperties = useChromeStore((c) => c.setStoreProperties)
	const { origin, loading } = usePageOrigin()
	const [saving, setSaving] = useState(false)
	const [settingsOpen, setSettingsOpen] = useState(false)

	const grant = useCallback(async () => {
		if (!origin) return
		setSaving(true)
		try {
			// Read at write time: the auto-grant hook may have written since this render, and a
			// stale copy would undo it.
			await persistStoreChange({
				updatedStore: grantSitePermission(useChromeStore.getState().store, origin),
				setStoreProperties,
				tabId,
				applyMocksNow: false,
			})
			toast.success(t.toast_siteAccessSaved(origin))
			if (typeof tabId === 'number') {
				try {
					chrome.tabs.reload(tabId)
				} catch {
					void 0
				}
			}
		} catch (error) {
			toast.error(describeSaveError(error, t, t.toast_siteAccessSaved(origin)))
		} finally {
			setSaving(false)
		}
	}, [origin, setStoreProperties, tabId, t])

	const allowed = origin ? hasAnyPermission(store, origin) : false
	const hidden = loading || !origin || allowed

	// The banner unmounts the moment access is granted; the modal must not go with it.
	if (hidden) {
		return settingsOpen
			? <SettingsModal open onClose={() => setSettingsOpen(false)} initialNav="sites" />
			: null
	}

	return (
		<>
			<div className={s.banner} data-testid="site-access-banner">
				<div className={s.text}>
					<span className={s.origin}>{t.siteAccess_bannerTitle(origin)}</span>
					<span className={s.hint}>{t.siteAccess_bannerText}</span>
					<button
						type="button"
						className={s.link}
						onClick={() => setSettingsOpen(true)}
						data-testid="site-access-banner-settings"
					>
						{t.siteAccess_bannerSettingsLink}
					</button>
				</div>
				{/* Solid, not `inverted`: this is the banner's only action and stays filled in both themes. */}
				<Button
					size="mini"
					primary
					disabled={saving}
					onClick={() => void grant()}
					data-testid="site-access-banner-action"
				>
					{t.siteAccess_applyAndReload}
				</Button>
			</div>

			<SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} initialNav="sites" />
		</>
	)
}
