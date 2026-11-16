const reasons = {
	connection: 'MCP connection changed or disconnected. Reconnect and list_tabs again.',
	permission: 'The target tab has no grant for this operation. Check tabId and enable the required permission in Mockman. API domains do not need separate grants.',
	tab: 'The target tab closed, changed application origin, or lost its site permission. Refresh list_tabs and verify the application tab.',
} as const

/** Only fixed diagnostic text may leave the extension; never echo URLs or credentials. */
export class McpAccessError extends Error {
	readonly publicMessage: string
	constructor(reason: keyof typeof reasons) {
		super('ACCESS_DENIED')
		this.publicMessage = reasons[reason]
	}
}
