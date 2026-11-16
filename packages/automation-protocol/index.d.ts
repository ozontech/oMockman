export interface MockConditions {
	query?: Record<string, string>
	params?: Record<string, string>
	body?: Array<{ path: string[]; equals: unknown }>
}
export interface ScenarioBundle {
	task?: { key: string; name: string }
	scenarioKey: string
	collection: { name: string }
	mocks: Array<{
		key: string
		method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
		url: string
		name?: string
		enabled?: boolean
		priority?: number
		when?: MockConditions
		response: {
			status: number
			headers: Array<{ name: string; value: string }>
			body: string
			delayMs?: number
		}
	}>
	scenario: {
		enabled: boolean
		rules: Array<{
			key: string
			method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
			url: string
			respond: { mockKey: string } | { network: true }
		}>
	}
}
export interface ValidationResult {
	valid: boolean
	errors: Array<{ path: string; message: string }>
}
export const PROTOCOL_VERSION: number
export const LIMITS: Readonly<{ commandBytes: number; operationTtlMs: number }>
export const schemas: { bundle: object; command: object; result: object }
export function validateBundle(bundle: unknown): ValidationResult
export function validateCommand(command: unknown, now?: number): ValidationResult
export function validateResult(result: unknown): ValidationResult
