import { render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it } from 'vitest'

import { StatusBadge } from '@/panel/app/blocks/status-badge'

describe('StatusBadge', () => {
	it.each([200, 404, 500])('shows a real status as it is (%i)', (status) => {
		render(<StatusBadge value={status} />)

		expect(screen.getByText(String(status))).toBeInTheDocument()
	})

	it('shows a dash when no response arrived', () => {
		// The browser reports status 0 for a failed request, e.g. ERR_CONNECTION_REFUSED.
		render(<StatusBadge value={0} />)

		expect(screen.getByText('-')).toBeInTheDocument()
		expect(screen.queryByText('0')).toBeNull()
	})

	it.each([undefined, NaN])('shows a dash for a missing status (%s)', (value) => {
		render(<StatusBadge value={value} />)

		expect(screen.getByText('-')).toBeInTheDocument()
	})

	it('gives a failed request no success colouring', () => {
		const { container } = render(<StatusBadge value={0} />)
		const ok = render(<StatusBadge value={200} />)

		// 0 is below the 100..399 range, so it must not be painted like a successful response.
		expect(container.firstElementChild?.className)
			.not.toBe(ok.container.firstElementChild?.className)
	})
})
