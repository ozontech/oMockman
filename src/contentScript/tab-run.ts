import { ScenarioRuntime } from './scenario'
import { ContentScriptState } from './state'

import type { IStore } from '@/interface/mock'
import { getURLMapWithStore } from '@/services/library-read'

export const RUN_LEASE_MS = 45000
interface Run {
	runId: string
	owner: string
	origin: string
	revision: number
	generation: number
	leaseUntil: number
	view: ContentScriptState
	runtime: ScenarioRuntime
}
interface RuntimeMessage {
	action: string
	counters?: 'preserve' | 'reset'
	owner: string
	documentId?: string
	runId?: string
	expectedGeneration?: number
	operationId?: string
	issuedAt?: number
	expiresAt?: number
	fingerprint?: string
	revision?: number
	store?: IStore
	origin?: string
}

/** Temporary top-document overlay. No writes to the persistent library. */
export class TabRun {
	readonly documentId = crypto.randomUUID()
	private run?: Run
	private timer?: ReturnType<typeof setTimeout>
	private receipts = new Map<string, { fingerprint: string; expiresAt: number }>()
	constructor(
		private readonly base: () => ContentScriptState,
		private readonly changed: () => void,
	) {}
	private expire() {
		if (
			this.run &&
			(performance.now() >= this.run.leaseUntil ||
				this.base().origin !== this.run.origin ||
				!this.base().store.sitePermissions?.[this.run.origin])
		)
			this.clear()
	}
	private clear() {
		this.run = undefined
		clearTimeout(this.timer)
		this.changed()
	}
	private renew() {
		if (!this.run) return
		this.run.leaseUntil = performance.now() + RUN_LEASE_MS
		clearTimeout(this.timer)
		this.timer = setTimeout(() => this.expire(), RUN_LEASE_MS + 1)
	}
	view(): ContentScriptState {
		this.expire()
		if (!this.run) return this.base()
		this.run.view.store.sitePermissions = this.base().store.sitePermissions
		return this.run.view
	}
	runtime(): ScenarioRuntime | undefined {
		this.expire()
		return this.run?.runtime
	}
	state(owner: string) {
		this.expire()
		if (this.run && this.run.owner !== owner) throw new Error('TAB_BUSY')
		return {
			kind: 'run_state',
			documentId: this.documentId,
			runId: this.run?.runId ?? null,
			state: this.run ? 'running' : 'stopped',
			appliedRevision: this.run?.revision ?? null,
			generation: this.run?.generation ?? 0,
			counts: this.run?.runtime.counts() ?? {},
		}
	}
	handle(message: RuntimeMessage): unknown {
		this.expire()
		if (message.action === 'state') return this.state(message.owner)
		if (message.documentId !== this.documentId) throw new Error('DOCUMENT_CHANGED')
		if (this.run && this.run.owner !== message.owner) throw new Error('TAB_BUSY')
		if (message.action === 'logs') {
			if (!this.run || message.runId !== this.run.runId) throw new Error('RUN_NOT_FOUND')
			if (message.expectedGeneration !== this.run.generation) throw new Error('GENERATION_CONFLICT')
			return {
				kind: 'request_logs',
				documentId: this.documentId,
				runId: this.run.runId,
				generation: this.run.generation,
				...this.run.runtime.logs(),
			}
		}
		if (message.action === 'renew' || message.action === 'revoke') {
			if (this.run?.runId !== message.runId) throw new Error('RUN_NOT_FOUND')
			if (message.action === 'renew') this.renew()
			else this.clear()
			return this.state(message.owner)
		}
		const now = Date.now()
		if (
			!message.operationId ||
			!message.fingerprint ||
			!Number.isSafeInteger(message.issuedAt) ||
			!Number.isSafeInteger(message.expiresAt) ||
			(message.issuedAt ?? Infinity) > now ||
			(message.expiresAt ?? 0) <= now ||
			(message.expiresAt ?? 0) - (message.issuedAt ?? 0) > 300000
		)
			throw new Error('OPERATION_EXPIRED')
		for (const [key, receipt] of this.receipts)
			if (receipt.expiresAt <= now) this.receipts.delete(key)
		const key = `${message.owner}:${message.operationId}`
		const receipt = this.receipts.get(key)
		if (receipt) {
			if (receipt.fingerprint !== message.fingerprint) throw new Error('OPERATION_ID_REUSED')
			return { ...this.state(message.owner), replayed: true }
		}
		if (this.receipts.size >= 1000) throw new Error('LIMIT_EXCEEDED')
		if (message.action === 'refresh') {
			if (!this.run || message.runId !== this.run.runId) throw new Error('RUN_NOT_FOUND')
			if (message.expectedGeneration !== this.run.generation) throw new Error('GENERATION_CONFLICT')
			if (
				!message.store ||
				message.origin !== this.run.origin ||
				!['preserve', 'reset'].includes(message.counters ?? '')
			)
				throw new Error('INVALID_ARGUMENTS')
			const currentNode = Object.values(this.run.view.store.collectionTree.nodes)[0]
			const nextNode = Object.values(message.store.collectionTree.nodes)[0]
			if (currentNode?.id !== nextNode?.id) throw new Error('INVALID_SCENARIO')
			if (
				message.counters === 'preserve' &&
				(currentNode?.scenario?.enabled || nextNode?.scenario?.enabled) &&
				(JSON.stringify(currentNode?.scenario) !== JSON.stringify(nextNode?.scenario) ||
					JSON.stringify(this.run.view.store.mocks.map((mock) => [mock.id, mock.when])) !==
						JSON.stringify(message.store.mocks.map((mock) => [mock.id, mock.when])))
			)
				throw new Error('COUNTERS_INCOMPATIBLE')
			Object.assign(this.run.view, getURLMapWithStore(structuredClone(message.store)))
			if (message.counters === 'reset') this.run.runtime.reset()
			this.run.revision = message.revision ?? 0
			this.run.generation++
			this.renew()
		} else if (message.action === 'start') {
			if (
				!message.store ||
				!message.origin ||
				message.origin !== this.base().origin ||
				!this.base().store.sitePermissions?.[message.origin]
			)
				throw new Error('ACCESS_DENIED')
			const view = new ContentScriptState()
			Object.assign(view, getURLMapWithStore(structuredClone(message.store)), {
				origin: message.origin,
			})
			this.run = {
				runId: message.operationId,
				owner: message.owner,
				origin: message.origin,
				revision: message.revision ?? 0,
				generation: 0,
				leaseUntil: performance.now() + RUN_LEASE_MS,
				view,
				runtime: new ScenarioRuntime(true),
			}
			this.renew()
		} else {
			if (!this.run || message.runId !== this.run.runId) throw new Error('RUN_NOT_FOUND')
			if (message.expectedGeneration !== this.run.generation) throw new Error('GENERATION_CONFLICT')
			if (message.action === 'reset') {
				this.run.runtime.reset()
				this.run.generation++
				this.renew()
			} else if (message.action === 'stop') this.clear()
			else throw new Error('UNSUPPORTED_CAPABILITY')
		}
		this.changed()
		const result = this.state(message.owner)
		this.receipts.set(key, {
			fingerprint: message.fingerprint,
			expiresAt: message.expiresAt ?? now,
		})
		return result
	}
}
