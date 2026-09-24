import type { IAISettings } from './ai'
import type { ICollectionTree } from './collection'
import type { IMethod, MethodEnum } from './network'

export type Headers = Array<{ name: string; value: string }>

export interface ILog {
	request?: {
		url: string
		method: IMethod
		body?: string
		/** The body was over MAX_BODY_BYTES and was not captured. */
		bodyTooLarge?: boolean
		bodySize?: number
		queryParams?: string
		headers: Headers
	}
	response?: {
		status: number
		response: string
		headers: Headers
		/** The body was over MAX_BODY_BYTES and was not captured. */
		tooLarge?: boolean
		size?: number
	}
	mockResponse?: IMockResponse
	id?: number | string
	isMocked?: boolean

	mockPath?: string
}

export interface IMockResponse {
	/** Draft only, never persisted: the source log's response was too large to capture. */
	responseTooLargeBytes?: number
	method: MethodEnum
	createdOn: number
	url: string
	openApiUrl?: string
	status: number
	response?: string
	headers?: Headers
	delay?: number
	id: string
	dynamic?: boolean
	active: boolean
	description: string
	name?: string
	collectionId?: string | null
	action?: (req: {
		body: Record<string, unknown>
		params: Record<string, unknown>
		queryParams: Record<string, unknown>
	}) => IMockResponse['response']
}

export type IMockResponseRaw = Partial<IMockResponse>

export interface IStore {
	active: boolean
	theme: 'dark' | 'light'
	mocks: IMockResponse[]
	totalMocksCreated: number
	activityInfo: {
		promoted: boolean
	}
	collectionTree: ICollectionTree
	env?: {
		activeId: string
		profiles: Array<{
			id: string
			name: string
			vars: Record<string, string>
		}>
	}
	ai?: IAISettings
	security?: {
		/** Lets the OpenAPI loader reach localhost and private addresses. */
		allowLocalOpenApi?: boolean
	}
	/**
	 * Origins the user allowed Mockman on ("https://site.ru", default port dropped); the key
	 * being present is the grant. A mock is served only where it was allowed, so a page cannot
	 * read mock bodies by guessing internal URLs.
	 */
	sitePermissions?: {
		[origin: string]: {
			grantedOn: number
		}
	}
	/** Allow every site without asking, recording each one as it is first seen. */
	autoGrantSites?: boolean
}

export interface IURLMap {
	[url: string]: {
		[method: string]: string[]
	}
}

export interface IDynamicURLMap {
	[urlLength: number]: Array<{
		match: (
			s: string,
		) => boolean | { path: string; params: Record<string, string> }
		method: string
		getterKey: string
		url: string
	}>
}

export interface IRequestCore {
	url: string
	method: string
	headers: Record<string, string>
	body?: unknown
}
