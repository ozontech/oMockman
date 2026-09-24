import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-toastify'

import { useGlobalStore, useChromeStore } from '../store'
import type { VarRow } from '../header/env-button.utils'
import { rowsToVars, toVarRows } from '../header/env-button.utils'

import { describeSaveError, storeActions } from '@/panel/app/service'
import type { IStore } from '@/interface/mock'
import { normalizeEnv } from '@/services/env'
import { genId } from '@/services/helper'

type Env = NonNullable<IStore['env']>
type EnvProfile = Env['profiles'][number]

export interface EnvOption {
	key: string
	value: string
	text: string
}

export interface EnvEditor {
	draft: Env | null
	varsRows: VarRow[]
	saved: boolean
	currentProfile: EnvProfile | null
	envOptions: EnvOption[]
	selectProfile: (id: string) => void
	addProfile: () => void
	removeProfile: () => void
	renameProfile: (name: string) => void
	addVar: () => void
	removeVar: (id: string) => void
	updateVar: (id: string, patch: Partial<Pick<VarRow, 'key' | 'value'>>) => void
	save: () => Promise<boolean>
}

/**
 * Holds the draft of environment profiles and variables in the settings modal:
 * local state, profile and variable CRUD, and saving to the store.
 */
export function useEnvEditor(): EnvEditor {
	const tabId = useGlobalStore((s) => s.meta.tab?.id)
	const { store, setStoreProperties } = useChromeStore((s) => ({
		store: s.store,
		setStoreProperties: s.setStoreProperties,
	}))

	const [draft, setDraft] = useState<Env | null>(null)
	const [varsRows, setVarsRows] = useState<VarRow[]>([])
	const [saved, setSaved] = useState(false)

	useEffect(() => {
		const env = (normalizeEnv(store as IStore).env ?? null) as Env | null
		setDraft(env)
		const current = env?.profiles.find((p) => p.id === env.activeId) ?? env?.profiles[0]
		setVarsRows(toVarRows(current?.vars ?? {}))
		setSaved(false)
	}, [store])

	const currentProfile = useMemo<EnvProfile | null>(() => {
		if (!draft) return null
		return draft.profiles.find((p) => p.id === draft.activeId) ?? draft.profiles[0] ?? null
	}, [draft])

	const envOptions = useMemo<EnvOption[]>(
		() => (draft?.profiles ?? []).map((p) => ({ key: p.id, value: p.id, text: p.name })),
		[draft],
	)

	const setActiveProfileVars = (rows: VarRow[]) => {
		if (!draft) return
		const vars = rowsToVars(rows)
		const profiles = draft.profiles.map((p) => (p.id === draft.activeId ? { ...p, vars } : p))
		setDraft({ ...draft, profiles })
		setVarsRows(rows)
		setSaved(false)
	}

	const selectProfile = (id: string) => {
		if (!draft) return
		const next = { ...draft, activeId: id }
		setDraft(next)
		const profile = next.profiles.find((p) => p.id === id) ?? next.profiles[0]
		setVarsRows(toVarRows(profile?.vars ?? {}))
		setSaved(false)
	}

	const addProfile = () => {
		if (!draft) return
		const id = genId()
		const profiles = [
			...draft.profiles,
			{ id, name: `env-${draft.profiles.length + 1}`, vars: { BASE_URL: '' } },
		]
		setDraft({ ...draft, activeId: id, profiles })
		setVarsRows(toVarRows({ BASE_URL: '' }))
		setSaved(false)
	}

	const removeProfile = () => {
		if (!draft || draft.profiles.length <= 1) return
		const profiles = draft.profiles.filter((p) => p.id !== draft.activeId)
		const activeId = profiles[0]?.id ?? 'default'
		setDraft({ ...draft, profiles, activeId })
		setVarsRows(toVarRows(profiles[0]?.vars ?? {}))
		setSaved(false)
	}

	const renameProfile = (name: string) => {
		if (!draft) return
		const profiles = draft.profiles.map((p) => (p.id === draft.activeId ? { ...p, name } : p))
		setDraft({ ...draft, profiles })
		setSaved(false)
	}

	const addVar = () => setActiveProfileVars([...varsRows, { id: genId(), key: '', value: '' }])

	const removeVar = (id: string) => setActiveProfileVars(varsRows.filter((r) => r.id !== id))

	const updateVar = (id: string, patch: Partial<Pick<VarRow, 'key' | 'value'>>) =>
		setActiveProfileVars(varsRows.map((r) => (r.id === id ? { ...r, ...patch } : r)))

	const save = async (): Promise<boolean> => {
		if (!draft) return false
		try {
			const nextStore = normalizeEnv({ ...(store as IStore), env: draft } as IStore)
			const updated = await storeActions.updateStoreInDB(nextStore)
			setStoreProperties(updated)
			storeActions.refreshContentStore(tabId)
			setSaved(true)
			return true
		} catch (e) {
			const t = useGlobalStore.getState().t
			toast.error(describeSaveError(e, t, t.toast_storageWriteFailed(e instanceof Error ? e.message : 'unknown error')))
			return false
		}
	}

	return {
		draft,
		varsRows,
		saved,
		currentProfile,
		envOptions,
		selectProfile,
		addProfile,
		removeProfile,
		renameProfile,
		addVar,
		removeVar,
		updateVar,
		save,
	}
}
