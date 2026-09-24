import { describe, expect, it } from 'vitest'

import type { Translations } from '@/panel/app/i18n/translations'
import { translations } from '@/panel/app/i18n/translations'

describe('translations', () => {
	const locales = Object.keys(translations) as Array<keyof typeof translations>

	it('ships English and Russian', () => {
		expect(locales.sort()).toEqual(['en', 'ru'])
	})

	it('has the same keys in every locale', () => {
		const en = Object.keys(translations.en).sort()
		const ru = Object.keys(translations.ru).sort()
		expect(ru).toEqual(en)
	})

	it('has the same value kinds in every locale', () => {
		for (const key of Object.keys(translations.en) as Array<keyof Translations>) {
			expect(typeof translations.ru[key]).toBe(typeof translations.en[key])
		}
	})

	it('has no empty strings', () => {
		for (const locale of locales) {
			for (const [key, value] of Object.entries(translations[locale])) {
				if (typeof value === 'string') {
					expect(value.trim(), `${locale}.${key}`).not.toBe('')
				}
			}
		}
	})

	it('renders every template function in both locales', () => {
		for (const locale of locales) {
			for (const [key, value] of Object.entries(translations[locale])) {
				if (typeof value !== 'function') continue
				const rendered = (value as (...args: unknown[]) => string)('x', 'y')
				expect(typeof rendered, `${locale}.${key}`).toBe('string')
			}
		}
	})

	it('keeps the generation phrase lists non-empty', () => {
		for (const locale of locales) {
			expect(translations[locale].ai_phrase_generating.length).toBeGreaterThan(0)
			expect(translations[locale].ai_phrase_retrying.length).toBeGreaterThan(0)
		}
	})

	it('keeps import placeholders in both locales', () => {
		for (const locale of locales) {
			expect(translations[locale].import_confirmSummary).toContain('{mocks}')
			expect(translations[locale].import_confirmSummary).toContain('{collections}')
			expect(translations[locale].import_confirmSummary).toContain('{size}')
			expect(translations[locale].import_confirmTruncated).toContain('{rest}')
		}
	})
})
