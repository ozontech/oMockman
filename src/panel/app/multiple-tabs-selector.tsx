import React, { useCallback, useEffect, useState } from 'react'
import { Button, Card, Header, Icon, Message } from 'semantic-ui-react'

import { AppLoader } from './app-loader'

import { safeNumberInt } from '@/services/number'

const LS_KEY = 'mockman.selectedTabId'

const selectBestTab = (tabs: chrome.tabs.Tab[]): chrome.tabs.Tab | undefined => {
	if (tabs.length === 0) return undefined
	if (tabs.length === 1) return tabs[0]

	const httpTabs = tabs.filter((t) => t.url?.startsWith('http'))
	if (httpTabs.length === 1) return httpTabs[0]
	if (httpTabs.length > 0) return httpTabs[0]

	return tabs[0]
}

interface MultipleTabsSelectorProps {
	tabs: chrome.tabs.Tab[]
}

const TabCard: React.FC<{
	tab: chrome.tabs.Tab
	onSelect: (tab: chrome.tabs.Tab) => void
}> = ({ tab, onSelect }) => (
	<Card fluid>
		<Card.Content>
			<Card.Header>
				<Icon name="window maximize outline" />
				{tab.title || 'No title'}
			</Card.Header>
			<Card.Meta>Tab ID: {tab.id}</Card.Meta>
			<Card.Description>
				<div>
					<Icon name="linkify" />
					{tab.url}
				</div>
			</Card.Description>
		</Card.Content>
		<Card.Content extra>
			<Button
				basic
				color="blue"
				fluid
				onClick={() => onSelect(tab)}
				content="Select"
			/>
		</Card.Content>
	</Card>
)

export const MultipleTabsSelector: React.FC<MultipleTabsSelectorProps> = ({ tabs }) => {
	const [selectedTab, setSelectedTab] = useState<chrome.tabs.Tab | undefined>(
		() => selectBestTab(tabs),
	)

	useEffect(() => {
		const storedId = localStorage.getItem(LS_KEY)

		if (!storedId) return

		const parsedId = safeNumberInt(storedId ?? '')
		if (parsedId != null) {
			const prevTab = tabs.find((t) => t.id === parsedId)
			if (prevTab) setSelectedTab(prevTab)
		}
	}, [tabs])

	const handleSelect = useCallback((tab: chrome.tabs.Tab) => {
		setSelectedTab(tab)
		localStorage.setItem(LS_KEY, String(tab.id ?? ''))
	}, [])

	if (selectedTab) return <AppLoader tab={selectedTab} />

	return (
		<Card fluid>
			<Card.Content>
				<Header as="h4" textAlign="center" icon>
					<Icon name="window restore outline" />
					Multiple Active Windows
				</Header>
				<Message info>
					<Message.Content>
						Several browser windows are active (aside from this one). <br />
						<b>Mockman</b> cannot guess which tab to mock.<br />
						Please select the desired tab:
					</Message.Content>
				</Message>
				<Card.Group>
					{tabs.map((tab) => (
						<TabCard tab={tab} onSelect={handleSelect} key={tab.id} />
					))}
				</Card.Group>
			</Card.Content>
		</Card>
	)
}
