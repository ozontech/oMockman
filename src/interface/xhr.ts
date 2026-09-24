export type XhrMetadata = {
	method: string
	url: string
	headers: Record<string, string>
	/** false for the deprecated synchronous form of XMLHttpRequest.open */
	async?: boolean
}

export type ApplyMocksPayload = {
	kind: 'APPLY_MOCKS'
	active?: boolean
}
