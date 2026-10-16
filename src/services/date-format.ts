/** Short dates for table cells, with the full date and time for their tooltip. */

/** Anything before 2000 is a placeholder (tests and old imports use 1), not a real date. */
const EARLIEST_REAL = Date.UTC(2000, 0, 1)

export const isRealTimestamp = (value: unknown): value is number =>
	typeof value === 'number' && Number.isFinite(value) && value >= EARLIEST_REAL

/**
 * toLocale*String builds a new ICU formatter on every call: about 0.08 ms each, which made a
 * Logs render up to 300 rows on every new log. One formatter per locale and format.
 */
const formatters = new Map<string, Intl.DateTimeFormat>()

function formatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
	const key = `${locale}|${JSON.stringify(options)}`
	let cached = formatters.get(key)
	if (!cached) {
		cached = new Intl.DateTimeFormat(locale, options)
		formatters.set(key, cached)
	}
	return cached
}

const sameDay = (a: Date, b: Date): boolean =>
	a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

/**
 * This year: "7 Oct, 14:32"; today the time alone unless `dateToday` asks for the date too.
 * Another year: "14/03/2025, 10:07".
 */
export function formatMoment(
	timestamp: number,
	locale: string,
	options: { seconds?: boolean; dateToday?: boolean } = {},
	now: Date = new Date(),
): string {
	const date = new Date(timestamp)
	const time = formatter(locale, {
		hour: '2-digit',
		minute: '2-digit',
		...(options.seconds ? { second: '2-digit' } : {}),
	}).format(date)
	if (sameDay(date, now) && !options.dateToday) return time
	const day = date.getFullYear() === now.getFullYear()
		? formatter(locale, { day: 'numeric', month: 'short' }).format(date)
		: formatter(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
	return `${day}, ${time}`
}

export function formatFullMoment(timestamp: number, locale: string): string {
	return formatter(locale, { dateStyle: 'long', timeStyle: 'medium' }).format(new Date(timestamp))
}
