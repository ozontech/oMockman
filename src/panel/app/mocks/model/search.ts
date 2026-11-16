import type { IMockResponse } from '@/interface/mock'

export function createSearchMatcher(query: string): (mock: IMockResponse) => boolean {
	const search = query.trim().toLowerCase()

	return (mock) => !search || (
		(mock.name ?? '').toLowerCase().includes(search) ||
		(mock.url ?? '').toLowerCase().includes(search) ||
		(mock.method ?? '').toLowerCase().includes(search) ||
		String(mock.status ?? '').includes(search)
	)
}
