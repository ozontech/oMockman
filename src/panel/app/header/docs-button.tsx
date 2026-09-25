import React from 'react'
import { Button, Icon } from 'semantic-ui-react'

import { useGlobalStore } from '@/panel/app/store'

const DOCS_URL = 'https://github.com/ozontech/oMockman#readme'

export const DocsButton: React.FC = () => {
	const t = useGlobalStore((s) => s.t)

	return (
		<Button
			as="a"
			href={DOCS_URL}
			target="_blank"
			rel="noreferrer"
			icon
			compact
			size="small"
			basic
			color="blue"
			className="mm-hover-dim"
			title={t.docsTitle}
			aria-label={t.docsTitle}
		>
			<Icon name="book" />
		</Button>
	)
}
