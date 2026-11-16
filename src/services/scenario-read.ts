import { credentialValue, redactJson, sensitiveField } from './redaction'

import type { IStore } from '@/interface/mock'
import type { ScenarioBundle } from '@mockman/automation-protocol'

const hidden = '[REDACTED]'

/** Explicit DTO only: never serialize the library, AI settings or executable mock fields. */
export function readScenario(store: IStore, collectionId: string, origin: string) {
	const node = store.collectionTree.nodes[collectionId]
	if (!node?.automation || node.automation.origin !== origin) throw new Error('ACCESS_DENIED')
	const redactedFields: string[] = []
	const unsupported = new Set<string>()
	const mask = (path: string) => {
		redactedFields.push(path)
		return hidden
	}
	const text = (value: string, path: string) => (credentialValue.test(value) ? mask(path) : value)
	const url = (value: string, path: string) => {
		try {
			const parsed = new URL(value)
			if (
				!['http:', 'https:'].includes(parsed.protocol) ||
				parsed.username ||
				parsed.password ||
				parsed.search ||
				parsed.hash
			)
				return mask(path)
			return text(value, path)
		} catch {
			return mask(path)
		}
	}
	const body = (value: string, path: string): string => {
		try {
			const parsed = JSON.parse(value)
			const before = redactedFields.length
			const cleaned = redactJson(parsed, path, mask, 50)
			return redactedFields.length === before ? value : JSON.stringify(cleaned)
		} catch {
			return value === '' ? '' : mask(path)
		}
	}
	const mockKeys = new Map(Object.entries(node.automation.mockIds).map(([key, id]) => [id, key]))
	const ruleKeys = new Map(Object.entries(node.automation.ruleIds).map(([key, id]) => [id, key]))
	const mocks: ScenarioBundle['mocks'] = []
	for (const [key, id] of Object.entries(node.automation.mockIds)) {
		const mock = store.mocks.find((item) => item.id === id && item.collectionId === collectionId)
		if (!mock) {
			unsupported.add('MISSING_OR_MOVED_MOCK')
			continue
		}
		if (
			mock.action ||
			mock.requestPatch ||
			(mock.apply &&
				(!mock.apply.responseBody || !mock.apply.responseHeaders || mock.apply.requestBody))
		)
			unsupported.add('MOCK_MODE')
		const path = `/mocks/${mocks.length}`
		mocks.push({
			key,
			...(mock.active ? {} : { enabled: false }),
			...(mock.priority === undefined ? {} : { priority: mock.priority }),
			...(mock.when
				? {
						when: {
							...(redactJson(
								mock.when,
								`${path}/when`,
								mask,
								32,
							) as ScenarioBundle['mocks'][number]['when']),
							...(mock.when.body
								? {
										body: mock.when.body.map((condition, index) => ({
											path: condition.path,
											equals: condition.path.some((key) => sensitiveField.test(key))
												? mask(`${path}/when/body/${index}/equals`)
												: redactJson(
														condition.equals,
														`${path}/when/body/${index}/equals`,
														mask,
														32,
												  ),
										})),
								  }
								: {}),
						},
				  }
				: {}),
			method: mock.method as ScenarioBundle['mocks'][number]['method'],
			url: url(mock.url, `${path}/url`),
			...(mock.name === undefined ? {} : { name: text(mock.name, `${path}/name`) }),
			response: {
				status: mock.status,
				body: body(mock.response ?? '', `${path}/response/body`),
				headers: (mock.headers ?? []).map((header, index) => ({
					name: header.name,
					value: sensitiveField.test(header.name)
						? mask(`${path}/response/headers/${index}/value`)
						: text(header.value, `${path}/response/headers/${index}/value`),
				})),
				...(mock.delay === undefined ? {} : { delayMs: mock.delay }),
			},
		})
	}
	const rules: ScenarioBundle['scenario']['rules'] = []
	for (const rule of node.scenario?.rules ?? []) {
		const key = ruleKeys.get(rule.id)
		const mockKey = 'mockId' in rule.respond ? mockKeys.get(rule.respond.mockId) : undefined
		if (!key || ('mockId' in rule.respond && !mockKey)) {
			unsupported.add('MANUAL_RULE')
			continue
		}
		rules.push({
			key,
			method: rule.method as ScenarioBundle['scenario']['rules'][number]['method'],
			url: url(rule.url, `/scenario/rules/${rules.length}/url`),
			respond: mockKey ? { mockKey } : { network: true },
		})
	}
	const parent = store.collectionTree.nodes[node.parentId ?? '']
	const bundle: ScenarioBundle = {
		...(parent?.task
			? {
					task: {
						key: parent.task.key,
						name: text(parent.name.replace(`${parent.task.key} — `, ''), '/task/name'),
					},
			  }
			: {}),
		scenarioKey: node.automation.scenarioKey,
		collection: { name: text(node.name, '/collection/name') },
		mocks,
		scenario: { enabled: node.scenario?.enabled ?? false, rules },
	}
	return {
		kind: 'scenario' as const,
		collectionId,
		libraryRevision: store.revision ?? 0,
		active: node.active,
		ruleOrder: (node.scenario?.rules ?? []).map((rule) => rule.id),
		bundle,
		redacted: redactedFields.length > 0,
		redactedFields,
		unsupported: [...unsupported],
		manualMockCount: store.mocks.filter(
			(mock) => mock.collectionId === collectionId && !mockKeys.has(mock.id),
		).length,
		canApplyBundle: !node.active && !redactedFields.length && !unsupported.size,
	}
}
