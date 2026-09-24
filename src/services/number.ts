/** Number parsing that returns null instead of NaN or an unsafe integer. */

export const safeNumberInt = (value: number | string | bigint | boolean): number | null => {
	const num = Number(value)
	return Number.isSafeInteger(num) ? num : null
}

export const safeNumberFloat = (value: number | string | bigint | boolean): number | null => {
	const num = Number(value)
	return Number.isNaN(num) ? null : num
}

export const safeParseInt = (value: string, radix = 10): number | null => {
	const num = parseInt(value, radix)
	return Number.isSafeInteger(num) ? num : null
}

export const safeParseFloat = (value: string): number | null => {
	const num = parseFloat(value)
	return Number.isNaN(num) ? null : num
}
