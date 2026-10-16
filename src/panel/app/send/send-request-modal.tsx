import React, { useMemo, useRef, useState } from 'react'
import { Button, Checkbox, Dropdown, Icon, Input, Loader, Message, Modal, Tab } from 'semantic-ui-react'

import s from './send-request.module.scss'

import { modalActionsSurface, modalHeaderSurface, modalSurface, StatusBadge } from '@/panel/app/blocks'
import { AutoResizeCodeMirror } from '@/panel/app/common/auto-resize-codemirror'
import { AnimatedTabs } from '@/panel/app/common/animated-tabs'
import { useGlobalStore, useSendStore } from '@/panel/app/store'
import { sendBodyProblem, sendRequestToTab } from '@/panel/app/service/send-request'
import type { HeadersSource } from '@/panel/app/service/send-request'
import type { ISendRequest, ISendResult } from '@/interface/bridge'
import { formatBytes, utf8ByteLength } from '@/services/body-limits'
import { isJsonValid, prettifyJson } from '@/services/json'
import { canPatchMethod } from '@/services/request-patch'

/** Matches the leave animation in send-request.module.scss. */
const CLOSE_ANIMATION_MS = 160

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map((m) => ({ key: m, value: m, text: m }))

const REQUEST_TABS = ['body', 'headers', 'response'] as const
type RequestSection = typeof REQUEST_TABS[number]

/** A tab pane without the segment frame; its key makes the switch animate. */
const Pane: React.FC<{ paneKey: string; children: React.ReactNode }> = ({ paneKey, children }) => (
	<Tab.Pane as="div" key={paneKey} className={s.pane}>{children}</Tab.Pane>
)

const ignoreChange = (): void => undefined

const hostOf = (url: string): string => {
	try {
		return new URL(url).host
	} catch {
		return url
	}
}

const withCount = (label: string, count: number): React.ReactNode => (
	<>
		{label}
		{count > 0 ? <span className={s.count}>{count}</span> : null}
	</>
)

/**
 * The response as shown: pretty JSON and its size. Up to 20 MB, so it is worked out once per
 * answer, not on every render of the window (each new log renders it again).
 */
function describeResponse(result: ISendResult | undefined): { body: string; size: number } {
	if (!result?.ok) return { body: '', size: 0 }
	const body = result.binary || result.tooLarge || !isJsonValid(result.body) ? result.body : prettifyJson(result.body)
	return { body, size: result.size ?? utf8ByteLength(result.body) }
}

const ResponseView: React.FC<{ result: ISendResult; shown: { body: string; size: number }; isDark: boolean }> = ({ result, shown, isDark }) => {
	const t = useGlobalStore((st) => st.t)
	const [section, setSection] = useState(0)

	if (!result.ok) {
		const hint = {
			invalid: t.send_error_invalid,
			not_allowed: t.send_error_notAllowed,
			unavailable: t.send_error_unavailable,
			network: t.send_error_network,
			timeout: t.send_error_timeout,
		}[result.reason]
		return (
			<Message negative size="small" data-testid="send-error">
				<Message.Header>{hint}</Message.Header>
				<p className={s.errorDetail}>{result.error}</p>
			</Message>
		)
	}

	return (
		<div data-testid="send-response">
			<AnimatedTabs
				isDark={isDark}
				menuSize="small"
				activeIndex={section}
				onActiveIndexChange={setSection}
				aside={(
					<span className={s.meta} data-testid="send-response-meta">
						{result.durationMs} ms · {formatBytes(shown.size)}
					</span>
				)}
				panes={[
					{
						menuItem: { key: 'body', content: t.send_body },
						render: () => (
							<Pane paneKey="body">
								{result.binary || result.tooLarge ? (
									<Message info size="small">{result.binary ? t.send_binaryBody : t.send_tooLargeBody}</Message>
								) : (
									<AutoResizeCodeMirror value={shown.body} isDark={isDark} readOnly onChange={ignoreChange} />
								)}
							</Pane>
						),
					},
					{
						menuItem: { key: 'headers', content: withCount(t.send_headers, result.headers.length) },
						render: () => (
							<Pane paneKey="headers">
								<table className={s.headersTable}>
									<tbody>
										{result.headers.map(({ name, value }, index) => (
											<tr key={`${name}-${index}`}>
												<td className={s.headerName}>{name}</td>
												<td>{value}</td>
											</tr>
										))}
									</tbody>
								</table>
							</Pane>
						),
					},
				]}
			/>
		</div>
	)
}

const SendRequestForm: React.FC<{
	draft: ISendRequest
	mountNode?: HTMLElement
	headersFrom?: HeadersSource
	onClose: () => void
}> = ({
	draft,
	mountNode,
	headersFrom,
	onClose,
}) => {
	const t = useGlobalStore((st) => st.t)
	const isDark = useGlobalStore((st) => st.resolvedScheme === 'dark')
	const tabId = useGlobalStore((st) => st.meta.tab?.id)
	const [request, setRequest] = useState<ISendRequest>(() => ({
		...draft,
		body: draft.body && isJsonValid(draft.body) ? prettifyJson(draft.body) : draft.body,
	}))
	const [section, setSection] = useState<RequestSection>('body')
	const [sending, setSending] = useState(false)
	const [result, setResult] = useState<ISendResult>()
	const [closing, setClosing] = useState(false)
	const closeTimer = useRef<number>()
	const hasBody = canPatchMethod(request.method)
	// Parses the body: only when the body, the method or the headers change, not on every key in the URL.
	const bodyProblem = useMemo(
		() => sendBodyProblem({ method: request.method, headers: request.headers, body: request.body }),
		[request.method, request.headers, request.body],
	)
	const shownResponse = useMemo(() => describeResponse(result), [result])
	const bodyProblemText = bodyProblem === 'invalid_json'
		? t.pane_requestPatchInvalidJson
		: bodyProblem === 'too_large'
			? t.pane_requestPatchTooLarge
			: ''

	const requestClose = () => {
		if (closing) return
		setClosing(true)
		closeTimer.current = window.setTimeout(onClose, CLOSE_ANIMATION_MS)
	}
	React.useEffect(() => () => window.clearTimeout(closeTimer.current), [])

	React.useEffect(() => {
		const view = mountNode?.ownerDocument.defaultView
		if (!view || view === window) return undefined
		view.addEventListener('pagehide', onClose)
		return () => view.removeEventListener('pagehide', onClose)
	}, [mountNode, onClose])

	const send = async () => {
		if (sending || !request.url.trim() || bodyProblem) return
		if (typeof tabId !== 'number') {
			setResult({ ok: false, reason: 'unavailable', error: t.send_noTab })
			setSection('response')
			return
		}
		setSending(true)
		setResult(undefined)
		setSection('response')
		try {
			setResult(await sendRequestToTab(tabId, { ...request, url: request.url.trim() }))
		} finally {
			setSending(false)
		}
	}

	const responseLabel = (
		<>
			{t.send_response}
			{sending ? <Icon name="circle notch" loading className={s.tabStatus} /> : null}
			{!sending && result?.ok ? <span className={s.tabStatus}><StatusBadge value={result.status} inverted={isDark} /></span> : null}
			{!sending && result && !result.ok ? <Icon name="exclamation triangle" color="red" className={s.tabStatus} /> : null}
		</>
	)

	const setHeader = (index: number, patch: Partial<{ name: string; value: string }>) =>
		setRequest((prev) => ({
			...prev,
			headers: prev.headers.map((header, i) => (i === index ? { ...header, ...patch } : header)),
		}))

	return (
		<Modal
			open
			onClose={requestClose}
			mountNode={mountNode}
			size="large"
			centered={false}
			dimmer={isDark ? 'blurring' : 'dimmingLight'}
			className={`${s.modal} ${closing ? s.closing : ''}`}
			style={modalSurface(isDark)}
			data-testid="send-modal"
		>
			<Modal.Header style={modalHeaderSurface(isDark)} className={s.header}>
				<span>
					<Icon name="paper plane outline" />
					{t.send_title}
				</span>
				<Button
					icon
					basic
					type="button"
					size="mini"
					color="red"
					inverted={isDark}
					onClick={requestClose}
					title={t.mock_close}
					aria-label={t.mock_close}
					data-testid="send-close"
					style={{ color: '#e06c75' }}
				>
					<Icon name="close" />
				</Button>
			</Modal.Header>
			<Modal.Content scrolling style={modalSurface(isDark)}>
				<div
					className={s.requestLine}
					onKeyDown={(event) => {
						if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void send()
					}}
				>
					<Dropdown
						selection
						compact
						options={METHODS}
						value={request.method}
						onChange={(_, data) => setRequest((prev) => ({ ...prev, method: String(data.value) }))}
						className={s.method}
						data-testid="send-method"
					/>
					<Input
						fluid
						className={s.url}
						value={request.url}
						placeholder="https://…"
						onChange={(_, data) => setRequest((prev) => ({ ...prev, url: String(data.value) }))}
						data-testid="send-url"
					/>
					<Button
						primary
						type="button"
						loading={sending}
						disabled={sending || !request.url.trim() || Boolean(bodyProblem)}
						onClick={() => void send()}
						title={bodyProblemText || t.send_shortcut}
						data-testid="send-button"
					>
						<Icon name="paper plane" />
						{t.send_button}
					</Button>
				</div>
				{headersFrom === 'none' ? (
					<Message warning size="tiny" className={s.headersNote} data-testid="send-headers-missing">
						<Icon name="exclamation triangle" />
						{t.send_headersMissing}
					</Message>
				) : null}
				{headersFrom === 'site' ? (
					<p className={s.hint} data-testid="send-headers-from-site">{t.send_headersFromSite(hostOf(draft.url))}</p>
				) : null}
				<Checkbox
					className={s.credentials}
					label={t.send_credentials}
					checked={request.withCredentials}
					onChange={(_, data) => setRequest((prev) => ({ ...prev, withCredentials: Boolean(data.checked) }))}
					title={t.send_credentialsHint}
				/>

				<AnimatedTabs
					isDark={isDark}
					menuSize="small"
					activeIndex={REQUEST_TABS.indexOf(section)}
					onActiveIndexChange={(index) => setSection(REQUEST_TABS[index])}
					panes={[
						{
							menuItem: { key: 'body', content: t.send_body },
							render: () => (
								<Pane paneKey="body">
									{hasBody ? null : <p className={s.hint}>{t.send_noBodyMethod}</p>}
									{bodyProblemText ? (
										<div className={s.bodyError} data-testid="send-body-error">
											<Icon name="exclamation triangle" />
											<span>{bodyProblemText}</span>
										</div>
									) : null}
									<div className={hasBody ? undefined : s.locked}>
										<AutoResizeCodeMirror
											value={request.body ?? ''}
											isDark={isDark}
											readOnly={!hasBody}
											placeholder={t.pane_requestBodyPlaceholder}
											onChange={(body: string) => setRequest((prev) => ({ ...prev, body }))}
										/>
									</div>
								</Pane>
							),
						},
						{
							menuItem: { key: 'headers', content: withCount(t.send_headers, request.headers.length) },
							render: () => (
								<Pane paneKey="headers">
									<div className={s.headers}>
										{request.headers.map((header, index) => (
											<div className={s.headerRow} key={index}>
												<Input
													placeholder={t.pane_headerNamePlaceholder}
													value={header.name}
													onChange={(_, data) => setHeader(index, { name: String(data.value) })}
												/>
												<Input
													className={s.headerValue}
													placeholder={t.pane_headerValuePlaceholder}
													value={header.value}
													onChange={(_, data) => setHeader(index, { value: String(data.value) })}
												/>
												<Button
													type="button"
													icon="trash"
													basic
													color="red"
													size="mini"
													title={t.pane_deleteHeader}
													onClick={() => setRequest((prev) => ({ ...prev, headers: prev.headers.filter((_, i) => i !== index) }))}
												/>
											</div>
										))}
										<Button
											type="button"
											size="mini"
											basic
											inverted={isDark}
											onClick={() => setRequest((prev) => ({ ...prev, headers: [...prev.headers, { name: '', value: '' }] }))}
										>
											<Icon name="add" />
											{t.pane_addHeader}
										</Button>
									</div>
								</Pane>
							),
						},
						...(sending || result
							? [{
								menuItem: { key: 'response', content: responseLabel, 'data-testid': 'send-response-tab' },
								render: () => (
									<Pane paneKey="response">
										{sending ? (
											<div className={s.sending}>
												<Loader active inline="centered" size="small" inverted={isDark}>{t.send_sending}</Loader>
											</div>
										) : result ? <ResponseView result={result} shown={shownResponse} isDark={isDark} /> : null}
									</Pane>
								),
							}]
							: []),
					]}
				/>
			</Modal.Content>
			<Modal.Actions style={modalActionsSurface(isDark)}>
				<Button basic inverted={isDark} onClick={requestClose}>{t.mock_close}</Button>
			</Modal.Actions>
		</Modal>
	)
}

/** The send window: opens on a draft from Logs or from a mock, sends it through the page. */
export const SendRequestModal: React.FC = () => {
	const draft = useSendStore((st) => st.draft)
	const mountNode = useSendStore((st) => st.mountNode)
	const headersFrom = useSendStore((st) => st.headersFrom)
	const closeSend = useSendStore((st) => st.closeSend)
	if (!draft) return null
	return <SendRequestForm
		draft={draft}
		mountNode={mountNode?.isConnected ? mountNode : undefined}
		headersFrom={headersFrom}
		onClose={closeSend}
	/>
}
