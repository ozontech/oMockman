import React, { useCallback, useEffect, useState } from 'react'
import { Button, Icon, Modal } from 'semantic-ui-react'

import { useGlobalStore } from '../store'

import { AITab } from './tabs/ai-tab'
import { EnvTab } from './tabs/env-tab'
import { OtherTab } from './tabs/other-tab'
import { SitesTab } from './tabs/sites-tab'
import sm from './settings-modal.module.scss'
import type { NavItem, SettingsModalProps, SettingsNavEntry } from './settings-modal.types'

import { modalHeaderSurface, modalSurface } from '@/panel/app/blocks'

export const SettingsModal: React.FC<SettingsModalProps> = ({ open, onClose, initialNav }) => {
	const isDark = useGlobalStore((g) => g.resolvedScheme === 'dark')
	const t = useGlobalStore((g) => g.t)

	const [nav, setNav] = useState<NavItem>(initialNav ?? 'ai')
	const [closing, setClosing] = useState(false)
	const visible = open || closing

	useEffect(() => {
		if (open && initialNav) setNav(initialNav)
	}, [open, initialNav])

	const handleClose = useCallback(() => {
		setClosing(true)
		window.setTimeout(() => {
			setClosing(false)
			onClose()
		}, 180)
	}, [onClose])

	useEffect(() => {
		if (!open) setClosing(false)
	}, [open])

	const navItems: SettingsNavEntry[] = [
		{ id: 'ai', label: t.settingsNav_ai, icon: 'magic' },
		{ id: 'env', label: t.settingsNav_env, icon: 'globe' },
		{ id: 'sites', label: t.settingsNav_sites, icon: 'shield' },
		{ id: 'other', label: t.settingsNav_other, icon: 'sliders' },
	]

	return (
		<Modal
			open={visible}
			onClose={handleClose}
			size="large"
			closeOnDimmerClick
			style={modalSurface(isDark)}
			transition={undefined}
			duration={0}
			className={`mm-modal ${closing ? 'mm-modal-leave' : 'mm-modal-enter'}`}
			dimmerClassName={`mm-modal-dimmer ${closing ? 'mm-modal-leave' : 'mm-modal-enter'}`}
		>
			<Modal.Header style={modalHeaderSurface(isDark)}>
				<div className={sm.modalHeaderRow}>
					<span>{t.settingsTitle}</span>
					<Button icon basic inverted={isDark} size="mini" onClick={handleClose} title={t.ai_close} aria-label={t.ai_close} data-testid="settings-close">
						<Icon name="close" />
					</Button>
				</div>
			</Modal.Header>

			<Modal.Content style={{ ...modalSurface(isDark), padding: 0 }}>
				<div className={`${sm.layout} ${isDark ? sm.layoutDark : ''}`}>
					<nav className={sm.sidebar}>
						{navItems.map((item) => (
							<button
								key={item.id}
								type="button"
								className={`${sm.navItem} ${nav === item.id ? sm.navItemActive : ''} ${isDark ? sm.navItemDark : ''}`}
								onClick={() => setNav(item.id)}
								data-testid={`nav-${item.id}`}
							>
								<Icon name={item.icon as never} />
								{item.label}
							</button>
						))}
					</nav>

					<div className={`${sm.content} ${isDark ? sm.contentDark : ''}`}>
						{nav === 'ai' && <AITab isDark={isDark} />}
						{nav === 'env' && <EnvTab isDark={isDark} />}
						{nav === 'sites' && <SitesTab isDark={isDark} />}
						{nav === 'other' && <OtherTab isDark={isDark} />}
					</div>
				</div>
			</Modal.Content>
		</Modal>
	)
}
