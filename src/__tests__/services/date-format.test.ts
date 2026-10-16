import { describe, expect, it } from 'vitest'

import { formatFullMoment, formatMoment, isRealTimestamp } from '@/services/date-format'

const now = new Date(2026, 9, 8, 18, 0, 0)

describe('services/date-format', () => {
	it('shows only the time for today, with seconds when asked', () => {
		const today = new Date(2026, 9, 8, 14, 32, 5).getTime()
		expect(formatMoment(today, 'ru-RU', { seconds: true }, now)).toBe('14:32:05')
		expect(formatMoment(today, 'en-GB', {}, now)).toBe('14:32')
	})

	it('shows the date for today too when asked', () => {
		const today = new Date(2026, 9, 8, 9, 5).getTime()
		expect(formatMoment(today, 'ru-RU', { dateToday: true }, now)).toBe('8 окт., 09:05')
		expect(formatMoment(today, 'en-GB', { dateToday: true }, now)).toBe('8 Oct, 09:05')
	})

	it('adds the day for an earlier date, and the year only for another year', () => {
		const earlier = new Date(2026, 9, 7, 14, 32).getTime()
		const lastYear = new Date(2025, 0, 3, 8, 0).getTime()
		expect(formatMoment(earlier, 'en-GB', {}, now)).toBe('7 Oct, 14:32')
		expect(formatMoment(lastYear, 'en-GB', {}, now)).toBe('03/01/2025, 08:00')
		expect(formatMoment(lastYear, 'ru-RU', {}, now)).toBe('03.01.2025, 08:00')
	})

	it('gives the full date for the tooltip', () => {
		expect(formatFullMoment(new Date(2026, 9, 8, 14, 32, 5).getTime(), 'en-GB')).toBe('8 October 2026 at 14:32:05')
	})

	it('treats placeholder timestamps as no date', () => {
		expect(isRealTimestamp(1)).toBe(false)
		expect(isRealTimestamp(undefined)).toBe(false)
		expect(isRealTimestamp(now.getTime())).toBe(true)
	})
})
