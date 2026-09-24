import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ProviderForm } from '@/panel/app/settings/provider-form'
import type { IAIProviderConfig, ProviderSubmitInput } from '@/interface/ai'
import { translations } from '@/panel/app/i18n/translations'

const onSubmit = vi.fn<(provider: ProviderSubmitInput) => Promise<void>>()
const onClose = vi.fn()
const onSaveSystemPrompt = vi.fn()

const t = translations.en

const renderForm = (editing?: IAIProviderConfig | null) => render(
	<ProviderForm
		open
		onClose={onClose}
		onSubmit={onSubmit}
		editing={editing}
		isDark={false}
		systemPrompt=""
		onSaveSystemPrompt={onSaveSystemPrompt}
	/>,
)

const fill = (placeholder: string, value: string): void => {
	fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value } })
}

const provider = (overrides: Partial<IAIProviderConfig> = {}): IAIProviderConfig => ({
	id: 'p-1',
	name: 'gateway',
	baseURL: 'https://llm.example.com/api',
	apiKey: 'sk-existing',
	model: 'model-a',
	createdOn: 1,
	...overrides,
})

describe('ProviderForm', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		onSubmit.mockResolvedValue(undefined)
	})

	it('keeps submit disabled until the required fields are filled', () => {
		renderForm()
		const submit = screen.getByRole('button', { name: t.ai_addConnectionBtn })

		expect(submit).toBeDisabled()

		fill(t.field_name_placeholder, 'gateway')
		fill(t.field_serverUrl_placeholder, 'https://llm.example.com/api')
		fill(t.field_model_placeholder, 'model-a')
		fireEvent.change(screen.getByPlaceholderText(t.apiKey_placeholder), { target: { value: 'sk-1' } })

		expect(screen.getByRole('button', { name: t.ai_addConnectionBtn })).toBeEnabled()
	})

	it('submits a trimmed provider', async () => {
		renderForm()

		fill(t.field_name_placeholder, '  gateway  ')
		fill(t.field_serverUrl_placeholder, ' https://llm.example.com/api ')
		fill(t.field_model_placeholder, ' model-a ')
		fireEvent.change(screen.getByPlaceholderText(t.apiKey_placeholder), { target: { value: ' sk-1 ' } })
		fireEvent.click(screen.getByRole('button', { name: t.ai_addConnectionBtn }))

		await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
		expect(onSubmit.mock.calls[0][0]).toMatchObject({
			name: 'gateway',
			baseURL: 'https://llm.example.com/api',
			model: 'model-a',
			apiKey: 'sk-1',
			allowLocalHttp: false,
		})
	})

	it('defaults the local-http opt-in to off', () => {
		renderForm()
		fireEvent.click(screen.getByText(t.field_advanced))

		expect(screen.getByTestId('provider-allow-local-http').querySelector('input')).not.toBeChecked()
	})

	it('submits the local-http opt-in when the user enables it', async () => {
		renderForm()

		fill(t.field_name_placeholder, 'local')
		fill(t.field_serverUrl_placeholder, 'http://127.0.0.1:11434/v1')
		fill(t.field_model_placeholder, 'llama')
		fireEvent.change(screen.getByPlaceholderText(t.apiKey_placeholder), { target: { value: 'sk-local' } })

		fireEvent.click(screen.getByText(t.field_advanced))
		fireEvent.click(screen.getByTestId('provider-allow-local-http').querySelector('input') as HTMLInputElement)
		fireEvent.click(screen.getByRole('button', { name: t.ai_addConnectionBtn }))

		await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
		expect(onSubmit.mock.calls[0][0]).toMatchObject({
			baseURL: 'http://127.0.0.1:11434/v1',
			allowLocalHttp: true,
		})
	})

	it('loads an existing connection for editing, opt-in included', () => {
		renderForm(provider({ allowLocalHttp: true, authHeader: 'x-api-key' }))

		expect(screen.getByPlaceholderText(t.field_name_placeholder)).toHaveValue('gateway')
		fireEvent.click(screen.getByText(t.field_advanced))
		expect(screen.getByTestId('provider-allow-local-http').querySelector('input')).toBeChecked()
		expect(screen.getByPlaceholderText('Authorization')).toHaveValue('x-api-key')
	})

	it('keeps extra headers editable', async () => {
		renderForm(provider())
		fireEvent.click(screen.getByText(t.field_advanced))

		fireEvent.click(screen.getByRole('button', { name: t.field_addHeader }))
		fireEvent.change(screen.getByPlaceholderText('X-Header'), { target: { value: 'X-Project' } })
		fireEvent.change(screen.getByPlaceholderText('value'), { target: { value: 'demo' } })
		fireEvent.click(screen.getByRole('button', { name: t.ai_save }))

		await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
		expect(onSubmit.mock.calls[0][0].extraHeaders).toEqual([{ name: 'X-Project', value: 'demo' }])
	})

	it('drops an extra header row', async () => {
		renderForm(provider({ extraHeaders: [{ name: 'X-Project', value: 'demo' }] }))
		fireEvent.click(screen.getByText(t.field_advanced))

		fireEvent.click(screen.getByRole('button', { name: t.pane_deleteHeader }))
		fireEvent.click(screen.getByRole('button', { name: t.ai_save }))

		await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
		expect(onSubmit.mock.calls[0][0].extraHeaders).toEqual([])
	})

	it('closes without submitting', () => {
		renderForm()
		fireEvent.click(screen.getByRole('button', { name: t.ai_cancel }))

		expect(onClose).toHaveBeenCalled()
		expect(onSubmit).not.toHaveBeenCalled()
	})
})
