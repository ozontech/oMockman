const getExtensionOrigin = (): string => {
	type Runtime = { getURL?: (path: string) => string }
	const runtime = (globalThis as unknown as { chrome?: { runtime?: Runtime } }).chrome?.runtime
		?? (globalThis as unknown as { browser?: { runtime?: Runtime } }).browser?.runtime

	try {
		return runtime?.getURL?.('/') ?? ''
	} catch {
		return ''
	}
}

export const IS_FIREFOX = getExtensionOrigin().startsWith('moz-extension://')
