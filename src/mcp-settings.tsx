import React from 'react'
import { createRoot } from 'react-dom/client'

import 'semantic-ui-css/semantic.min.css'
import './mcp-settings.scss'

import { MCPTab } from './panel/app/settings/tabs/mcp-tab'

const root = document.getElementById('root')
if (root)
	createRoot(root).render(
		<main style={{ maxWidth: 660, margin: '32px auto', padding: 16 }}>
			<MCPTab />
		</main>,
	)
