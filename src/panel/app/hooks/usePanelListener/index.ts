import { useEffect, useRef, useCallback } from 'react'

import { MessageService as messageService } from '../../../../services/message'
import { useGlobalStore, useLogStore } from '../../store'
import type { GlobalStoreState } from '../../store'

import { useAddBulkMock } from './add-bulk-mock'

import { getMockFromLog } from '@/panel/app/logs/log-util'
import type { ILog, IMockResponseRaw } from '@/interface/mock'
import type { IEventMessage } from '@/interface/message'
import { genId } from '@/services/helper'

export const usePanelListener = (
	meta: GlobalStoreState['meta'],
): GlobalStoreState['meta'] => {
	const { recording, loggingEnabled, setMeta } = useGlobalStore()
	const { upsertLog } = useLogStore()
	const addBulkMock = useAddBulkMock()
	const recordingsRef = useRef<IMockResponseRaw[]>([])

	const loggingEnabledRef = useRef(loggingEnabled)
	const recordingRef = useRef(recording)
	const metaRef = useRef(meta)
	const upsertLogRef = useRef(upsertLog)
	const setMetaRef = useRef(setMeta)

	useEffect(() => {
		loggingEnabledRef.current = loggingEnabled
		try {
			const port = (globalThis as { __MOCKMAN_PANEL_PORT__?: chrome.runtime.Port }).__MOCKMAN_PANEL_PORT__
			const tabId = metaRef.current.tab?.id
			if (port && typeof tabId === 'number') {
				port.postMessage({ type: 'SET_LOGGING', tabId, enabled: loggingEnabled })
			}
		} catch {
			void 0
		}
	}, [loggingEnabled])

	useEffect(() => {
		recordingRef.current = recording
	}, [recording])

	useEffect(() => {
		metaRef.current = meta
	}, [meta])

	useEffect(() => {
		upsertLogRef.current = upsertLog
	}, [upsertLog])

	useEffect(() => {
		setMetaRef.current = setMeta
	}, [setMeta])

	const handleLog = useCallback((log: ILog) => {
		if (loggingEnabledRef.current) {
			upsertLogRef.current(log)
		}
		if (log.response && !log.response.tooLarge && recordingRef.current) {
			recordingsRef.current.push({
				...getMockFromLog(log),
				id: genId(),
				name: `Recorded ${new Date().toLocaleDateString()}`,
			})
		}
	}, [])

	const handleInit = useCallback((host: string) => {
		const currentMeta = metaRef.current
		if (host === currentMeta.host) return
		const storeKey = `mockman.extension.active.${host}`
		setMetaRef.current({ ...currentMeta, active: true, host, storeKey })
	}, [])

	useEffect(() => {
		if (!recording && recordingsRef.current.length) {
			addBulkMock(recordingsRef.current).catch(() => void 0)
			recordingsRef.current = []
		}
	}, [recording, addBulkMock])

	useEffect(() => {
		let port: chrome.runtime.Port | undefined
		try {
			port = chrome.runtime.connect({ name: 'mockman-panel' })
			;(globalThis as { __MOCKMAN_PANEL_PORT__?: chrome.runtime.Port }).__MOCKMAN_PANEL_PORT__ = port

			if (meta.tab?.id) {
				port.postMessage({ type: 'REGISTER_PANEL', tabId: meta.tab.id })
				port.postMessage({ type: 'SET_LOGGING', tabId: meta.tab.id, enabled: loggingEnabledRef.current })
			}

			port.onMessage.addListener((raw) => {
				const msg = raw as IEventMessage

				switch (msg.type) {
					case 'LOG': {
						const sourceTabId = msg.sourceTabId
						if (sourceTabId != null && sourceTabId !== metaRef.current.tab?.id) break
						handleLog(msg.message as ILog)
						break
					}
					case 'INIT':
						handleInit(msg.message as string)
						break
				}
			})
		} catch (e) {
			void e
		}

		const unsubscribes = messageService.listen(
			'PANEL',
			(msg: IEventMessage) => {
				switch (msg.type) {
					case 'LOG': {
						const sourceTabId = msg.sourceTabId
						if (sourceTabId != null && sourceTabId !== metaRef.current.tab?.id) break
						handleLog(msg.message as ILog)
						break
					}
					case 'INIT':
						handleInit(msg.message as string)
						break
					default:
						break
				}
			},
		)

		return () => {
			if (port) {
				port.disconnect()
			}
			if (unsubscribes) {
				if (Array.isArray(unsubscribes)) {
					unsubscribes.forEach((unsubscribe) => unsubscribe())
				} else {
					unsubscribes()
				}
			}
		}
	}, [meta.tab?.id, handleLog, handleInit])

	return meta
}
