import React, { useCallback, useState } from 'react'
import { Button, Icon } from 'semantic-ui-react'

import { useGlobalStore } from '../store'

import s from './settings.module.scss'

import type { IAIChatResponseError, ITestConnectionButtonProps, TestConnectionState } from '@/interface/ai'
import { aiTestConnection } from '@/services/ai'

const initialState: TestConnectionState = { status: 'idle' }

function describeFailure(response: IAIChatResponseError): TestConnectionState {
	switch (response.error.code) {
		case 'token_invalid':
			return { status: 'fail', message: 'Token is invalid or expired', traceId: response.error.traceId }
		case 'rate_limited':
			return { status: 'fail', message: 'Rate limit hit, try again later', traceId: response.error.traceId }
		case 'network':
			return { status: 'fail', message: 'Cannot reach baseURL — check VPN/network', traceId: response.error.traceId }
		case 'provider_misconfigured':
			return { status: 'fail', message: response.error.message }
		default:
			return { status: 'fail', message: response.error.message || 'Unknown error', traceId: response.error.traceId }
	}
}

export const TestConnectionButton: React.FC<ITestConnectionButtonProps> = ({
	provider,
	disabled,
	isDark,
}) => {
	const t = useGlobalStore((s) => s.t)
	const [state, setState] = useState<TestConnectionState>(initialState)

	const handleClick = useCallback(async () => {
		setState({ status: 'pending' })
		const startedAt = Date.now()
		const response = await aiTestConnection({ provider })
		const durationMs = Date.now() - startedAt
		if (response.ok) {
			setState({ status: 'ok', durationMs, model: response.model })
		} else {
			setState(describeFailure(response))
		}
	}, [provider])

	const isPending = state.status === 'pending'

	return (
		<div className={s.testConnectionRow}>
			<Button
				type="button"
				basic
				inverted={isDark}
				size="small"
				disabled={disabled || isPending}
				onClick={() => void handleClick()}
				className={s.testConnectionButton}
			>
				{isPending ? <Icon name="spinner" loading /> : <Icon name="plug" />}
				{isPending ? t.test_pending : t.test_btn}
			</Button>

			{state.status === 'ok' ? (
				<span className={s.testConnectionOk}>
					<Icon name="check circle" />
					{t.test_ok(state.durationMs, state.model)}
				</span>
			) : null}

			{state.status === 'fail' ? (
				<span className={s.testConnectionFail}>
					<Icon name="exclamation triangle" />
					{state.message}
					{state.traceId ? <span className={s.traceId}> (trace: {state.traceId})</span> : null}
				</span>
			) : null}
		</div>
	)
}
