import { useEffect } from 'react'
import { create } from 'zustand'

import { useChromeStore, useGlobalStore } from '../store'

import { sendExtensionMessage } from '@/services/extension-api'

export interface McpConnectionStatus {
	status?: string
	tabId?: number
	origin?: string
	allowCapture?: boolean
	allowScenarioWrites?: boolean
}
export type ConnectionIndicator = {
	tone: 'off' | 'ready' | 'attention' | 'configured'
	description: string
}

const useStatus = create<{ status: McpConnectionStatus | null }>(() => ({ status: null }))
let subscribers = 0
let stop: (() => void) | undefined

/** One local background-status poll shared by the header and settings navigation. */
function useMcpConnectionStatus() {
	const status = useStatus((state) => state.status)
	useEffect(() => {
		subscribers++
		if (subscribers === 1) {
			let active = true
			let timer: ReturnType<typeof setTimeout>
			const refresh = async () => {
				let next: McpConnectionStatus | null = null
				try {
					next =
						(await sendExtensionMessage<McpConnectionStatus>({
							type: 'MOCKMAN_MCP',
							action: 'status',
						})) ?? null
				} catch {
					/* Worker unavailable: never retain a green indicator. */
				}
				if (!active) return
				useStatus.setState({ status: next })
				timer = setTimeout(() => void refresh(), 2000)
			}
			void refresh()
			stop = () => {
				active = false
				clearTimeout(timer)
				useStatus.setState({ status: null })
			}
		}
		return () => {
			subscribers--
			if (!subscribers) {
				stop?.()
				stop = undefined
			}
		}
	}, [])
	return status
}

export function describeMcpConnection(
	status: McpConnectionStatus | null,
	ru: boolean,
): ConnectionIndicator {
	if (!status?.status)
		return { tone: 'off', description: ru ? 'MCP: статус неизвестен' : 'MCP: status unknown' }
	if (status.status === 'tab-unavailable')
		return {
			tone: 'attention',
			description: ru
				? 'MCP: вкладка недоступна. Выберите вкладку или разрешите сайт.'
				: 'MCP: tab unavailable. Select a tab or allow its site.',
		}
	if (status.status === 'connecting')
		return { tone: 'attention', description: ru ? 'MCP: подключение…' : 'MCP: connecting…' }
	if (!status.status.startsWith('connected'))
		return { tone: 'off', description: ru ? 'MCP отключён' : 'MCP disconnected' }
	if (status.tabId === undefined || !status.origin)
		return {
			tone: 'attention',
			description: ru
				? 'MCP подключён: выберите вкладку приложения'
				: 'MCP connected: select an application tab',
		}
	const enabled = (value?: boolean) =>
		ru ? (value ? 'включено' : 'выключено') : value ? 'on' : 'off'
	return {
		tone: 'ready',
		description: ru
			? `MCP подключён · ${status.origin}\nЧтение запросов: ${enabled(
					status.allowCapture,
			  )} · Запись моков: ${enabled(status.allowScenarioWrites)}`
			: `MCP connected · ${status.origin}\nRead requests: ${enabled(
					status.allowCapture,
			  )} · Write mocks: ${enabled(status.allowScenarioWrites)}`,
	}
}

export function useConnectionIndicators() {
	const ru = useGlobalStore((state) => state.lang === 'ru')
	const ai = useChromeStore((state) => state.store.ai)
	const status = useMcpConnectionStatus()
	const provider = ai?.enabled
		? ai.providers.find((item) => item.id === ai.activeProviderId)
		: undefined
	// Selection is configuration, not a claim that a remote model is reachable.
	const aiIndicator: ConnectionIndicator = provider
		? {
				tone: 'configured',
				description: ru
					? `AI: выбрано «${provider.name}» · ${provider.model}. Доступность сервера не проверена.`
					: `AI: selected “${provider.name}” · ${provider.model}. Server availability has not been checked.`,
		  }
		: { tone: 'off', description: ru ? 'AI: подключение не выбрано' : 'AI: no connection selected' }
	return { mcp: describeMcpConnection(status, ru), ai: aiIndicator }
}
