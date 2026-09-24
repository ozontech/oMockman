export const isReadableStream = (d: unknown): d is ReadableStream =>
	typeof d === 'object' &&
    d !== null &&
    typeof (d as ReadableStream).getReader === 'function'
