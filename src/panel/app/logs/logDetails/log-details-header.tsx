import React from 'react'
import { Segment, Header, List, Message } from 'semantic-ui-react'

import { useGlobalStore } from '../../store'

import s from './log-details-header.module.scss'

type HeaderEntry = { name: string; value: string }
type HeaderList = HeaderEntry[] | undefined

interface Props {
	requestHeaders?: HeaderList
	responseHeaders?: HeaderList
}

const HeaderItems: React.FC<{ headers?: HeaderList; isDark: boolean; emptyLabel: string }> = ({ headers, isDark, emptyLabel }) => {
	if (!headers?.length)
		return <span style={{ fontSize: 14, color: isDark ? '#aaa' : '#888', marginLeft: 16 }}>{emptyLabel}</span>

	return (
		<List size="small" className={s.list}>
			{headers.map(({ name, value }, idx) => (
				<List.Item key={`${name}-${idx}`} className={s.item}>
					<List.Content>
						<span className={s.name} style={{ color: isDark ? '#ffffff' : '#000000' }}>{name}:</span>
						<span className={s.value} style={{ color: isDark ? '#ffffff' : '#000000' }}>{value}</span>
					</List.Content>
				</List.Item>
			))}
		</List>
	)
}

export const LogDetailsHeader: React.FC<Props> = ({
	requestHeaders,
	responseHeaders,
}) => {
	const isDark = useGlobalStore((s) => s.resolvedScheme === 'dark')
	const t = useGlobalStore((s) => s.t)

	if (!requestHeaders && !responseHeaders)
		return (
			<Segment basic textAlign="center" style={{ paddingTop: 32 }}>
				<Message info content={t.logDetail_pending} />
			</Segment>
		)

	return (
		<Segment
			basic
			style={{
				padding: 16,
				paddingLeft: 16,
				border: 'none',
				borderBottom: 'none',
				borderTop: 'none',
				boxShadow: 'none',
			}}
		>
			<Header as="h5" style={{ marginTop: 0, marginLeft: 16, color: isDark ? '#ffffff' : '#000000' }}>{t.logDetail_responseHeaders}</Header>
			<HeaderItems headers={responseHeaders} isDark={isDark} emptyLabel={t.logDetail_noHeaders} />
			<Header as="h5" style={{ marginTop: 16, marginLeft: 16, color: isDark ? '#ffffff' : '#000000' }}>{t.logDetail_requestHeaders}</Header>
			<HeaderItems headers={requestHeaders} isDark={isDark} emptyLabel={t.logDetail_noHeaders} />
		</Segment>
	)
}
