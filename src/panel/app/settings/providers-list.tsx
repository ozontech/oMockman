import React, { useState } from 'react'
import { Button, Icon, Radio } from 'semantic-ui-react'

import { useGlobalStore } from '../store'

import s from './settings.module.scss'

import type { IProvidersListProps } from '@/interface/ai'

export const ProvidersList: React.FC<IProvidersListProps> = ({
	providers,
	activeProviderId,
	onSelectActive,
	onEdit,
	onRemove,
	isDark,
}) => {
	const t = useGlobalStore((s) => s.t)
	const [confirmingId, setConfirmingId] = useState<string | null>(null)

	return (
		<ul className={s.providersList}>
			{providers.map((provider) => {
				const isActive = provider.id === activeProviderId
				const needsKey = !provider.apiKey.trim()
				return (
					<li key={provider.id} className={`${s.providerItem} ${isActive ? s.providerItemActive : ''}`} onClick={() => onSelectActive(provider.id)} style={{ cursor: 'pointer' }}>
						<Radio
							name="active-provider"
							checked={isActive}
							onChange={() => onSelectActive(provider.id)}
							label=""
							aria-label={`Use ${provider.name} for generation`}
						/>

						<div className={s.providerMain}>
							<div className={s.providerName}>
								{provider.name}
								{isActive ? <span className={s.providerActiveBadge}>{t.provider_inUse}</span> : null}
							</div>
							<div className={s.providerMeta}>
								<span className={s.providerModel}>{provider.model}</span>
							</div>
							{needsKey ? (
								<div className={s.providerWarning}>
									<Icon name="warning sign" />
									{t.provider_noKey}
								</div>
							) : null}
						</div>

						<div className={s.providerActions} onClick={(e) => e.stopPropagation()}>
							<Button
								icon
								type="button"
								basic
								size="mini"
								inverted={isDark}
								onClick={() => onEdit(provider)}
								title={t.provider_edit}
							>
								<Icon name="edit" />
							</Button>
							{confirmingId === provider.id ? (
								<>
									<Button
										icon
										type="button"
										basic
										size="mini"
										inverted={isDark}
										color="red"
										onClick={() => {
											onRemove(provider)
											setConfirmingId(null)
										}}
										title={t.provider_removeConfirm(provider.name)}
									>
										<Icon name="check" />
									</Button>
									<Button
										icon
										type="button"
										basic
										size="mini"
										inverted={isDark}
										onClick={() => setConfirmingId(null)}
										title={t.ai_cancel}
									>
										<Icon name="close" />
									</Button>
								</>
							) : (
								<Button
									icon
									type="button"
									basic
									size="mini"
									inverted={isDark}
									color="red"
									onClick={() => setConfirmingId(provider.id)}
									title={t.provider_remove}
								>
									<Icon name="trash" />
								</Button>
							)}
						</div>
					</li>
				)
			})}
		</ul>
	)
}
