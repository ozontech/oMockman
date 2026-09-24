export type CollectionEntryType = 'collection' | 'mock'

export interface ICollectionEntry {
	id: string
	type: CollectionEntryType
}

export interface ICollectionNode {
	id: string
	name: string
	parentId: string | null
	active: boolean
	createdOn: number
	description?: string
	openApiUrl?: string
	aiPrompt?: string
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

