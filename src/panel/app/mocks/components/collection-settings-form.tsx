import React, { useState, useCallback, useMemo, useEffect } from 'react'
import { Modal, Button, Form, Input } from 'semantic-ui-react'

import s from './collection-settings-form.module.scss'

import type { ICollectionNode } from '@/interface/collection'

interface CollectionSettingsFormProps {
	open: boolean
	onClose: () => void
	selectedCollection?: ICollectionNode
	onSaveOpenApiUrl: (collectionId: string, openApiUrl: string) => void
	isDark: boolean
}

export const CollectionSettingsForm: React.FC<CollectionSettingsFormProps> = ({
	open,
	onClose,
	selectedCollection,
	onSaveOpenApiUrl,
	isDark,
}) => {
	const [openApiUrl, setOpenApiUrl] = useState('')

	useEffect(() => {
		if (selectedCollection?.openApiUrl) {
			setOpenApiUrl(selectedCollection.openApiUrl)
		} else {
			setOpenApiUrl('')
		}
	}, [selectedCollection?.openApiUrl, open])

	const handleClose = useCallback(() => {
		setOpenApiUrl('')
		onClose()
	}, [onClose])

	const handleSave = useCallback(() => {
		if (!selectedCollection) return

		onSaveOpenApiUrl(selectedCollection.id, openApiUrl)
		handleClose()
	}, [selectedCollection, openApiUrl, onSaveOpenApiUrl, handleClose])

	const title = useMemo(() => {
		if (!selectedCollection?.name) return 'Collection Settings'
		return `Settings: ${selectedCollection.name}`
	}, [selectedCollection?.name])

	return (
		<Modal
			size="small"
			open={open}
			onClose={handleClose}
			closeOnDimmerClick={false}
			closeOnEscape
			dimmer={isDark ? 'blurring' : 'dimmingLight'}
			className={s.modal}
		>
			<Modal.Header>{title}</Modal.Header>
			<Modal.Content>
				<Form inverted={isDark}>
					<Form.Field>
						<label>OpenAPI / Swagger URL</label>
						<Input
							className={isDark ? s.darkField : undefined}
							placeholder="https://api.example.com/openapi.json"
							value={openApiUrl}
							onChange={(e) => setOpenApiUrl(e.target.value)}
							fluid
						/>
					</Form.Field>
				</Form>
			</Modal.Content>
			<Modal.Actions>
				<Button onClick={handleClose} inverted={isDark}>Cancel</Button>
				<Button primary onClick={handleSave}>
					Save
				</Button>
			</Modal.Actions>
		</Modal>
	)
}
