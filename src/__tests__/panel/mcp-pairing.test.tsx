import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'

import { MCPTab } from '@/panel/app/settings/tabs/mcp-tab'

const { call } = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('@/services/extension-api', () => ({
	sendExtensionMessage: call,
	queryTabs: async () => (await call({ action: 'tabs' })).map((tab: { tabId: number; origin: string; title?: string; path?: string }) => ({ id: tab.tabId, url: tab.origin + (tab.path ?? '/'), title: tab.title })),
}))
vi.mock('@/panel/app/store', () => ({
	useGlobalStore: (select: (state: unknown) => unknown) => select({ meta: {}, lang: 'en', resolvedScheme: 'light' }),
}))
afterEach(() => { cleanup(); vi.useRealTimers(); call.mockReset() })

it('retains rejected codes, prevents duplicate pairing and clears only after confirmation', async () => {
	vi.useFakeTimers()
	let status: Record<string, unknown> = { status: 'disconnected' }
	call.mockImplementation(async (request: { action: string }) => {
		if (request.action === 'pair') status = { status: 'connecting' }
		return request.action === 'tabs' ? [] : status
	})
	render(<MCPTab />)
	await act(async () => {})
	const input = screen.getByLabelText('MCP code') as HTMLInputElement
	fireEvent.change(input, { target: { value: '0123456789abcdef' } })
	expect(screen.queryByRole('alert')).toBeNull()
	await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Pair' })) })
	expect(input.value).toBe('0123456789abcdef')
	expect((screen.getByRole('button', { name: 'Connecting…' }) as HTMLButtonElement).disabled).toBe(true)
	status = { status: 'pairing-required' }
	await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
	expect(input.value).toBe('0123456789abcdef')
	expect(screen.getByRole('alert').textContent).toContain('Code rejected')
	await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Pair' })) })
	status = { status: 'connected', connectionId: 'confirmed' }
	await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
	expect(screen.queryByLabelText('MCP code')).toBeNull()
	status = { status: 'pairing-required', connectionId: 'confirmed' }
	await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
	expect((screen.getByLabelText('MCP code') as HTMLInputElement).value).toBe('')
})

it('allows following when the old tab is unavailable and shows the click before the reply', async () => {
	vi.useFakeTimers()
	let finish!: (value: unknown) => void
	const status = { status: 'tab-unavailable', connectionId: 'paired', tabId: 7 }
	call.mockImplementation(async (request: { action: string }) => {
		if (request.action === 'follow_active') return new Promise((resolve) => { finish = resolve })
		return request.action === 'tabs' ? [] : status
	})
	render(<MCPTab />)
	await act(async () => {})
	const checkbox = screen.getByRole('checkbox', { name: 'Follow active tab' }) as HTMLInputElement
	expect(checkbox.disabled).toBe(false)
	fireEvent.click(checkbox)
	expect(checkbox.checked).toBe(true)
	await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
	expect(checkbox.checked).toBe(true)
	await act(async () => { finish({ ...status, status: 'connected', followActive: true, tabId: 8, origin: 'https://app.test' }) })
	expect(checkbox.checked).toBe(true)
	expect((screen.getByLabelText('MCP tab') as HTMLSelectElement).value).toBe('8')
})

it('lets manual selection override following and keeps the new value while saving', async () => {
	vi.useFakeTimers()
	let finish!: (value: unknown) => void
	let status = { status: 'connected', connectionId: 'paired', tabId: 7, origin: 'https://app.test', followActive: true }
	call.mockImplementation(async (request: { action: string; tabId?: number }) => {
		if (request.action === 'select') {
			return new Promise((resolve) => { finish = resolve })
		}
		return request.action === 'tabs' ? [{ tabId: 7, origin: status.origin }, { tabId: 8, origin: status.origin }] : status
	})
	render(<MCPTab />)
	await act(async () => {})
	const select = screen.getByLabelText('MCP tab') as HTMLSelectElement
	expect(select.disabled).toBe(false)
	fireEvent.change(select, { target: { value: '8' } })
	expect(select.value).toBe('8')
	await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
	expect(select.value).toBe('8')
	status = { ...status, tabId: 8, followActive: false }
	await act(async () => { finish(status) })
	await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
	expect(select.value).toBe('8')
	expect((screen.getByLabelText('Follow active tab') as HTMLInputElement).checked).toBe(false)
})

it('keeps a tab awaiting site permission selected across polling, then applies the grant', async () => {
	vi.useFakeTimers()
	let status = { status: 'connected', connectionId: 'paired', tabId: 7, origin: 'https://app.test' }
	call.mockImplementation(async (request: { action: string }) => {
		if (request.action === 'tabs') return [{ tabId: 7, origin: status.origin }, { tabId: 8, origin: 'https://other.test' }]
		if (request.action === 'select') return { error: 'Allow this site in Mockman first', requiresSitePermission: true, tabId: 8, origin: 'https://other.test' }
		if (request.action === 'grant_site_and_select') status = { ...status, tabId: 8, origin: 'https://other.test' }
		return status
	})
	render(<MCPTab />)
	await act(async () => {})
	const select = screen.getByLabelText('MCP tab') as HTMLSelectElement
	await act(async () => { fireEvent.change(select, { target: { value: '8' } }) })
	expect(select.value).toBe('8')
	await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
	expect(select.value).toBe('8')
	expect(screen.getByRole('alert').textContent).toContain('https://other.test')
	expect(screen.queryByLabelText('Allow MCP scenario changes')).toBeNull()
	await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Allow site' })) })
	expect(select.value).toBe('8')
	expect(screen.queryByRole('alert')).toBeNull()
	expect(screen.getByLabelText('Allow MCP scenario changes')).toBeTruthy()
})

it('does not remove the existing permission notice while choosing another blocked site', async () => {
	vi.useFakeTimers()
	let finish!: (value: unknown) => void
	const status = { status: 'connected', connectionId: 'paired', tabId: 7, origin: 'https://app.test' }
	call.mockImplementation(async (request: { action: string; tabId?: number }) => {
		if (request.action === 'tabs') return [7, 8, 9].map((tabId) => ({ tabId, origin: `https://site${tabId}.test` }))
		if (request.action === 'select' && request.tabId === 8) return { error: 'Allow this site', requiresSitePermission: true, tabId: 8, origin: 'https://site8.test' }
		if (request.action === 'select') return new Promise((resolve) => { finish = resolve })
		return status
	})
	render(<MCPTab />)
	await act(async () => {})
	const select = screen.getByLabelText('MCP tab') as HTMLSelectElement
	await act(async () => { fireEvent.change(select, { target: { value: '8' } }) })
	const notice = screen.getByRole('alert')
	fireEvent.change(select, { target: { value: '9' } })
	expect(select.value).toBe('9')
	expect(screen.getByRole('alert')).toBe(notice)
	expect(screen.queryByLabelText('Allow MCP scenario changes')).toBeNull()
	await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
	expect(select.value).toBe('9')
	await act(async () => { finish({ error: 'Allow this site', requiresSitePermission: true, tabId: 9, origin: 'https://site9.test' }) })
	expect(screen.getByRole('alert')).toBe(notice)
	expect(notice.textContent).toContain('https://site9.test')
	expect(select.value).toBe('9')
})
