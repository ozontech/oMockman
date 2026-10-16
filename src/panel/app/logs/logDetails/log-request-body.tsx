import React from 'react'

import { useGlobalStore } from '../../store'

import s from './log-details.module.scss'
import { LogDetailsJson } from './log-details-json'

import type { ILog } from '@/interface/mock'

/** The sent body, and for a patched request the page's original body under it. */
export const LogRequestBody: React.FC<{ log: ILog; isPending: boolean }> = ({ log, isPending }) => {
	const t = useGlobalStore((st) => st.t)
	const sent = (
		<LogDetailsJson
			isRequestPending={isPending}
			response={log.request?.body}
			tooLargeBytes={log.request?.bodyTooLarge ? (log.request.bodySize ?? 0) : undefined}
		/>
	)
	if (!log.isPatched) return sent

	return (
		<>
			<div className={s.bodyCaption} data-testid="log-sent-body-caption">{t.logDetail_sentBody}</div>
			{sent}
			<div className={s.bodyCaption}>{t.logDetail_originalBody}</div>
			<LogDetailsJson isRequestPending={isPending} response={log.request?.originalBody ?? ''} />
		</>
	)
}
