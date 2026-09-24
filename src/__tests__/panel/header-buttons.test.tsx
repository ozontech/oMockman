import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ClearButton } from '@/panel/app/header/clear-button'
import { DocsButton } from '@/panel/app/header/docs-button'
import { ThemeButton } from '@/panel/app/header/theme-button'
import { translations } from '@/panel/app/i18n/translations'
import { useGlobalStore, useLogStore } from '@/panel/app/store'

const t = translations.en

describe('header buttons', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		useGlobalStore.setState({ scheme: 'light', lang: 'en', t })
	})

	describe('ClearButton', () => {
		it('drops the collected logs when clicked', async () => {
			useLogStore.setState({ logs: [{ id: 'log-1' }] as never, selectedLog: { id: 'log-1' } as never })

			render(<ClearButton />)
			fireEvent.click(screen.getByLabelText(t.header_clearLogs))

			// The store fades the table out first and empties it a moment later.
			expect(useLogStore.getState().isClearing).toBe(true)
			await waitFor(() => expect(useLogStore.getState().logs).toHaveLength(0))
			expect(useLogStore.getState().selectedLog).toBeUndefined()
			expect(useLogStore.getState().isClearing).toBe(false)
		})
	})

	describe('ThemeButton', () => {
		it('switches the scheme and the icon', () => {
			const { container } = render(<ThemeButton />)

			expect(container.querySelector('.moon')).not.toBeNull()

			fireEvent.click(screen.getByTitle('Dark theme'))

			expect(useGlobalStore.getState().scheme).toBe('dark')
		})

		it('offers the way back once dark is on', () => {
			useGlobalStore.setState({ scheme: 'dark' })

			const { container } = render(<ThemeButton />)

			expect(container.querySelector('.sun')).not.toBeNull()
			fireEvent.click(screen.getByTitle('White theme'))

			expect(useGlobalStore.getState().scheme).toBe('light')
		})
	})

	describe('DocsButton', () => {
		it('opens the public docs in a new tab without leaking the opener', () => {
			render(<DocsButton />)
			const link = screen.getByLabelText(t.docsTitle)

			expect(link.getAttribute('href')).toBe('https://github.com/ozontech/mockman#readme')
			expect(link.getAttribute('target')).toBe('_blank')
			// Without this a page opened by the panel could reach back through window.opener.
			expect(link.getAttribute('rel')).toBe('noreferrer')
		})
	})
})
