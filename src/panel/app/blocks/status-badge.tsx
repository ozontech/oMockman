import React from 'react'

import s from './table.module.scss'

import type { StatusBadgeProps } from '@/interface/ui'

const hasStatus = (status?: number): status is number =>
	status !== undefined && status !== null && !Number.isNaN(status) && status > 0

function getClassNameByStatus(status?: number, inverted?: boolean): string {
	if (!hasStatus(status)) return s.statusBadge
	const isOk = status >= 100 && status <= 399
	const isWarn = status >= 400 && status <= 499
	const isError = status >= 500 && status <= 599

	if (inverted) {
		if (isOk) return `${s.statusBadge} ${s.darkOk}`
		if (isWarn) return `${s.statusBadge} ${s.darkWarn}`
		if (isError) return `${s.statusBadge} ${s.darkError}`
		return s.statusBadge
	}

	if (isOk) return `${s.statusBadge} ${s.ok}`
	if (isWarn) return `${s.statusBadge} ${s.warn}`
	if (isError) return `${s.statusBadge} ${s.error}`
	return s.statusBadge
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ value, inverted }) => {
	const className = getClassNameByStatus(value, inverted)
	return <span className={className}>{hasStatus(value) ? value : '-'}</span>
}

