import React, { useMemo } from 'react'
import { Button, Checkbox, Dropdown, Icon, Popup } from 'semantic-ui-react'
import type { DropdownItemProps } from 'semantic-ui-react'

import s from './scenario-editor.module.scss'

import { useGlobalStore } from '@/panel/app/store'
import type { ICollectionScenario, IScenarioRule } from '@/interface/collection'
import type { IMockResponse } from '@/interface/mock'
import { genId } from '@/services/helper'
import {
	createScenario,
	endpointKey,
	mocksOfEndpoint,
	normalizeRules,
	parseEndpoint,
} from '@/panel/app/mocks/model/scenario'

const NETWORK = '__network__'

const shortUrl = (url: string): string => {
	try {
		const parsed = new URL(url)
		return `${parsed.pathname}${parsed.search}`
	} catch {
		return url
	}
}

const endpointText = (method: string, url: string): string => `${method.toUpperCase()} ${shortUrl(url)}`

interface ScenarioEditorProps {
	scenario: ICollectionScenario | undefined
	onChange: (next: ICollectionScenario) => void
	/** The mocks of the collection and its subcollections: what rules can answer with. */
	mocks: IMockResponse[]
	isDark: boolean
	onReset?: () => void
}

const HeaderHint: React.FC<{ label: string; hint: string }> = ({ label, hint }) => (
	<Popup
		content={hint}
		position="top center"
		size="small"
		mouseEnterDelay={250}
		trigger={<span className={s.headerHint} data-testid="scenario-column-hint">{label}</span>}
	/>
)

const RulesHead: React.FC = () => {
	const t = useGlobalStore((st) => st.t)
	return (
		<thead>
			<tr>
				<th className={s.number}><HeaderHint label={t.sc_colCall} hint={t.sc_callHint} /></th>
				<th><HeaderHint label={t.sc_colRequest} hint={t.sc_requestHint} /></th>
				<th className={s.center}><HeaderHint label={t.sc_colRespond} hint={t.sc_respondHint} /></th>
				<th />
			</tr>
		</thead>
	)
}

/** The scenario of a collection: the Nth rule of an endpoint answers its Nth call, the last one repeats. */
export const ScenarioEditor: React.FC<ScenarioEditorProps> = ({ scenario: saved, onChange, mocks, isDark, onReset }) => {
	const t = useGlobalStore((st) => st.t)

	const endpoints = useMemo(() => {
		const seen = new Map<string, { method: string; url: string }>()
		for (const mock of mocks) seen.set(endpointKey(String(mock.method), mock.url), { method: String(mock.method).toUpperCase(), url: mock.url })
		return seen
	}, [mocks])

	const scenario = useMemo(() => normalizeRules(saved ?? { ...createScenario(), enabled: false }), [saved])

	const endpointOptions = (current: string): DropdownItemProps[] => {
		const options: DropdownItemProps[] = Array.from(endpoints.entries()).map(([key, { method, url }]) => ({
			key, value: key, text: endpointText(method, url), title: `${method} ${url}`,
		}))
		if (!endpoints.has(current)) {
			const { method, url } = parseEndpoint(current)
			options.push({ key: current, value: current, text: endpointText(method, url), title: current })
		}
		return options
	}

	const mockOption = (mock: IMockResponse): DropdownItemProps => ({
		key: mock.id,
		value: mock.id,
		text: `${mock.name || shortUrl(mock.url)} · ${mock.status ?? 200}${mock.active ? '' : ` (${t.sc_mockOff})`}`,
	})

	const rootClass = `${s.editor} ${isDark ? s.dark : ''}`

	/** The first rule of a scenario turns it on: rules nobody asked to switch on would be a puzzle. */
	const setRules = (rules: IScenarioRule[]) =>
		onChange(normalizeRules({ ...scenario, enabled: scenario.enabled || scenario.rules.length === 0, rules }))
	const updateRule = (id: string, patch: Partial<IScenarioRule>) =>
		setRules(scenario.rules.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)))
	/** A rule that moves to another endpoint becomes its last call. */
	const changeEndpoint = (rule: IScenarioRule, value: string) => {
		const { method, url } = parseEndpoint(value)
		const sameEndpointMock = mocksOfEndpoint(mocks, method, url)[0]
		const moved: IScenarioRule = {
			...rule,
			method,
			url,
			respond: 'mockId' in rule.respond && sameEndpointMock ? { mockId: sameEndpointMock.id } : rule.respond,
		}
		setRules([...scenario.rules.filter((other) => other.id !== rule.id), moved])
	}
	const sameEndpoint = (a?: IScenarioRule, b?: IScenarioRule): boolean =>
		Boolean(a && b) && endpointKey((a as IScenarioRule).method, (a as IScenarioRule).url) === endpointKey((b as IScenarioRule).method, (b as IScenarioRule).url)
	const moveRule = (index: number, delta: number) => {
		if (!sameEndpoint(scenario.rules[index], scenario.rules[index + delta])) return
		const rules = [...scenario.rules]
		;[rules[index], rules[index + delta]] = [rules[index + delta], rules[index]]
		setRules(rules)
	}

	/** A new rule picks up where the last one left off: the same endpoint, the next call. */
	const addRule = () => {
		const last = scenario.rules[scenario.rules.length - 1]
		const [first] = endpoints.values()
		const method = last?.method ?? first?.method ?? 'GET'
		const url = last?.url ?? first?.url ?? ''
		const firstMock = mocksOfEndpoint(mocks, method, url)[0]
		setRules([...scenario.rules, {
			id: genId(),
			method,
			url,
			respond: firstMock ? { mockId: firstMock.id } : { network: true },
		}])
	}

	const addRuleButton = (
		<Button type="button" size="small" basic inverted={isDark} onClick={addRule} className={s.addButton} data-testid="scenario-add-rule">
			<Icon name="add" />
			{t.sc_addRule}
		</Button>
	)

	/** The call each row answers: its place among the rows of its endpoint. */
	const callNumbers = useMemo(() => {
		const seen = new Map<string, number>()
		return scenario.rules.map((rule) => {
			const key = endpointKey(rule.method, rule.url)
			const call = (seen.get(key) ?? 0) + 1
			seen.set(key, call)
			return call
		})
	}, [scenario.rules])

	return (
		<div className={rootClass}>
			<div className={s.head}>
				<Checkbox
					toggle
					label={t.sc_enabled}
					checked={scenario.enabled}
					onChange={(_, data) => onChange({ ...scenario, enabled: Boolean(data.checked) })}
					data-testid="scenario-enabled"
				/>
				{scenario.enabled && onReset ? (
					<Button type="button" size="mini" basic inverted={isDark} onClick={onReset} title={t.sc_resetTitle} data-testid="scenario-reset">
						<Icon name="redo" />
						{t.sc_reset}
					</Button>
				) : null}
			</div>
			<p className={s.hint}>{t.sc_hint}</p>

			<div className={s.body}>
				{scenario.rules.length === 0 ? (
					<div className={s.empty}>
						<Icon name="sitemap" size="large" />
						<p>{t.sc_noRules}</p>
						{addRuleButton}
					</div>
				) : (
					<>
						<div className={s.card}>
							<table className={s.rules} data-testid="scenario-rules">
								<RulesHead />
								<tbody>
									{scenario.rules.map((rule, index) => {
										const key = endpointKey(rule.method, rule.url)
										const endpointMocks = mocksOfEndpoint(mocks, rule.method, rule.url)
										const respondMocks = endpointMocks.length > 0 ? endpointMocks : mocks
										return (
											<React.Fragment key={rule.id}>
											{index > 0 && callNumbers[index] === 1 ? (
												<tr className={s.groupGap} aria-hidden="true" data-testid="scenario-group-gap">
													<td colSpan={4} />
												</tr>
											) : null}
											<tr className={callNumbers[index] > 1 ? s.sameEndpoint : undefined} data-testid="scenario-rule">
												<td className={s.number} title={t.sc_callHint} data-testid="scenario-rule-call">{callNumbers[index]}</td>
												<td className={s.endpointCell}>
													<Dropdown
														selection
														search
														fluid
														allowAdditions
														additionLabel={t.sc_customEndpoint}
														options={endpointOptions(key)}
														value={key}
														onChange={(_, data) => changeEndpoint(rule, String(data.value))}
														data-testid="scenario-rule-endpoint"
													/>
												</td>
												<td className={s.respondCell}>
													<Dropdown
														selection
														fluid
														options={[{ key: NETWORK, value: NETWORK, text: t.sc_network }, ...respondMocks.map(mockOption)]}
														value={'mockId' in rule.respond ? rule.respond.mockId : NETWORK}
														onChange={(_, data) => updateRule(rule.id, {
															respond: data.value === NETWORK ? { network: true } : { mockId: String(data.value) },
														})}
														data-testid="scenario-rule-respond"
													/>
												</td>
												<td className={s.rowActions}>
													<button type="button" className={s.iconButton} disabled={!sameEndpoint(rule, scenario.rules[index - 1])} title={t.sc_moveUp} onClick={() => moveRule(index, -1)}>
														<Icon name="arrow up" />
													</button>
													<button type="button" className={s.iconButton} disabled={!sameEndpoint(rule, scenario.rules[index + 1])} title={t.sc_moveDown} onClick={() => moveRule(index, 1)}>
														<Icon name="arrow down" />
													</button>
													<button
														type="button"
														className={`${s.iconButton} ${s.danger}`}
														title={t.sc_deleteRule}
														onClick={() => setRules(scenario.rules.filter((other) => other.id !== rule.id))}
														data-testid="scenario-rule-delete"
													>
														<Icon name="trash alternate outline" />
													</button>
												</td>
											</tr>
											</React.Fragment>
										)
									})}
								</tbody>
							</table>
						</div>
						<div className={s.addLine}>{addRuleButton}</div>
					</>
				)}
			</div>
		</div>
	)
}
