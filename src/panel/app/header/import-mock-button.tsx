import React, { useCallback, useState } from 'react'
import { Button, Icon, Modal, Table } from 'semantic-ui-react'
import { toast } from 'react-toastify'

import { useGlobalStore, ViewEnum, useChromeStore } from '../store'

import s from './header.module.scss'

import { modalActionsSurface, modalHeaderSurface, modalSurface } from '@/panel/app/blocks'
import { describeSaveError, storeActions } from '@/panel/app/service'
import type { MockmanExportBundle, ImportRejection, ImportSummary } from '@/services/mock-import'
import {
	IMPORT_LIMITS,
	checkImportLimits,
	classifyImport,
	parseImportSource,
	queuedItemToRaw,
	summarizeImport,
} from '@/services/mock-import'
import type { IMockResponse } from '@/interface/mock'
import { formatBytes } from '@/services/body-limits'

interface PendingImport {
	valid: IMockResponse[]
	toFix: Array<Record<string, unknown>>
	package?: MockmanExportBundle
	summary: ImportSummary
}

const rejectionMessage = (rejection: ImportRejection): string => {
	switch (rejection.code) {
		case 'source_too_large':
			return `File is too large: ${formatBytes(rejection.actual ?? 0)}, limit is ${formatBytes(IMPORT_LIMITS.maxSourceBytes)}.`
		case 'invalid_json':
			return 'File is not valid JSON.'
		case 'nothing_to_import':
			return 'Nothing to import: no mocks found in the file.'
		case 'too_many_mocks':
			return `Too many mocks: ${rejection.actual}, limit is ${rejection.limit}.`
		case 'response_too_large':
			return `A mock response body is too large: ${formatBytes(rejection.actual ?? 0)}, limit is ${formatBytes(IMPORT_LIMITS.maxResponseBytes)}.`
		case 'too_many_collections':
			return `Too many collections: ${rejection.actual}, limit is ${rejection.limit}.`
		case 'collection_too_deep':
			return `Collection tree is too deep: ${rejection.actual} levels, limit is ${rejection.limit}.`
		default:
			return 'Import rejected.'
	}
}

const ImportPreview: React.FC<{ rows: ImportSummary['preview']; isDark: boolean }> = ({ rows, isDark }) => (
	<Table compact size="small" inverted={isDark} data-testid="import-preview">
		<Table.Header>
			<Table.Row>
				<Table.HeaderCell>Method</Table.HeaderCell>
				<Table.HeaderCell>URL</Table.HeaderCell>
				<Table.HeaderCell>Status</Table.HeaderCell>
				<Table.HeaderCell>Body</Table.HeaderCell>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{rows.map((row, idx) => (
				<Table.Row key={`${row.method}-${row.url}-${idx}`}>
					<Table.Cell>{row.method || '—'}</Table.Cell>
					<Table.Cell className={s.importPreviewUrl}>{row.url || '—'}</Table.Cell>
					<Table.Cell>{row.status ?? '—'}</Table.Cell>
					<Table.Cell>{formatBytes(row.responseBytes)}</Table.Cell>
				</Table.Row>
			))}
		</Table.Body>
	</Table>
)

export const ImportMockButton: React.FC = () => {
	const t = useGlobalStore((state) => state.t)
	const isDark = useGlobalStore((state) => state.resolvedScheme === 'dark')
	const setView = useGlobalStore((state) => state.setView)
	const tabId = useGlobalStore((state) => state.meta.tab?.id)
	const setSelectedMock = useChromeStore((state) => state.setSelectedMock)
	const setStoreProperties = useChromeStore((state) => state.setStoreProperties)

	const [pending, setPending] = useState<PendingImport | null>(null)

	const pickFile = useCallback(() => {
		try {
			const input = document.createElement('input')
			input.type = 'file'
			input.accept = 'application/json'
			input.onchange = async () => {
				const file = input.files?.[0]
				if (!file) return

				if (file.size > IMPORT_LIMITS.maxSourceBytes) {
					toast.error(rejectionMessage({ code: 'source_too_large', actual: file.size }))
					return
				}

				const text = await file.text()
				const parsed = parseImportSource(text)
				if (!parsed.ok) {
					toast.error(rejectionMessage(parsed.rejection))
					return
				}

				const classified = classifyImport(parsed.value, { strategy: 'strict' })
				const rejection = checkImportLimits(classified)
				if (rejection) {
					toast.error(rejectionMessage(rejection))
					return
				}

				setPending({
					...classified,
					summary: summarizeImport(classified, new TextEncoder().encode(text).length),
				})
			}
			input.click()
		} catch {
			void 0
		}
	}, [])

	const closeDialog = useCallback(() => setPending(null), [])

	const confirmImport = useCallback(async () => {
		if (!pending) return
		setPending(null)

		try {
			if (pending.package) {
				const { store } = await storeActions.getStore()
				const updated = storeActions.importCollectionBundle(store, pending.package)
				await storeActions.updateStoreInDB(updated).then(setStoreProperties)
				storeActions.refreshContentStore(tabId)
			} else if (pending.valid.length) {
				const { store } = await storeActions.getStore()
				const updated = storeActions.addMocks(store, pending.valid)
				await storeActions.updateStoreInDB(updated).then(setStoreProperties)
				storeActions.refreshContentStore(tabId)
			}

			if (pending.toFix.length) {
				useGlobalStore.getState().pushImportQueue(pending.toFix)
				setView(ViewEnum.MOCKS)
				const next = useGlobalStore.getState().shiftImportQueue()
				const queuedDraft = queuedItemToRaw(next)
				if (queuedDraft) setSelectedMock(queuedDraft)
			}
		} catch (error) {
			toast.error(describeSaveError(error, t, 'Import failed.'))
		}
	}, [pending, setStoreProperties, setSelectedMock, setView, tabId, t])


	return (
		<>
			<Button
				size="small"
				basic
				inverted={isDark}
				icon
				labelPosition="left"
				className={`${s.addMockBtn} ${s.importMockBtn}`}
				title={t.header_importMock}
				data-testid="import-mock-button"
				onClick={pickFile}
			>
				<Icon name="upload" />
				{t.header_importMock}
			</Button>

			<Modal
				size="small"
				open={Boolean(pending)}
				onClose={closeDialog}
				closeOnDimmerClick={false}
				closeOnEscape
				dimmer={isDark ? 'blurring' : 'dimmingLight'}
				style={modalSurface(isDark)}
			>
				<Modal.Header style={modalHeaderSurface(isDark)}>{t.import_confirmTitle}</Modal.Header>
				<Modal.Content scrolling style={modalSurface(isDark)}>
					<p>
						{t.import_confirmSummary
							.replace('{mocks}', String(pending?.summary.mocks ?? 0))
							.replace('{collections}', String(pending?.summary.collections ?? 0))
							.replace('{size}', formatBytes(pending?.summary.bytes ?? 0))}
					</p>
					<ImportPreview rows={pending?.summary.preview ?? []} isDark={isDark} />
					{(pending?.summary.mocks ?? 0) > (pending?.summary.preview.length ?? 0) && (
						<p>
							{t.import_confirmTruncated.replace(
								'{rest}',
								String((pending?.summary.mocks ?? 0) - (pending?.summary.preview.length ?? 0)),
							)}
						</p>
					)}
				</Modal.Content>
				<Modal.Actions style={modalActionsSurface(isDark)}>
					<Button onClick={closeDialog} inverted={isDark} data-testid="import-cancel">
						{t.import_confirmCancel}
					</Button>
					<Button primary onClick={confirmImport} data-testid="import-confirm">
						{t.import_confirmApply}
					</Button>
				</Modal.Actions>
			</Modal>
		</>
	)
}
