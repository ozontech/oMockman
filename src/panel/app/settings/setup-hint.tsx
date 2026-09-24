import React, { useCallback, useState } from 'react'
import { Button, Icon } from 'semantic-ui-react'

import { useGlobalStore } from '../store'

import s from './settings.module.scss'

import type { ISetupHintProps } from '@/interface/ai'

/**
 * Shows how to obtain the key: shell commands with a copy button.
 * The content comes from the preset only.
 */
export const SetupHint: React.FC<ISetupHintProps> = ({ setupHint }) => {
	const t = useGlobalStore((s) => s.t)
	const [copied, setCopied] = useState(false)

	const handleCopy = useCallback(() => {
		const text = setupHint?.trim()
		if (!text) return
		void navigator.clipboard?.writeText(text).then(() => {
			setCopied(true)
			window.setTimeout(() => setCopied(false), 1500)
		})
	}, [setupHint])

	const hasHint = Boolean(setupHint?.trim())
	if (!hasHint) return null

	return (
		<div className={s.setupHint}>
			<div className={s.setupHintHead}>
				<Icon name="key" />
				<span>{t.setupHint_getKey}</span>
				{hasHint ? (
					<Button
						type="button"
						size="mini"
						basic
						className={s.setupHintCopy}
						onClick={handleCopy}
						title={t.setupHint_copy}
					>
						<Icon name={copied ? 'check' : 'copy'} />
						{copied ? t.setupHint_copied : t.setupHint_copy}
					</Button>
				) : null}
			</div>

			<div className={s.setupHintCode}>
				<pre className={s.setupHintPre}>{setupHint}</pre>
			</div>
		</div>
	)
}
