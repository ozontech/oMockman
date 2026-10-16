export type CollectionEntryType = 'collection' | 'mock'

export interface ICollectionEntry {
	id: string
	type: CollectionEntryType
}

/**
 * One call of an endpoint: the Nth rule of METHOD + URL answers its Nth call, with a mock of the
 * collection or the real response. The endpoint's last rule answers every later call too.
 */
export interface IScenarioRule {
	id: string
	method: string
	/** A template like a mock URL: env variables and `:params` work. */
	url: string
	respond: { mockId: string } | { network: true }
}

/** Lets one endpoint answer differently call after call. */
export interface ICollectionScenario {
	enabled: boolean
	rules: IScenarioRule[]
}

export interface ICollectionNode {
	id: string
	name: string
	parentId: string | null
	active: boolean
	createdOn: number
	description?: string
	aiPrompt?: string
	scenario?: ICollectionScenario
	entries: ICollectionEntry[]
}

export interface ICollectionTree {
	nodes: Record<string, ICollectionNode>
	root: ICollectionEntry[]
}

export const ROOT_COLLECTION_ID = 'root'

export function createEmptyCollectionTree(): ICollectionTree {
	return { nodes: {}, root: [] }
}

