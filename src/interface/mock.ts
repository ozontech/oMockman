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
		/** The body the page sent, when a request patch replaced it; `body` is what went out. */
		originalBody?: string
		queryParams?: string
		headers: Headers
	}
	response?: {
		status: number
		response: string
		headers: Headers
		/** The body was over MAX_BODY_BYTES and was not captured. */
		tooLarge?: boolean
		/** The body is binary (a blob, an arraybuffer or a document) and was not captured. */
		binary?: boolean
		size?: number
	}
	mockResponse?: IMockResponse
	id?: number | string
	/** When the request was caught (its log written), ms since epoch. */
	time?: number
	isMocked?: boolean
	/** The request went to the network, and Mockman changed its body or the response headers. */
	isPatched?: boolean
	/** Mock headers were set on the real response: the log shows them, not the network's. */
	headersPatched?: boolean
	/** The request went out with the mock's body instead of the page's. */
	requestPatched?: boolean
	/** Sent from the panel through the page, not by the page itself. */
	sentByMockman?: boolean
	/** The collection scenario rule that answered the request. */
	scenario?: {
		collectionName: string
		/** Which call of the endpoint this was, counted from the scenario start. */
		callNumber: number
		/** The rule let the real request through instead of serving a mock. */
		network: boolean
	}

	mockPath?: string
}

/**
 * `replace` sends `body` as is. `merge` applies `body` to the page's JSON body as a JSON Merge
 * Patch (RFC 7386): fields are set, `null` removes one, nested objects merge.
 */
export type RequestPatchMode = 'replace' | 'merge'

export interface IRequestPatch {
	mode: RequestPatchMode
	body: string
}

/**
 * What a mock changes. The request body goes with neither response part: a served response never
 * reaches the network. Response headers alone are set on the real response.
 */
export interface IMockApply {
	responseBody: boolean
	responseHeaders: boolean
	requestBody: boolean
}

export interface IMockResponse {
	/** Draft only, never persisted: the source log's response was too large to capture. */
	responseTooLargeBytes?: number
	method: MethodEnum
	/** When the mock was made in the panel. Optional: an imported mock keeps what its file says, or none. */
	createdOn?: number
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
	/** Missing on mocks saved before it existed: see resolveMockApply. */
	apply?: IMockApply
	/** The body sent instead of the page's when `apply.requestBody` is on; kept as a draft when off. */
	requestPatch?: IRequestPatch
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
