import { render, screen } from '@testing-library/react'
import React from 'react'
import { beforeEach, describe, expect, it } from 'vitest'

import { translations } from '@/panel/app/i18n/translations'
import { LogDetailsJson } from '@/panel/app/logs/logDetails/log-details-json'
import { useGlobalStore } from '@/panel/app/store'

const t = translations.en

describe('LogDetailsJson', () => {
	beforeEach(() => {
		useGlobalStore.setState({ lang: 'en', t: translations.en })
	})

	it('shows an error instead of a body that was too large to capture', () => {
		render(<LogDetailsJson isRequestPending={false} response="" tooLargeBytes={25 * 1024 * 1024} />)

		const message = screen.getByTestId('log-body-too-large')
		expect(message).toHaveTextContent(t.logDetail_bodyTooLargeTitle)
		expect(message).toHaveTextContent('25.0 MB')
		expect(message).toHaveTextContent('20.0 MB')
	})

	it('still shows the error when the size is unknown', () => {
		render(<LogDetailsJson isRequestPending={false} response="" tooLargeBytes={0} />)

		expect(screen.getByTestId('log-body-too-large')).toHaveTextContent(t.logDetail_bodyTooLarge('', '20.0 MB'))
	})

	it('shows the pending state while the request is in flight', () => {
		render(<LogDetailsJson isRequestPending response={undefined} />)

		expect(screen.getByText(t.logDetail_pending)).toBeInTheDocument()
	})

	it('says there is nothing to preview for an empty body', () => {
		render(<LogDetailsJson isRequestPending={false} response="" />)

		expect(screen.getByText(t.logDetail_nothingToPreview)).toBeInTheDocument()
		expect(screen.queryByTestId('log-body-too-large')).not.toBeInTheDocument()
	})
})
