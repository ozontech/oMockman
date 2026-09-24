import React from 'react'
import { Segment, Header } from 'semantic-ui-react'

interface PlaceholderProps {
	description: string
	title: string
	inverted?: boolean
}

export const Placeholder: React.FC<PlaceholderProps> = ({ title, description, inverted }) => (
	<Segment
		inverted={inverted}
		placeholder
		textAlign="center"
		vertical
		style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
	>
		<div>
			<Header as="h4" inverted={inverted} style={{ marginBottom: 8 }}>{title}</Header>
			<div style={{ fontSize: 15 }}>{description}</div>
		</div>
	</Segment>
)
