import { parseTree, findNodeAtLocation } from 'jsonc-parser'

import { safeParseInt } from '@/services/number'

export type JsonPathSegment = string | number

export interface QuickFix {
	type: 'set-value'
	path: string
	value: unknown
	createParents?: boolean
}

function isRecordLike(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parsePathSegments(path: string): JsonPathSegment[] {
	const raw = String(path ?? '').trim()
	if (!raw || raw === '$') return []
	let index = raw.startsWith('$') ? 1 : 0
	const segments: JsonPathSegment[] = []

	while (index < raw.length) {
		const char = raw[index]
		if (char === '.') {
			index += 1
			const start = index
			while (index < raw.length && raw[index] !== '.' && raw[index] !== '[') index += 1
			const key = raw.slice(start, index)
			if (key) segments.push(key)
			continue
		}

		if (char === '[') {
			const close = raw.indexOf(']', index)
			if (close === -1) break
			const token = raw.slice(index + 1, close).trim()
			if (/^\d+$/.test(token)) {
				const parsed = safeParseInt(token)
				if (parsed != null) segments.push(parsed)
				index = close + 1
				continue
			}
			if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith('\'') && token.endsWith('\''))) {
				const quoted = token.startsWith('\'')
					? `"${token.slice(1, -1).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
					: token
				try {
					segments.push(JSON.parse(quoted) as string | number)
				} catch {
					segments.push(token.slice(1, -1))
				}
			}
			index = close + 1
			continue
		}

		index += 1
	}

	return segments
}

function findRangeByPathHeuristic(content: string, path: string): { from: number; to: number } {
	if (!content.length) return { from: 0, to: 0 }
	if (!path || path === '$') return { from: 0, to: Math.min(1, content.length) }

	const segments = parsePathSegments(path)
	if (!segments.length) return { from: 0, to: Math.min(1, content.length) }

	let searchFrom = 0
	let anchor = -1
	for (const segment of segments) {
		if (typeof segment !== 'string') continue
		const token = `"${segment.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
		const foundAt = content.indexOf(token, searchFrom)
		if (foundAt === -1) break
		anchor = foundAt
		searchFrom = foundAt + token.length
	}

	if (anchor < 0) {
		for (let i = segments.length - 1; i >= 0; i -= 1) {
			const segment = segments[i]
			if (typeof segment !== 'string') continue
			const token = `"${segment.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
			const foundAt = content.indexOf(token)
			if (foundAt !== -1) {
				anchor = foundAt
				break
			}
		}
	}

	if (anchor < 0) return { from: 0, to: Math.min(1, content.length) }

	const lineStart = content.lastIndexOf('\n', anchor) + 1
	const lineEndRaw = content.indexOf('\n', anchor)
	const lineEnd = lineEndRaw === -1 ? content.length : lineEndRaw
	return { from: lineStart, to: Math.max(lineStart + 1, lineEnd) }
}

function findRangeByPathAst(content: string, path: string): { from: number; to: number } | null {
	if (!content.length) return { from: 0, to: 0 }
	if (!path || path === '$') return { from: 0, to: Math.min(1, content.length) }

	const root = parseTree(content)
	if (!root) return null

	const segments = parsePathSegments(path)
	if (!segments.length) return { from: 0, to: Math.min(1, content.length) }

	let target = findNodeAtLocation(root, segments)
	if (!target && segments.length > 0) {
		const parent = findNodeAtLocation(root, segments.slice(0, -1)) as {
			type?: string
			offset: number
			length: number
		} | undefined
		if (parent && (parent.type === 'object' || parent.type === 'array')) {
			const fromPos = Math.max(0, Math.min(content.length, parent.offset))
			const toPosRaw = Math.max(fromPos + 1, Math.min(content.length, parent.offset + parent.length))
			const lineStart = content.lastIndexOf('\n', fromPos) + 1
			const lineEndRaw = content.indexOf('\n', toPosRaw)
			const lineEnd = lineEndRaw === -1 ? content.length : lineEndRaw
			return { from: lineStart, to: Math.max(lineStart + 1, lineEnd) }
		}
	}
	if (!target) {
		for (let size = segments.length - 1; size >= 0; size -= 1) {
			target = findNodeAtLocation(root, segments.slice(0, size))
			if (target) break
		}
	}

	if (!target) return null

	const from = Math.max(0, Math.min(content.length, target.offset))
	const to = Math.max(from + 1, Math.min(content.length, target.offset + target.length))
	return { from, to }
}

export function findRangeByPath(content: string, path: string): { from: number; to: number } {
	return findRangeByPathAst(content, path) ?? findRangeByPathHeuristic(content, path)
}

function setValueByPath(root: unknown, path: JsonPathSegment[], value: unknown, createParents: boolean): { ok: boolean; next: unknown } {
	if (path.length === 0) return { ok: true, next: value }

	if (!Array.isArray(root) && !isRecordLike(root)) {
		if (!createParents) return { ok: false, next: root }
		root = typeof path[0] === 'number' ? [] : {}
	}

	let current: unknown = root
	for (let index = 0; index < path.length - 1; index += 1) {
		const segment = path[index]
		const nextSegment = path[index + 1]

		if (typeof segment === 'number') {
			if (!Array.isArray(current)) return { ok: false, next: root }
			if (segment < 0) return { ok: false, next: root }
			let child = current[segment]
			if ((child == null || (!Array.isArray(child) && !isRecordLike(child))) && createParents) {
				child = typeof nextSegment === 'number' ? [] : {}
				current[segment] = child
			}
			if (child == null || (!Array.isArray(child) && !isRecordLike(child))) return { ok: false, next: root }
			current = child
			continue
		}

		if (!isRecordLike(current)) return { ok: false, next: root }
		let child = current[segment]
		if ((child == null || (!Array.isArray(child) && !isRecordLike(child))) && createParents) {
			child = typeof nextSegment === 'number' ? [] : {}
			current[segment] = child
		}
		if (child == null || (!Array.isArray(child) && !isRecordLike(child))) return { ok: false, next: root }
		current = child
	}

	const leaf = path[path.length - 1]
	if (typeof leaf === 'number') {
		if (!Array.isArray(current) || leaf < 0) return { ok: false, next: root }
		current[leaf] = value
		return { ok: true, next: root }
	}
	if (!isRecordLike(current)) return { ok: false, next: root }
	current[leaf] = value
	return { ok: true, next: root }
}

export function applyQuickFixToJson(content: string, quickFix: QuickFix): string | null {
	let root: unknown
	const trimmed = String(content ?? '').trim()
	if (!trimmed) {
		root = quickFix.path.startsWith('$[') ? [] : {}
	} else {
		try {
			root = JSON.parse(content)
		} catch {
			return null
		}
	}

	const segments = parsePathSegments(quickFix.path)
	const { ok, next } = setValueByPath(root, segments, quickFix.value, quickFix.createParents !== false)
	if (!ok) return null

	try {
		return JSON.stringify(next, null, 2)
	} catch {
		return null
	}
}
