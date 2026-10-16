import React, { useState, useCallback, useEffect, useRef } from 'react'
import { Modal, Button, Icon } from 'semantic-ui-react'

import s from './collection-settings-form.module.scss'
import { ScenarioEditor } from './scenario-editor'

import { modalActionsSurface, modalHeaderSurface, modalSurface } from '@/panel/app/blocks'
import { useGlobalStore } from '@/panel/app/store'
import type { ICollectionNode, ICollectionScenario } from '@/interface/collection'
import type { IMockResponse } from '@/interface/mock'

interface CollectionSettingsFormProps {
	open: boolean
	onClose: () => void
	selectedCollection?: ICollectionNode
	onSave: (collectionId: string, scenario: ICollectionScenario | undefined) => void
	/** The mocks of the collection and its subcollections, for the scenario rules. */
	mocks: IMockResponse[]
	onResetScenario?: (collectionId: string) => void
	isDark: boolean
}

const CLOSE_MS = 180

/** Collection settings: for now, its scenario. */
export const CollectionSettingsForm: React.FC<CollectionSettingsFormProps> = ({
	open,
	onClose,
	selectedCollection,
	onSave,
	mocks,
	onResetScenario,
	isDark,
}) => {
	const t = useGlobalStore((st) => st.t)
	const [scenario, setScenario] = useState<ICollectionScenario | undefined>()
	const [closing, setClosing] = useState(false)
	const closeTimer = useRef<number>()

	useEffect(() => () => window.clearTimeout(closeTimer.current), [])

	useEffect(() => {
		window.clearTimeout(closeTimer.current)
		if (!open) {
			setClosing(false)
			return
		}
		setScenario(selectedCollection?.scenario)
	}, [open, selectedCollection?.id])

	const requestClose = useCallback(() => {
		if (closing) return
		setClosing(true)
		closeTimer.current = window.setTimeout(onClose, CLOSE_MS)
	}, [closing, onClose])

	/** Escape in an open dropdown closes the dropdown, not the whole form with its unsaved rules. */
	const handleModalClose = useCallback((event: React.SyntheticEvent | KeyboardEvent) => {
		const target = event.target as Element | null
		if (event.type === 'keydown' && target?.closest?.('.ui.dropdown.active')) return
		requestClose()
	}, [requestClose])

	const handleSave = useCallback(() => {
		if (!selectedCollection) return
		onSave(selectedCollection.id, scenario)
		requestClose()
	}, [selectedCollection, scenario, onSave, requestClose])

	const phase = closing ? 'mm-modal-leave' : 'mm-modal-enter'

	return (
		<Modal
			size="large"
			centered={false}
			open={open || closing}
			onClose={handleModalClose}
			closeOnDimmerClick={false}
			closeOnEscape
			transition={undefined}
			duration={0}
			style={modalSurface(isDark)}
			className={`mm-modal ${phase} ${s.modal}`}
			dimmerClassName={`mm-modal-dimmer ${phase}`}
			data-testid="collection-modal"
		>
			<Modal.Header style={modalHeaderSurface(isDark)} data-testid="collection-modal-header">
				<div className={s.headerRow}>
					<span className={s.title}>
						{t.col_settingsTitle}
						{selectedCollection ? (
							<span className={s.collectionName} title={selectedCollection.name}>
								<Icon name="folder" />
								{selectedCollection.name}
							</span>
						) : null}
					</span>
					<Button
						icon
						basic
						type="button"
						size="mini"
						inverted={isDark}
						onClick={requestClose}
						title={t.ai_close}
						aria-label={t.ai_close}
						data-testid="collection-modal-close"
					>
						<Icon name="close" />
					</Button>
				</div>
			</Modal.Header>
			<Modal.Content scrolling style={modalSurface(isDark)} className={s.content}>
				<ScenarioEditor
					scenario={scenario}
					onChange={setScenario}
					mocks={mocks}
					isDark={isDark}
					onReset={selectedCollection && onResetScenario ? () => onResetScenario(selectedCollection.id) : undefined}
				/>
			</Modal.Content>
			<Modal.Actions style={modalActionsSurface(isDark)}>
				<Button type="button" basic inverted={isDark} onClick={requestClose} data-testid="collection-modal-cancel">{t.col_cancel}</Button>
				<Button type="button" primary onClick={handleSave} data-testid="collection-modal-save">{t.col_save}</Button>
			</Modal.Actions>
		</Modal>
	)
}
