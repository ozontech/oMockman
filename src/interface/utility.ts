/** Omit that only accepts keys the type has. */
export type OmitStrict<T, K extends keyof T> = Omit<T, K>
