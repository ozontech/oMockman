import React from 'react'
import { Segment, Header, Button, Icon, Menu } from 'semantic-ui-react'

import { useGlobalStore } from '../../store'

import s from './log-details.module.scss'

interface TopBlockProps {
	isDark: boolean
	url?: string
	activeIndex: number
	onChangeTab: (idx: number) => void
	onMock: () => void
	onClose: () => void
	isDetached?: boolean
	onToggleDetach?: (detached: boolean) => void
}

export const StickyTopBlock: React.FC<TopBlockProps> = ({
	isDark,
	url,
	activeIndex,
	onChangeTab,
	onMock,
	onClose,
	onToggleDetach,
	isDetached,
}) => {
	const t = useGlobalStore((s) => s.t)

	return (
		<div className={s.stickyTopWrap}>
			<Segment
				data-mm-sticky-header="1"
				basic
				inverted={isDark}
				className={s.headerSticky}
				style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					margin: 0,
					padding: '8px 12px',
				}}
			>
				<div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 16 }}>
					<Header as="h4" style={{ margin: 0, fontWeight: 500, fontSize: 19, color: isDark ? '#ffffff' : '#000000' }}>
						{t.logDetail_title}
					</Header>
					<Button size="mini" basic color="blue" icon onClick={onMock} style={{ marginLeft: 8, fontSize: '14px' }}>
						{t.logDetail_mock}
					</Button>
				</div>
				<div style={{ display: 'flex', gap: 2 }}>
					{onToggleDetach ? (
						<Button
							icon
							basic
							inverted={isDark}
							size="mini"
							onClick={() => onToggleDetach(!isDetached)}
							title={isDetached ? t.logDetail_attachBack : t.logDetail_openWindow}
							style={{ color: isDark ? '#ffffff' : undefined }}
						>
							<Icon name={isDetached ? 'window restore' : 'external alternate'} />
						</Button>
					) : null}
					<Button icon basic color="red" onClick={onClose} style={{ marginLeft: 0 }} size="mini">
						<Icon name="close" />
					</Button>
				</div>
			</Segment>

			<Segment basic className={s.urlRow} style={{ background: isDark ? '#222222' : '#ffffff' }}>
				<div className={s.urlInner}>
					<span style={{ fontWeight: 500 }}>{t.logDetail_url}</span>
					<span style={{ overflow: 'auto', wordBreak: 'break-all' }}>{url}</span>
				</div>
			</Segment>

			<div className={s.tabsMenuSticky}>
				<Menu secondary pointing inverted={isDark}>
					<Menu.Item name={t.logDetail_tabResponse} active={activeIndex === 0} onClick={() => onChangeTab(0)} />
					<Menu.Item name={t.logDetail_tabRequestBody} active={activeIndex === 1} onClick={() => onChangeTab(1)} />
					<Menu.Item name={t.logDetail_tabQueryParams} active={activeIndex === 2} onClick={() => onChangeTab(2)} />
					<Menu.Item name={t.logDetail_tabHeaders} active={activeIndex === 3} onClick={() => onChangeTab(3)} />
				</Menu>
			</div>
		</div>
	)
}
