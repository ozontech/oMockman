import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'

import { Show } from '../../panel/app/blocks/show'

describe('Show', () => {
	it('renders children when condition=true (boolean)', () => {
		const { container } = render(
			React.createElement(Show, { if: true, children: 'Content' }),
		)
		expect(container.textContent).toBe('Content')
	})

	it('renders nothing when condition=false (boolean)', () => {
		const { container } = render(
			React.createElement(Show, { if: false, children: 'Content' }),
		)
		expect(container.textContent).toBe('')
	})

	it('renders children when the if function returns true', () => {
		const { container } = render(
			React.createElement(Show, { if: () => true, children: 'Content' }),
		)
		expect(container.textContent).toBe('Content')
	})

	it('renders nothing when the if function returns false', () => {
		const { container } = render(
			React.createElement(Show, { if: () => false, children: 'Content' }),
		)
		expect(container.textContent).toBe('')
	})
})