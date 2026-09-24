export type NavItem = 'ai' | 'env' | 'sites' | 'other'

export interface SettingsModalProps {
	open: boolean
	onClose: () => void
	initialNav?: NavItem
}

export interface SettingsTabProps {
	isDark: boolean
}

export interface SettingsNavEntry {
	id: NavItem
	label: string
	icon: string
}
