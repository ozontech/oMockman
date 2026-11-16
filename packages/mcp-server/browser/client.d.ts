export function browserTestClient(entrypoint: string): Promise<{
	call(name: string, args?: Record<string, unknown>): Promise<unknown>
	close(): Promise<void>
}>
