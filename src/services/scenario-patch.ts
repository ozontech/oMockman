import { isScenarioUrl } from './scenario-url'

import type { IStore } from '@/interface/mock'

export type BodyFieldPatch = { mockKey: string; path: string[] } & (
	| { valueJson: string }
	| { remove: true }
)
export type HeaderPatch = { mockKey: string; name: string } & ({ value: string } | { remove: true })
export type RuleResponsePatch = { ruleId: string; respond: { mockKey: string } | { network: true } }
export interface ScenarioPatch {
	mockStates?: Array<{ mockKey: string; enabled: boolean; priority?: number }>
	ruleResponses?: RuleResponsePatch[]
	scenarioEnabled?: boolean
	ruleOrder?: string[]
	name?: string
	delays?: Array<{ mockKey: string; delayMs: number }>
	bodyFields?: BodyFieldPatch[]
	headers?: HeaderPatch[]
}
const record = (value: unknown): value is Record<string, unknown> =>
	!!value && typeof value === 'object' && !Array.isArray(value)
export function assertScenarioPatch(value: unknown): asserts value is ScenarioPatch {
	if (
		!record(value) ||
		!Object.keys(value).length ||
		Object.keys(value).some(
			(key) =>
				![
					'mockStates',
					'name',
					'delays',
					'bodyFields',
					'headers',
					'scenarioEnabled',
					'ruleOrder',
					'ruleResponses',
				].includes(key),
		)
	)
		throw new Error('INVALID_ARGUMENTS')
	if ('mockStates' in value) {
		if (
			!Array.isArray(value.mockStates) ||
			!value.mockStates.length ||
			value.mockStates.length > 500
		)
			throw new Error('INVALID_ARGUMENTS')
		const keys = new Set<string>()
		for (const change of value.mockStates) {
			if (
				!record(change) ||
				Object.keys(change).some((key) => !['mockKey', 'enabled', 'priority'].includes(key)) ||
				typeof change.mockKey !== 'string' ||
				!change.mockKey ||
				typeof change.enabled !== 'boolean' ||
				(change.priority !== undefined &&
					(!Number.isInteger(change.priority) || Math.abs(Number(change.priority)) > 10000)) ||
				keys.has(change.mockKey)
			)
				throw new Error('INVALID_ARGUMENTS')
			keys.add(change.mockKey)
		}
	}
	if ('ruleResponses' in value) {
		if (
			!Array.isArray(value.ruleResponses) ||
			!value.ruleResponses.length ||
			value.ruleResponses.length > 1000
		)
			throw new Error('INVALID_ARGUMENTS')
		const ids = new Set<string>()
		for (const item of value.ruleResponses) {
			if (
				!record(item) ||
				Object.keys(item).length !== 2 ||
				typeof item.ruleId !== 'string' ||
				!item.ruleId ||
				item.ruleId.length > 128 ||
				!record(item.respond) ||
				Object.keys(item.respond).length !== 1 ||
				!(
					item.respond.network === true ||
					(typeof item.respond.mockKey === 'string' &&
						item.respond.mockKey.length > 0 &&
						item.respond.mockKey.length <= 128)
				) ||
				ids.has(item.ruleId)
			)
				throw new Error('INVALID_ARGUMENTS')
			ids.add(item.ruleId)
		}
	}
	if ('scenarioEnabled' in value && typeof value.scenarioEnabled !== 'boolean')
		throw new Error('INVALID_ARGUMENTS')
	if (
		'ruleOrder' in value &&
		(!Array.isArray(value.ruleOrder) ||
			value.ruleOrder.length > 1000 ||
			value.ruleOrder.some((id) => typeof id !== 'string' || !id || id.length > 128) ||
			new Set(value.ruleOrder).size !== value.ruleOrder.length)
	)
		throw new Error('INVALID_ARGUMENTS')
	if (
		'name' in value &&
		(typeof value.name !== 'string' || !value.name.trim() || value.name.length > 200)
	)
		throw new Error('INVALID_ARGUMENTS')
	if ('delays' in value) {
		if (!Array.isArray(value.delays) || !value.delays.length || value.delays.length > 1000)
			throw new Error('INVALID_ARGUMENTS')
		const keys = new Set<string>()
		for (const item of value.delays) {
			if (
				!record(item) ||
				Object.keys(item).length !== 2 ||
				typeof item.mockKey !== 'string' ||
				!item.mockKey ||
				item.mockKey.length > 128 ||
				!Number.isInteger(item.delayMs) ||
				Number(item.delayMs) < 0 ||
				Number(item.delayMs) > 60000 ||
				keys.has(item.mockKey)
			)
				throw new Error('INVALID_ARGUMENTS')
			keys.add(item.mockKey)
		}
	}

	if ('headers' in value) {
		if (!Array.isArray(value.headers) || !value.headers.length || value.headers.length > 100)
			throw new Error('INVALID_ARGUMENTS')
		const seen = new Set<string>()
		for (const item of value.headers) {
			if (
				!record(item) ||
				Object.keys(item).length !== 3 ||
				typeof item.mockKey !== 'string' ||
				!item.mockKey ||
				item.mockKey.length > 128 ||
				typeof item.name !== 'string' ||
				item.name.length > 256 ||
				!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(item.name) ||
				!(
					item.remove === true ||
					(typeof item.value === 'string' &&
						item.value.length <= 8192 &&
						[...item.value].every(
							(char) => char === '\t' || (char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127),
						))
				)
			)
				throw new Error('INVALID_ARGUMENTS')
			const key = JSON.stringify([item.mockKey, item.name.toLowerCase()])
			if (seen.has(key)) throw new Error('INVALID_ARGUMENTS')
			seen.add(key)
		}
	}
	if ('bodyFields' in value) {
		if (
			!Array.isArray(value.bodyFields) ||
			!value.bodyFields.length ||
			value.bodyFields.length > 100
		)
			throw new Error('INVALID_ARGUMENTS')
		const seen: Array<{ mockKey: string; path: string[] }> = []
		for (const item of value.bodyFields) {
			if (
				!record(item) ||
				typeof item.mockKey !== 'string' ||
				!item.mockKey ||
				item.mockKey.length > 128 ||
				!Array.isArray(item.path) ||
				!item.path.length ||
				item.path.length > 32 ||
				item.path.some(
					(part) =>
						typeof part !== 'string' ||
						!part.length ||
						part.length > 256 ||
						['__proto__', 'prototype', 'constructor'].includes(part),
				) ||
				Object.keys(item).length !== 3 ||
				!(item.remove === true || typeof item.valueJson === 'string')
			)
				throw new Error('INVALID_ARGUMENTS')
			if ('valueJson' in item) parseBodyJson(item.valueJson as string)
			const path = item.path as string[]
			if (
				seen.some(
					(entry) =>
						entry.mockKey === item.mockKey &&
						entry.path
							.slice(0, Math.min(entry.path.length, path.length))
							.every((part, index) => part === path[index]),
				)
			)
				throw new Error('INVALID_ARGUMENTS')
			seen.push({ mockKey: item.mockKey, path })
		}
	}
}

function parseBodyJson(value: string): unknown {
	if (new TextEncoder().encode(value).length > 1024 * 1024) throw new Error('LIMIT_EXCEEDED')
	try {
		return JSON.parse(value, (_key, item: unknown) => {
			if (
				typeof item === 'number' &&
				(!Number.isFinite(item) || (Number.isInteger(item) && !Number.isSafeInteger(item)))
			)
				throw new Error('unsafe number')
			return item
		}) as unknown
	} catch {
		throw new Error('INVALID_ARGUMENTS')
	}
}

function updateField(root: unknown, change: BodyFieldPatch) {
	let parent = root
	for (const part of change.path.slice(0, -1)) {
		if ((!record(parent) && !Array.isArray(parent)) || !Object.hasOwn(parent, part))
			throw new Error('INVALID_SCENARIO')
		parent = (parent as Record<string, unknown>)[part]
	}
	const key = change.path[change.path.length - 1]
	if (!record(parent) && !Array.isArray(parent)) throw new Error('INVALID_SCENARIO')
	if (Array.isArray(parent)) {
		// Array removals shift later positions: require replacing the array explicitly instead.
		if (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= parent.length || 'remove' in change)
			throw new Error('INVALID_SCENARIO')
		parent[Number(key)] = parseBodyJson(change.valueJson)
	} else if ('remove' in change) {
		if (!Object.hasOwn(parent, key)) throw new Error('INVALID_SCENARIO')
		delete parent[key]
	} else parent[key] = parseBodyJson(change.valueJson)
}

/** Change only explicitly named fields. Untouched bodies, headers and manual rules remain intact; edited JSON is reserialized. */
export function patchScenario(
	raw: Partial<IStore>,
	collectionId: string,
	patch: ScenarioPatch,
	origin: string,
) {
	assertScenarioPatch(patch)
	const store = structuredClone(raw) as IStore
	const node = store.collectionTree?.nodes[collectionId]
	if (!node?.automation || node.automation.origin !== origin) throw new Error('ACCESS_DENIED')
	if (node.active) throw new Error('SCENARIO_ACTIVE')
	const automation = node.automation
	const managedMock = (key: string) => {
		if (!Object.hasOwn(automation.mockIds, key)) throw new Error('INVALID_SCENARIO')
		const mock = store.mocks.find(
			(item) => item.id === automation.mockIds[key] && item.collectionId === collectionId,
		)
		if (!mock) throw new Error('INVALID_SCENARIO')
		if (!isScenarioUrl(mock.url)) throw new Error('INVALID_SCENARIO')
		return mock
	}

	if (patch.scenarioEnabled !== undefined || patch.ruleOrder !== undefined) {
		if (!node.scenario) throw new Error('INVALID_SCENARIO')
		if (patch.ruleOrder !== undefined) {
			const rules = new Map(node.scenario.rules.map((rule) => [rule.id, rule]))
			if (
				rules.size !== node.scenario.rules.length ||
				patch.ruleOrder.length !== rules.size ||
				patch.ruleOrder.some((id) => !rules.has(id))
			)
				throw new Error('INVALID_SCENARIO')
			node.scenario.rules = patch.ruleOrder.map((id) => {
				const rule = rules.get(id)
				if (!rule) throw new Error('INVALID_SCENARIO')
				return rule
			})
		}
		if (patch.scenarioEnabled !== undefined) node.scenario.enabled = patch.scenarioEnabled
	}
	for (const change of patch.ruleResponses ?? []) {
		const rules = node.scenario?.rules.filter((rule) => rule.id === change.ruleId) ?? []
		if (rules.length !== 1) throw new Error('INVALID_SCENARIO')
		const rule = rules[0]
		if (!isScenarioUrl(rule.url)) throw new Error('INVALID_SCENARIO')
		if ('network' in change.respond) rule.respond = { network: true }
		else {
			const mock = managedMock(change.respond.mockKey)
			rule.respond = { mockId: mock.id }
		}
	}
	for (const change of patch.mockStates ?? []) {
		const mock = managedMock(change.mockKey)
		mock.active = change.enabled
		if (change.priority !== undefined) mock.priority = change.priority
	}
	if (patch.name !== undefined) node.name = patch.name
	for (const change of patch.delays ?? []) {
		const mock = managedMock(change.mockKey)
		mock.delay = change.delayMs
	}
	for (const change of patch.headers ?? []) {
		const mock = managedMock(change.mockKey)
		const name = change.name.toLowerCase()
		const headers = mock.headers ?? []
		const first = headers.findIndex((header) => header.name.toLowerCase() === name)
		const remaining = headers.filter((header) => header.name.toLowerCase() !== name)
		// A named edit explicitly replaces/removes all occurrences; unrelated duplicates are preserved.
		if ('value' in change)
			remaining.splice(first < 0 ? remaining.length : first, 0, {
				name: change.name,
				value: change.value,
			})
		if (remaining.length > 100) throw new Error('LIMIT_EXCEEDED')
		mock.headers = remaining
	}
	const bodies = new Map<string, unknown>()
	for (const change of patch.bodyFields ?? []) {
		const mock = managedMock(change.mockKey)
		if ([204, 205, 304].includes(mock.status)) throw new Error('INVALID_SCENARIO')
		if (!bodies.has(mock.id)) bodies.set(mock.id, parseBodyJson(mock.response ?? ''))
		const body = bodies.get(mock.id)
		updateField(body, change)
		const encoded = JSON.stringify(body)
		if (encoded === undefined || new TextEncoder().encode(encoded).length > 1024 * 1024)
			throw new Error('LIMIT_EXCEEDED')
		mock.response = encoded
	}
	return {
		store,
		result: { collectionId, mockIds: node.automation.mockIds, ruleIds: node.automation.ruleIds },
	}
}
