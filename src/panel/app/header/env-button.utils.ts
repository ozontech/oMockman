import { genId } from '@/services/helper'


export type VarRow = { id: string; key: string; value: string }

export function toVarRows(vars: Record<string, string>): VarRow[] {
	const rows: VarRow[] = []
	if (vars && 'BASE_URL' in vars) {
		rows.push({ id: 'BASE_URL', key: 'BASE_URL', value: String(vars.BASE_URL ?? '') })
	}
	for (const [k, v] of Object.entries(vars ?? {})) {
		if (k === 'BASE_URL') continue
		rows.push({ id: genId(), key: String(k), value: String(v ?? '') })
	}
	return rows
}

export function rowsToVars(rows: VarRow[]): Record<string, string> {
	const out: Record<string, string> = {}
	for (const r of rows) {
		const key = String(r.key || '').trim()
		if (!key) continue
		out[key] = String(r.value ?? '').trim()
	}
	return out
}

