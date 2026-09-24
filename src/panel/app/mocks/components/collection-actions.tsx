import React, { useState } from 'react'
import { Button, Dropdown, Icon, Modal } from 'semantic-ui-react'

import s from './collection-actions.module.scss'

import { useGlobalStore } from '@/panel/app/store'

interface CollectionActionsProps {
	collectionId: string
	collectionName: string
	isDark: boolean
	hasContents: boolean
	canAddSubcollection: boolean
	onAddMock: (collectionId: string) => void
	onAddSubcollection: (collectionId: string) => void
	onExport: (collectionId: string, name: string) => void
	onDelete: (collectionId: string) => void
	onSettings?: (collectionId: string) => void
}

export const CollectionActions: React.FC<CollectionActionsProps> = ({
	collectionId,
	collectionName,
	isDark,
	hasContents,
	canAddSubcollection,
	onAddMock,
	onAddSubcollection,
	onExport,
	onDelete,
	onSettings,
}) => {
	const t = useGlobalStore((s) => s.t)
	const [confirmOpen, setConfirmOpen] = useState(false)

	return (
		<>
			<Button.Group size="mini" inverted={isDark}>
				<Dropdown
					trigger={(
						<Button
							icon
							basic
							color="blue"
							title={t.col_addOptions}
							style={{ marginRight: '2px' }}
						>
							<Icon name="ellipsis horizontal" />
						</Button>
					)}
					icon={null}
					pointing="top right"
					className={s.overflowDropdown}
					onClick={(e) => e.stopPropagation()}
				>
					<Dropdown.Menu>
						<Dropdown.Item
							text={t.col_addMock}
							onClick={(e) => {
								e.stopPropagation()
								onAddMock(collectionId)
							}}
						/>
						{canAddSubcollection ? (
							<Dropdown.Item
								text={t.col_addSub}
								onClick={(e) => {
									e.stopPropagation()
									onAddSubcollection(collectionId)
								}}
							/>
						) : null}
					</Dropdown.Menu>
				</Dropdown>
				{onSettings ? (
					<Button
						icon
						basic
						color="blue"
						title={t.col_editOpenApi}
						onClick={(e) => {
							e.stopPropagation()
							onSettings(collectionId)
						}}
						style={{ margin: '0 1px' }}
					>
						<Icon name="cog" />
					</Button>
				) : null}
				<Button
					icon
					basic
					color="blue"
					title={t.col_export(collectionName)}
					onClick={(e) => {
						e.stopPropagation()
						onExport(collectionId, collectionName)
					}}
					style={{ margin: '0 1px' }}
				>
					<Icon name="download" />
				</Button>
				<Button
					icon
					basic
					color="red"
					title={t.col_delete(collectionName)}
					onClick={(e) => {
						e.stopPropagation()
						if (!hasContents) {
							onDelete(collectionId)
							return
						}
						setConfirmOpen(true)
					}}
					style={{ marginLeft: '2px' }}
				>
					<Icon name="trash" />
				</Button>
			</Button.Group>

			<Modal
				size="tiny"
				open={confirmOpen}
				onClose={() => setConfirmOpen(false)}
				closeOnDimmerClick
				closeOnEscape
				className={s.modal}
			>
				<Modal.Header>{t.col_deleteTitle}</Modal.Header>
				<Modal.Content>
					<p>{t.col_deleteBody(collectionName)}</p>
				</Modal.Content>
				<Modal.Actions>
					<Button onClick={() => setConfirmOpen(false)}>{t.col_cancel}</Button>
					<Button
						negative
						onClick={() => {
							setConfirmOpen(false)
							onDelete(collectionId)
						}}
					>
						{t.col_delete_btn}
					</Button>
				</Modal.Actions>
			</Modal>
		</>
	)
}
