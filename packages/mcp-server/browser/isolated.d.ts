/** Temporary extension copy and broker used only by browser integration tests. */
export function isolatedRuntime(
	directory: string,
	browser: 'chrome' | 'firefox',
): Promise<{
	extensionPath: string
	entrypoint: string
	close(): Promise<void>
}>
