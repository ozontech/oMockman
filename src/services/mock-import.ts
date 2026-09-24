import { safeNumberInt } from '@/services/number'
import { buildMockPayload } from '@/panel/app/mocks/addMock/utils'
import type { IMockResponse, IMockResponseRaw } from '@/interface/mock'
import type { ICollectionEntry, ICollectionNode, ICollectionTree } from '@/interface/collection'
import { MethodEnum } from '@/interface/network'
import { genId } from '@/services/helper'
import { MAX_BODY_BYTES, utf8ByteLength } from '@/services/body-limits'

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}

function optionalInt(value: unknown): number | undefined {
	if (value == null || value === '') return undefined
	return safeNumberInt(String(value)) ?? undefined
}

function isHeader(h: unknown): h is { name: string; value: string } {
	if (!isRecord(h)) return false
	return typeof h.name === 'string' && typeof h.value === 'string'
}

function coerceHeaders(headers: unknown): Array<{ name: string; value: string }> | undefined {
	if (!Array.isArray(headers)) return undefined
	return (headers as unknown[]).filter(isHeader)
}

export function coerceToRawMock(input: unknown): IMockResponseRaw | undefined {
	if (!isRecord(input)) return undefined

	const nameRaw = (typeof input.name !== 'undefined' && input.name !== null) ? String(input.name) : ''
	const nameTrim = nameRaw.trim()

	return {
		id: typeof input.id === 'string' ? input.id : undefined,
		name: nameTrim || undefined,
		description: typeof input.description === 'string' ? input.description : undefined,
		method: (typeof input.method === 'string' ? input.method : undefined) as never,
		url: typeof input.url === 'string' ? input.url : undefined,
		openApiUrl: typeof input.openApiUrl === 'string' ? input.openApiUrl : undefined,
		status: optionalInt(input.status),
		response: typeof input.response === 'string' ? input.response : (input.response != null ? JSON.stringify(input.response) : undefined),
		headers: coerceHeaders(input.headers),
		delay: optionalInt((input as Record<string, unknown>).delay),
		active: input.active !== false,
		createdOn: optionalInt(input.createdOn),
		dynamic: input.dynamic === true,
		collectionId:
			typeof input.collectionId === 'string'
				? input.collectionId
				: (input as Record<string, unknown>).collectionId === null
					? null
					: undefined,
	}
}

export type ImportStrategy = 'strict' | 'lenient'

export function queuedItemToRaw(next: Record<string, unknown> | undefined): IMockResponseRaw | undefined {
	if (!next) return undefined
	return coerceToRawMock(next)
}

function classifyMocksArray(
	arr: unknown[],
	strategy: ImportStrategy,
): { valid: IMockResponse[]; toFix: Array<Record<string, unknown>> } {
	const valid: IMockResponse[] = []
	const toFix: Array<Record<string, unknown>> = []

	for (const it of arr) {
		const raw = coerceToRawMock(it)
		if (!raw) continue

		if (strategy === 'strict') {
			const hasName = Boolean((raw.name ?? '').toString().trim())
			const hasUrl = typeof raw.url === 'string' && !!raw.url
			const hasStatus = typeof raw.status === 'number'

			if (!hasName || !hasUrl || !hasStatus) {
				if (isRecord(it)) toFix.push(it)
				continue
			}
		}

		const payload = buildMockPayload({
			...raw,
			id: raw.id ?? genId(),
			method: (raw.method as never) ?? (MethodEnum.GET as never),
		})

		valid.push(payload)
	}

	return { valid, toFix }
}

function coerceEntry(entry: unknown): ICollectionEntry | null {
	if (!isRecord(entry)) return null
	const type = entry.type === 'collection' || entry.type === 'mock' ? entry.type : null
	const id = typeof entry.id === 'string' && entry.id.trim() ? entry.id : null
	if (!type || !id) return null
	return { id, type }
}

function coerceNode(node: unknown, fallbackId?: string): ICollectionNode | null {
	if (!isRecord(node)) return null
	const id = typeof node.id === 'string' && node.id.trim() ? node.id : fallbackId
	if (!id) return null
	const name = typeof node.name === 'string' && node.name.trim() ? node.name : 'Collection'
	const parentId = typeof node.parentId === 'string' ? node.parentId : null
	const description = typeof node.description === 'string' ? node.description : undefined
	const entries = Array.isArray(node.entries)
		? (node.entries.map(coerceEntry).filter(Boolean) as ICollectionEntry[])
		: []
	return {
		id,
		name,
		parentId,
		active: node.active !== false,
		createdOn: typeof node.createdOn === 'number' ? node.createdOn : Date.now(),
		description,
		entries,
	}
}

function coerceCollectionTree(raw: unknown): ICollectionTree | null {
	if (!isRecord(raw)) return null
	const rawNodes = (raw as { nodes?: unknown }).nodes
	const nodes: Record<string, ICollectionNode> = {}
	if (rawNodes && typeof rawNodes === 'object') {
		for (const [id, node] of Object.entries(rawNodes as Record<string, unknown>)) {
			const next = coerceNode(node, id)
			if (next) nodes[next.id] = next
		}
	}
	const rawRoot = (raw as { root?: unknown }).root
	const rootArr = Array.isArray(rawRoot) ? rawRoot : []
	const root = rootArr.map(coerceEntry).filter(Boolean) as ICollectionEntry[]
	return { nodes, root }
}

export interface MockmanExportBundle {
	type: 'mockman.export'
	version: number
	mocks: IMockResponse[]
	collectionTree: ICollectionTree
}

function parseBundle(
	input: unknown,
	strategy: ImportStrategy,
): { bundle: MockmanExportBundle; toFix: Array<Record<string, unknown>> } | null {
	if (!isRecord(input)) return null
	const tree = coerceCollectionTree((input as { collectionTree?: unknown }).collectionTree)
	if (!tree) return null
	const mocksRaw = Array.isArray((input as { mocks?: unknown }).mocks)
		? (input as { mocks: unknown[] }).mocks
		: []
	const { valid, toFix } = classifyMocksArray(mocksRaw, strategy)
	const bundle: MockmanExportBundle = {
		type: 'mockman.export',
		version: typeof (input as { version?: unknown }).version === 'number'
			? (input as { version: number }).version
			: 1,
		mocks: valid,
		collectionTree: tree,
	}
	return { bundle, toFix }
}

export function classifyImport(
	input: unknown,
	options?: { strategy?: ImportStrategy },
): { valid: IMockResponse[]; toFix: Array<Record<string, unknown>>; package?: MockmanExportBundle } {
	const strategy: ImportStrategy = options?.strategy ?? 'strict'

	const parsedBundle = parseBundle(input, strategy)
	if (parsedBundle) {
		return {
			valid: parsedBundle.bundle.mocks,
			toFix: parsedBundle.toFix,
			package: parsedBundle.bundle,
		}
	}

	const arr: unknown[] = Array.isArray(input) ? input : [input]
	return classifyMocksArray(arr, strategy)
}

export const IMPORT_LIMITS = {
	maxSourceBytes: MAX_BODY_BYTES + 5 * 1024 * 1024,
	maxMocks: 500,
	maxResponseBytes: MAX_BODY_BYTES,
	maxCollectionNodes: 200,
	maxCollectionDepth: 10,
} as const

export type ImportRejectionCode =
	| 'source_too_large'
	| 'invalid_json'
	| 'nothing_to_import'
	| 'too_many_mocks'
	| 'response_too_large'
	| 'too_many_collections'
	| 'collection_too_deep'

export interface ImportRejection {
	code: ImportRejectionCode
	actual?: number
	limit?: number
}

export interface ImportSummary {
	mocks: number
	collections: number
	bytes: number
	preview: Array<{ method: string; url: string; status?: number; responseBytes: number }>
}

const PREVIEW_ROWS = 20

function countTreeDepth(tree: ICollectionTree): number {
	const depthOf = (id: string, seen: Set<string>): number => {
		if (seen.has(id)) return seen.size
		seen.add(id)
		const node = tree.nodes[id]
		const parentId = node?.parentId
		if (!parentId) return seen.size
		return depthOf(parentId, seen)
	}
	let max = 0
	for (const id of Object.keys(tree.nodes)) {
		max = Math.max(max, depthOf(id, new Set<string>()))
	}
	return max
}

export function parseImportSource(text: string): { ok: true; value: unknown } | { ok: false; rejection: ImportRejection } {
	const bytes = utf8ByteLength(text)
	if (bytes > IMPORT_LIMITS.maxSourceBytes) {
		return { ok: false, rejection: { code: 'source_too_large', actual: bytes, limit: IMPORT_LIMITS.maxSourceBytes } }
	}
	try {
		return { ok: true, value: JSON.parse(text) as unknown }
	} catch {
		return { ok: false, rejection: { code: 'invalid_json' } }
	}
}

export function checkImportLimits(result: {
	valid: IMockResponse[]
	toFix: Array<Record<string, unknown>>
	package?: MockmanExportBundle
}): ImportRejection | null {
	const total = result.valid.length + result.toFix.length
	if (total === 0) return { code: 'nothing_to_import' }
	if (total > IMPORT_LIMITS.maxMocks) {
		return { code: 'too_many_mocks', actual: total, limit: IMPORT_LIMITS.maxMocks }
	}

	for (const mock of result.valid) {
		const size = utf8ByteLength(String(mock.response ?? ''))
		if (size > IMPORT_LIMITS.maxResponseBytes) {
			return { code: 'response_too_large', actual: size, limit: IMPORT_LIMITS.maxResponseBytes }
		}
	}

	const tree = result.package?.collectionTree
	if (tree) {
		const nodes = Object.keys(tree.nodes).length
		if (nodes > IMPORT_LIMITS.maxCollectionNodes) {
			return { code: 'too_many_collections', actual: nodes, limit: IMPORT_LIMITS.maxCollectionNodes }
		}
		const depth = countTreeDepth(tree)
		if (depth > IMPORT_LIMITS.maxCollectionDepth) {
			return { code: 'collection_too_deep', actual: depth, limit: IMPORT_LIMITS.maxCollectionDepth }
		}
	}

	return null
}

export function summarizeImport(
	result: { valid: IMockResponse[]; toFix: Array<Record<string, unknown>>; package?: MockmanExportBundle },
	sourceBytes: number,
): ImportSummary {
	const rows = [
		...result.valid.map((mock) => ({
			method: String(mock.method ?? ''),
			url: String(mock.url ?? ''),
			status: mock.status,
			responseBytes: utf8ByteLength(String(mock.response ?? '')),
		})),
		...result.toFix.map((raw) => ({
			method: String((raw as { method?: unknown }).method ?? ''),
			url: String((raw as { url?: unknown }).url ?? ''),
			status: typeof (raw as { status?: unknown }).status === 'number'
				? (raw as { status: number }).status
				: undefined,
			responseBytes: utf8ByteLength(String((raw as { response?: unknown }).response ?? '')),
		})),
	]

	return {
		mocks: result.valid.length + result.toFix.length,
		collections: result.package ? Object.keys(result.package.collectionTree.nodes).length : 0,
		bytes: sourceBytes,
		preview: rows.slice(0, PREVIEW_ROWS),
	}
}
