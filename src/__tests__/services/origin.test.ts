import { describe, expect, it } from 'vitest'

import type { IStore } from '@/interface/mock'
import {
	canonicalOrigin,
	grantSitePermission,
	hasAnyPermission,
	normalizeSitePermissions,
	revokeSitePermission,
} from '@/services/origin'

const makeStore = (overrides: Partial<IStore> = {}): IStore => ({
	active: true,
	mocks: [],
	collectionTree: { root: [], nodes: {} },
	...overrides,
} as unknown as IStore)

describe('canonicalOrigin', () => {
	it.each([
		['https://site.ru/path?q=1#hash', 'https://site.ru'],
		['https://SITE.ru', 'https://site.ru'],
		['https://site.ru:443/', 'https://site.ru'],
		['http://site.ru:80', 'http://site.ru'],
		['https://site.ru:8443', 'https://site.ru:8443'],
	])('reduces %s to %s', (input, expected) => {
		expect(canonicalOrigin(input)).toBe(expected)
	})

	it.each(['about:blank', 'chrome://extensions', 'file:///etc/hosts', 'not a url', '', null, undefined])(
		'refuses %s',
		(input) => {
			expect(canonicalOrigin(input)).toBeNull()
		},
	)

	it('keeps scheme and port apart', () => {
		// The whole point of an origin: these are three different sites.
		expect(canonicalOrigin('https://site.ru')).not.toBe(canonicalOrigin('http://site.ru'))
		expect(canonicalOrigin('https://site.ru')).not.toBe(canonicalOrigin('https://site.ru:8443'))
	})
})

describe('hasAnyPermission', () => {
	it('is false for an origin that was never granted anything', () => {
		expect(hasAnyPermission(makeStore(), 'https://site.ru')).toBe(false)
	})

	it('is true once the origin is granted', () => {
		const store = grantSitePermission(makeStore(), 'https://site.ru')

		expect(hasAnyPermission(store, 'https://site.ru')).toBe(true)
	})

	it('does not answer for a different scheme or port', () => {
		const store = grantSitePermission(makeStore(), 'https://site.ru')

		expect(hasAnyPermission(store, 'http://site.ru')).toBe(false)
		expect(hasAnyPermission(store, 'https://site.ru:8443')).toBe(false)
	})

	it('is false for a page that cannot be mocked at all', () => {
		const store = makeStore({ autoGrantSites: true })

		expect(hasAnyPermission(store, 'about:blank')).toBe(false)
		expect(hasAnyPermission(store, null)).toBe(false)
	})

	describe('auto-grant', () => {
		it('allows any mockable origin when the user turned it on', () => {
			const store = makeStore({ autoGrantSites: true })

			expect(hasAnyPermission(store, 'https://never-seen.ru')).toBe(true)
		})

		it('stays off unless the flag is exactly true', () => {
			// Opt-in: anything short of `true` keeps every site closed.
			for (const value of [undefined, false, null, 0, '', 'yes']) {
				const store = makeStore({ autoGrantSites: value } as unknown as Partial<IStore>)
				expect(hasAnyPermission(store, 'https://site.ru')).toBe(false)
			}
		})
	})
})

describe('grantSitePermission', () => {
	it('stores the permission under the canonical origin', () => {
		const store = grantSitePermission(makeStore(), 'https://SITE.ru:443/path')

		expect(Object.keys(store.sitePermissions ?? {})).toEqual(['https://site.ru'])
	})

	it('ignores an origin it cannot canonicalise', () => {
		const store = makeStore()

		expect(grantSitePermission(store, 'about:blank')).toBe(store)
	})

	it('leaves existing grants alone', () => {
		let store = grantSitePermission(makeStore(), 'https://site.ru')
		store = grantSitePermission(store, 'https://other.ru')

		expect(Object.keys(store.sitePermissions ?? {}).sort()).toEqual(['https://other.ru', 'https://site.ru'])
	})
})

describe('revokeSitePermission', () => {
	it('removes the origin', () => {
		const granted = grantSitePermission(makeStore(), 'https://site.ru')

		const revoked = revokeSitePermission(granted, 'https://site.ru')

		expect(revoked.sitePermissions?.['https://site.ru']).toBeUndefined()
	})

	it('leaves other origins alone', () => {
		let store = grantSitePermission(makeStore(), 'https://site.ru')
		store = grantSitePermission(store, 'https://other.ru')

		const revoked = revokeSitePermission(store, 'https://site.ru')

		expect(Object.keys(revoked.sitePermissions ?? {})).toEqual(['https://other.ru'])
	})
})

describe('normalizeSitePermissions', () => {
	it('gives an empty map when nothing is stored', () => {
		expect(normalizeSitePermissions(makeStore()).sitePermissions).toEqual({})
	})

	it('drops origins it cannot canonicalise', () => {
		const store = makeStore({
			sitePermissions: {
				'https://site.ru': { grantedOn: 1 },
				'about:blank': { grantedOn: 1 },
				'not a url': { grantedOn: 1 },
			},
		} as unknown as Partial<IStore>)

		expect(Object.keys(normalizeSitePermissions(store).sitePermissions ?? {})).toEqual(['https://site.ru'])
	})

	it('canonicalises a hand-written origin', () => {
		const store = makeStore({
			sitePermissions: { 'https://SITE.ru:443': { grantedOn: 7 } },
		} as unknown as Partial<IStore>)

		const result = normalizeSitePermissions(store).sitePermissions ?? {}

		expect(result['https://site.ru']).toEqual({ grantedOn: 7 })
	})
})
