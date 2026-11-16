import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { useGlobalStore } from '../../store'

import styles from './mcp-tab.module.scss'
import { mcpText } from './mcp-text'
import { McpDetails } from './mcp-details'

import { copyTextToClipboard } from '@/services/helper'
import { queryTabs, sendExtensionMessage } from '@/services/extension-api'

interface Status {
	requiresSitePermission?: boolean
	followActive?: boolean
	allowCapture?: boolean
	allowScenarioWrites?: boolean
	status?: string
	connectionId?: string
	tabId?: number
	origin?: string
	error?: string
}
interface Tab {
	title?: string
	path?: string
	tabId: number
	origin: string
}
const tabLabel = (tab: Tab) => {
	const title = (tab.title || tab.path || tab.origin).replace(/\s+/g, ' ').trim()
	const characters = Array.from(title)
	return characters.length > 48 ? characters.slice(0, 47).join('') + '…' : title
}
async function call(action: string, params: Record<string, unknown> = {}) {
	// Read display metadata in the extension UI, independently of the background command version.
	if (action === 'tabs') {
		const tabs = await queryTabs()
		return tabs.filter((tab) => tab.id !== undefined && /^https?:\/\//.test(tab.url ?? '')).map((tab): Tab => {
			const url = new URL(tab.url ?? '')
			return { tabId: tab.id as number, origin: url.origin, title: tab.title?.trim(), path: url.pathname }
		})
	}
	return sendExtensionMessage<Status | Tab[]>({ type: 'MOCKMAN_MCP', action, ...params })
}

const InstallCommand: React.FC<{ name: string; command: string; text: typeof mcpText.ru }> = ({ name, command, text }) => {
    const [result, setResult] = useState<'copied' | 'failed' | null>(null)
    useEffect(() => {
        if (!result) return
        const timer = setTimeout(() => setResult(null), 2000)
        return () => clearTimeout(timer)
    }, [result])
    return <div className={styles.installCommand}>
        <span>{name}</span>
        <div className={styles.commandField}>
            <pre><code>{command}</code></pre>
            <button type="button" className={styles.secondary} aria-live="polite" aria-label={`${result === 'copied' ? text.copied : text.copy} — ${name}`}
                onClick={() => { void copyTextToClipboard(command).then(ok => setResult(ok ? 'copied' : 'failed')) }}>
                {result === 'copied' ? text.copied : text.copy}
            </button>
        </div>
        <span role="status">{result === 'failed' ? text.copyFailed : ''}</span>
    </div>
}

export const MCPTab: React.FC = () => {
	const tabCard = useRef<HTMLElement>(null)
	const lastCardHeight = useRef<number | null>(null)
	const cardAnimation = useRef<Animation | null>(null)
	useLayoutEffect(() => {
		const element = tabCard.current
		if (!element) { lastCardHeight.current = null; return }
		const from = cardAnimation.current?.playState === 'running'
			? element.getBoundingClientRect().height : lastCardHeight.current
		cardAnimation.current?.cancel()
		const to = element.getBoundingClientRect().height
		lastCardHeight.current = to
		if (from !== null && from !== to && typeof element.animate === 'function' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
			cardAnimation.current = element.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: 180, easing: 'ease' })
		}
	})
	useEffect(() => () => { cardAnimation.current?.cancel() }, [])
	const isDark = useGlobalStore((state) => state.resolvedScheme === 'dark')
	const lang = useGlobalStore((state) => state.lang)
	const t = mcpText[lang]
	const [code, setCode] = useState('')
	const [pairAttempted, setPairAttempted] = useState(false)
	const [state, setState] = useState<Status>({})
	const [tabs, setTabs] = useState<Tab[]>([])
	const [error, setError] = useState('')
	const [blockedTab, setBlockedTab] = useState<Tab | null>(null)
	const [busy, setBusy] = useState(false)
	const actionVersion = useRef(0)
	const actionPending = useRef(false)
	const [pendingTab, setPendingTab] = useState<number | null>(null)
	const [pendingFollow, setPendingFollow] = useState<boolean | null>(null)
	const paired = !!state.connectionId && state.status !== 'pairing-required'
	useEffect(() => {
		const element = tabCard.current
		if (!element || typeof ResizeObserver === 'undefined') return
		const observer = new ResizeObserver(() => {
			if (cardAnimation.current?.playState !== 'running') lastCardHeight.current = element.getBoundingClientRect().height
		})
		observer.observe(element)
		return () => observer.disconnect()
	}, [paired])
	const pairing = state.status === 'connecting'
	useEffect(() => {
		if (state.connectionId && state.status?.startsWith('connected')) setCode('')
	}, [state.connectionId, state.status])
	const connected = !!state.status?.startsWith('connected') || state.status === 'tab-unavailable'
	const availableTabs: Tab[] = state.tabId !== undefined && state.origin && !tabs.some((tab) => tab.tabId === state.tabId)
		? [{ tabId: state.tabId, origin: state.origin }, ...tabs] : tabs
	const selectedTab = availableTabs.find((tab) => tab.tabId === (pendingTab ?? blockedTab?.tabId ?? state.tabId))
	const tabGroups = new Map<string, Tab[]>()
	for (const tab of availableTabs) {
		const group = tabGroups.get(tab.origin) ?? []
		group.push(tab)
		tabGroups.set(tab.origin, group)
	}
	useEffect(() => {
		if (!state.connectionId) { setTabs([]); return }
		let active = true
		void call('tabs').then((result) => { if (active && Array.isArray(result)) setTabs(result) }).catch(() => {})
		return () => { active = false }
	}, [state.connectionId, state.tabId])
	useEffect(() => {
		let active = true
		const refresh = async () => {
			try {
				const version = actionVersion.current
				if (actionPending.current) return
				const status = await call('status')
				if (active && version === actionVersion.current && !actionPending.current && !Array.isArray(status)) setState(status ?? {})
			} catch {
				if (active) setError(t.statusError)
			}
		}
		void refresh()
		const timer = setInterval(() => void refresh(), 2000)
		return () => {
			active = false
			clearInterval(timer)
		}
	}, [t])
	const run = async (action: string, params: Record<string, unknown> = {}) => {
		setError('')
		setBusy(true)
		actionVersion.current++
		actionPending.current = true
		if (action === 'pair') setPairAttempted(true)
		try {
			const result = await call(action, params)
			if (Array.isArray(result)) setTabs(result)
			else if (result?.requiresSitePermission && result.tabId !== undefined && result.origin) setBlockedTab({ tabId: result.tabId, origin: result.origin })
			else if (result?.error) setError(result.error.includes('Allow this site') || result.error.includes('allowed site') ? t.siteError : action === 'pair' ? t.pairError : t.commandError)
			else { setState(result ?? {}); if (action === 'grant_site_and_select' || action === 'select' || action === 'disconnect' || action === 'follow_active') { setBlockedTab(null); setPendingTab(null) } }
		} catch {
			setError(action === 'pair' ? t.pairError : t.commandError)
		} finally { actionPending.current = false; setBusy(false); setPendingFollow(null) }
	}
	return (
        <div className={`${styles.root} ${isDark ? styles.dark : ''}`}>
            <header className={styles.header}>
                <h3>{t.title}</h3>
                <p>{t.intro}</p>
                <span className={`${styles.status} ${connected ? styles.connected : ''}`} role="status">
                    <span aria-hidden="true" />{state.status ? t.statuses[state.status] ?? t.statuses.disconnected : t.loading}
                </span>
            </header>
            {!paired && <div className={styles.steps}>
                <section className={styles.card}>
                    <h4><span className={styles.number}>1</span>{t.pluginStep}</h4>
                    <p>{t.installBefore}<a href="https://github.com/ozontech/oMockman/tree/main/packages/mcp-server" target="_blank" rel="noopener noreferrer">GitHub</a>{t.installAfter}</p>
                    <InstallCommand name="Build MCP" command="npm ci && npm run build:mcp" text={t} />
                    <InstallCommand name="MCP configuration" command={'{"mcpServers":{"mockman":{"command":"node","args":["/absolute/path/to/oMockman/dist/mcp/index.js"]}}}'} text={t} />
                </section>
                <section className={styles.card}>
                    <h4><span className={styles.number}>2</span>{t.codeStep}</h4>
                    <p>{t.askAgent} <strong className={styles.prompt}>«{t.prompt}»</strong></p>
                    <form onSubmit={(event) => { event.preventDefault(); if (!busy && !pairing && /^[a-f0-9]{16}$/.test(code)) void run('pair', { code }) }}>
                        <label className={styles.fieldLabel} htmlFor="mockman-pairing-code">{t.code}</label>
                        <div className={styles.row}>
                            <input id="mockman-pairing-code" className={styles.input} aria-label={t.code} value={code}
                                autoComplete="off" spellCheck={false} placeholder={t.placeholder}
                                onChange={(event) => setCode(event.target.value.trim().toLowerCase())} />
                            <button className={styles.primary} type="submit" disabled={busy || pairing || !/^[a-f0-9]{16}$/.test(code)}>{pairing ? t.pairing : t.pair}</button>
                        </div>
                        <p className={styles.hint}>{t.codeHint}</p>
                        {state.status === 'pairing-required' && <p className={styles.error} role="alert">{t.codeRejected}</p>}
                        {(state.status === 'not-connected' || (state.status === 'disconnected' && pairAttempted)) && <p className={styles.error} role="alert">{t.connectionFailed}</p>}
                    </form>
                </section>
            </div>}
            {paired && <>
                <section ref={tabCard} className={styles.card}>
                    <div className={styles.sectionHeader}>
                        <h4>{t.tabTitle}</h4>
                        <button className={styles.secondary} disabled={busy} onClick={() => void run('tabs')}>{t.refresh}</button>
                    </div>
                    <p>{t.tabHint}</p>
                    <div className={styles.tabSelection}>
                    <select className={styles.select} aria-label={t.tab} value={pendingTab ?? blockedTab?.tabId ?? state.tabId ?? ''} disabled={busy || !connected}
                        onChange={(event) => { const tabId = Number(event.target.value); setPendingTab(tabId); void run('select', { tabId }) }}>
                        <option value="" disabled>{t.choose}</option>
                        {[...tabGroups].sort(([a], [b]) => a.localeCompare(b)).map(([origin, group]) => (
                            <optgroup key={origin} label={origin}>
                                {group.map((tab, index) => {
                                    const label = tabLabel(tab)
                                    const duplicates = group.filter((item) => tabLabel(item) === label)
                                    const number = group.slice(0, index + 1).filter((item) => tabLabel(item) === label).length
                                    return <option key={tab.tabId} value={tab.tabId}>
                                        {label}{duplicates.length > 1 ? ` (${number})` : ''}
                                    </option>
                                })}
                            </optgroup>
                        ))}
                    </select>
                    <label className={styles.permission}>
                        <input type="checkbox" aria-label={t.followActive} checked={pendingFollow ?? state.followActive === true} disabled={busy || !connected}
                            onChange={(event) => { setPendingFollow(event.target.checked); void run('follow_active', { allowed: event.target.checked }) }} />
                        <span><strong>{t.followActive}</strong><small>{t.followHint}</small></span>
                    </label>
                    </div>
                    {selectedTab && <McpDetails className={styles.selectedDetails} label={t.selected}>
                        <div key={selectedTab.tabId} className={styles.contentEnter}>
                        {selectedTab.title && <p>{selectedTab.title}</p>}
                        <p>{selectedTab.origin}{selectedTab.path ?? ''}</p>
                        </div>
                    </McpDetails>}
                    {blockedTab && <div className={styles.siteNotice} role="alert">
                        <p key={blockedTab.origin} className={styles.contentEnter}>{t.sitePermissionNeeded} <strong>{blockedTab.origin}</strong></p>
                        <button className={styles.primary} disabled={busy || !connected}
                            onClick={() => void run('grant_site_and_select', { ...blockedTab })}>{t.allowSite}</button>
                    </div>}
                    {!availableTabs.length && <p className={styles.hint}>{t.noTabs}</p>}
                </section>
                {state.tabId !== undefined && !blockedTab && (pendingTab === null || pendingTab === state.tabId) && <section className={styles.card}>
                    <h4>{t.accessTitle}</h4>
                    <label className={styles.permission}>
                        <input type="checkbox" aria-label={t.writes} checked={state.allowScenarioWrites === true} disabled={busy || !connected}
                            onChange={(event) => void run('allow_scenario_writes', { allowed: event.target.checked })} />
                        <span><strong>{t.writesTitle}</strong><small>{t.writesText}</small></span>
                    </label>
                    <label className={styles.permission}>
                        <input type="checkbox" aria-label={t.capture} checked={state.allowCapture === true} disabled={busy || !connected}
                            onChange={(event) => void run('allow_capture', { allowed: event.target.checked })} />
                        <span><strong>{t.captureTitle}</strong><small>{t.captureText}</small></span>
                    </label>
                    {connected && state.allowScenarioWrites && <p className={styles.ready}>{t.ready}</p>}
                    <p className={styles.hint}>{t.hint}</p>
                </section>}
                <footer className={styles.footer}>
                    <button className={styles.secondary} disabled={busy} onClick={() => void run('disconnect')}>{t.disconnect}</button>
                    <p className={styles.hint}>{t.disconnectHint}</p>
                </footer>
            </>}
            {error && <p className={styles.error} role="alert">{error}</p>}
        </div>
    )
}
