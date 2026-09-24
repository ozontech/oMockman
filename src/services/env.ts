import type { IStore } from '@/interface/mock'

export type EnvProfile = NonNullable<IStore['env']>['profiles'][number]

const DEFAULT_ENV_ID = 'default'

export function normalizeEnv(store: IStore): IStore {
	const env = store.env
	if (!env || !Array.isArray(env.profiles) || env.profiles.length === 0) {
		return {
			...store,
			env: {
				activeId: DEFAULT_ENV_ID,
				profiles: [
					{
						id: DEFAULT_ENV_ID,
						name: 'default',
						vars: { BASE_URL: '' },
					},
				],
			},
		}
	}

	const profiles = env.profiles.map((p) => ({
		id: String((p as { id?: unknown }).id ?? DEFAULT_ENV_ID),
		name: String((p as { name?: unknown }).name ?? 'env'),
		vars: typeof (p as { vars?: unknown }).vars === 'object' && (p as { vars?: unknown }).vars
			? (p as { vars: Record<string, string> }).vars
			: {},
	}))

	const activeId = profiles.some((p) => p.id === env.activeId) ? env.activeId : profiles[0].id
	return { ...store, env: { activeId, profiles } }
}

export function getActiveEnv(store: IStore): EnvProfile {
	const normalized = normalizeEnv(store)
	const env = normalized.env as NonNullable<IStore['env']>
	return env.profiles.find((p) => p.id === env.activeId) ?? env.profiles[0]
}

export function getActiveEnvVars(store: IStore): Record<string, string> {
	return getActiveEnv(store).vars ?? {}
}

export function resolveTemplate(input: string, vars: Record<string, string>): string {
	const text = String(input ?? '')
	if (!text.includes('{')) return text
	return text.replace(/\{\s*([A-Za-z0-9_]+)\s*\}/g, (_m, name: string) => {
		const key = String(name || '')
		const val = vars?.[key]
		return val == null ? '' : String(val).trim()
	})
}

export function extractTemplateVars(input: string): string[] {
	const text = String(input ?? '')
	if (!text.includes('{')) return []
	const out: string[] = []
	const re = /\{\s*([A-Za-z0-9_]+)\s*\}/g
	let m: RegExpExecArray | null
	while ((m = re.exec(text))) {
		const key = String(m[1] ?? '').trim()
		if (key && !out.includes(key)) out.push(key)
	}
	return out
}
