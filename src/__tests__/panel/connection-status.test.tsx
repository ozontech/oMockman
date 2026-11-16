import { act, cleanup, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'

import {
	describeMcpConnection,
	useConnectionIndicators,
} from '@/panel/app/settings/connection-status'

const { call, settings } = vi.hoisted(() => ({
	call: vi.fn(),
	settings: {
		ai: {
			enabled: true,
			activeProviderId: 'test',
			providers: [{ id: 'test', name: 'Local model', model: 'demo' }],
		},
	},
}))
vi.mock('@/services/extension-api', () => ({ sendExtensionMessage: call }))
vi.mock('@/panel/app/store', () => ({
	useGlobalStore: (select: (state: unknown) => unknown) => select({ lang: 'en' }),
	useChromeStore: (select: (state: unknown) => unknown) => select({ store: settings }),
}))
afterEach(() => {
	cleanup()
	vi.useRealTimers()
	call.mockReset()
})

it.each([
	[{ status: 'connected' }, 'attention'],
	[{ status: 'connected', tabId: 1, origin: 'https://app.test' }, 'ready'],
	[{ status: 'connected-memory-only', tabId: 1, origin: 'https://app.test' }, 'ready'],
	[{ status: 'tab-unavailable', tabId: 1, origin: 'https://app.test' }, 'attention'],
	[{ status: 'pairing-required', tabId: 1, origin: 'https://app.test' }, 'off'],
	[null, 'off'],
] as const)('does not confuse connection and tab readiness: %j', (status, tone) => {
	expect(describeMcpConnection(status, false).tone).toBe(tone)
})

const Indicators = () => {
	const { mcp, ai } = useConnectionIndicators()
	return (
		<>
			<output data-testid="mcp">{mcp.tone}</output>
			<output data-testid="ai">{ai.description}</output>
		</>
	)
}

it('shares local polling, clears stale green on failure and stops after unmount', async () => {
	vi.useFakeTimers()
	call.mockResolvedValue({ status: 'connected', tabId: 2, origin: 'https://app.test' })
	const first = render(<Indicators />)
	const second = render(<Indicators />)
	await act(async () => {})
	expect(call).toHaveBeenCalledTimes(1)
	expect(screen.getAllByTestId('mcp').map((node) => node.textContent)).toEqual(['ready', 'ready'])
	call.mockRejectedValue(new Error('Worker stopped'))
	await act(async () => {
		await vi.advanceTimersByTimeAsync(2000)
	})
	expect(screen.getAllByTestId('mcp').map((node) => node.textContent)).toEqual(['off', 'off'])
	first.unmount()
	second.unmount()
	await act(async () => {
		await vi.advanceTimersByTimeAsync(6000)
	})
	expect(call).toHaveBeenCalledTimes(2)
})

it('labels AI selection without claiming availability or sending a model request', async () => {
	call.mockResolvedValue({ status: 'disconnected' })
	render(<Indicators />)
	await act(async () => {})
	expect(screen.getByTestId('ai').textContent).toContain('Local model')
	expect(screen.getByTestId('ai').textContent).toContain('Server availability has not been checked')
	expect(call.mock.calls).toEqual([[{ type: 'MOCKMAN_MCP', action: 'status' }]])
})
