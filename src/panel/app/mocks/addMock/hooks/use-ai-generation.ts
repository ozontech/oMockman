import { useCallback, useEffect, useRef, useState } from 'react'

import type {
	AIGenerationMode,
	AIGenerationState,
	IAIChatResponseError,
	IUseAIGenerationInput,
	IUseAIGenerationResult,
} from '@/interface/ai'
import type { ICollectionNode } from '@/interface/collection'
import { aiChat, buildMockGenerationMessages, getActiveAIProvider, getAISettings } from '@/services/ai'
import { isJsonValid, prettifyJson } from '@/services/json'

const initialState: AIGenerationState = { status: 'idle' }

const SUCCESS_DURATION_MS = 1500

// Temperature per generation mode, used only when a schema is present and
// the provider did not set its own: happy/error follow the schema strictly,
// corner needs variety in its mutations.
const MODE_TEMPERATURE: Record<AIGenerationMode, number> = {
	happy: 0.4,
	corner: 0.7,
	error: 0.3,
}

function stripCodeFence(raw: string): string {
	const text = raw.trim()
	const fenceMatch = text.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i)
	if (fenceMatch) return fenceMatch[1].trim()
	return text
}

function describeError(response: IAIChatResponseError): AIGenerationState {
	const { code, message, traceId } = response.error
	switch (code) {
		case 'token_invalid':
			return { status: 'error', message: 'API key is invalid or expired - update it in AI settings', traceId }
		case 'rate_limited':
			return { status: 'error', message: 'Rate limit hit, try again in a moment', traceId }
		case 'network':
			return { status: 'error', message: 'Cannot reach the AI server - check VPN/network', traceId }
		case 'response_truncated':
			return {
				status: 'error',
				message: 'Response was cut off by the token limit - raise maxTokens in the provider settings or simplify the schema',
				traceId,
			}
		case 'aborted':
			return { status: 'error', message: 'Generation was cancelled', traceId }
		case 'provider_misconfigured':
			return { status: 'error', message }
		default:
			return { status: 'error', message: message || 'Generation failed', traceId }
	}
}

/**
 * Backs the Generate button in the mock form.
 * Builds the prompt, sends the request and puts the JSON into the editor.
 */
export function useAIGeneration(input: IUseAIGenerationInput): IUseAIGenerationResult {
	const { store, values, openApiOperation, onResult } = input
	const [state, setState] = useState<AIGenerationState>(initialState)
	const abortRef = useRef<AbortController | null>(null)
	const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

	const clearSuccessTimer = useCallback(() => {
		if (successTimer.current != null) {
			clearTimeout(successTimer.current)
			successTimer.current = null
		}
	}, [])

	useEffect(() => clearSuccessTimer, [clearSuccessTimer])

	const cancel = useCallback(() => {
		abortRef.current?.abort()
		abortRef.current = null
		clearSuccessTimer()
		setState(initialState)
	}, [clearSuccessTimer])

	const clearError = useCallback(() => {
		setState((prev) => (prev.status === 'error' ? initialState : prev))
	}, [])

	const generate = useCallback(async (mode: AIGenerationMode = 'happy') => {
		const provider = getActiveAIProvider(store)
		if (!provider) {
			setState({ status: 'error', message: 'No active AI connection - set one up via the microchip icon in the top bar' })
			return
		}

		const settings = getAISettings(store)
		const collectionId = values.collectionId ?? null
		const collection: ICollectionNode | undefined = collectionId
			? store.collectionTree.nodes[collectionId]
			: undefined

		const promptInput = {
			mock: values,
			mode,
			collection,
			globalSystemPrompt: settings.globalSystemPrompt,
			openApiOperation,
		}

		const controller = new AbortController()
		abortRef.current = controller
		clearSuccessTimer()
		setState({ status: 'generating', phase: 'initial' })

		const options = {
			jsonMode: provider.supportsJsonMode !== false,
			// Schema-driven generation is steadier at a low temperature; corner mode
			// corner needs variety. A provider temperature wins over the mode default.
			temperature: provider.temperature == null && openApiOperation
				? MODE_TEMPERATURE[mode]
				: undefined,
		}

		let response = await aiChat({
			providerId: provider.id,
			messages: buildMockGenerationMessages(promptInput),
			options,
		})

		if (!response.ok && response.error.code === 'response_truncated' && !controller.signal.aborted) {
			setState({ status: 'generating', phase: 'retrying' })
			response = await aiChat({
				providerId: provider.id,
				messages: buildMockGenerationMessages({ ...promptInput, compactRetry: true }),
				options,
			})
		}

		if (controller.signal.aborted) return
		abortRef.current = null

		if (!response.ok) {
			setState(describeError(response))
			return
		}

		const cleaned = stripCodeFence(response.content)
		if (!isJsonValid(cleaned)) {
			setState({
				status: 'error',
				message: 'AI returned invalid JSON (likely cut off) - try again or raise maxTokens',
				traceId: response.traceId,
			})
			return
		}

		onResult(prettifyJson(cleaned))
		setState({ status: 'success' })
		successTimer.current = setTimeout(() => setState(initialState), SUCCESS_DURATION_MS)
	}, [store, values, openApiOperation, onResult, clearSuccessTimer])

	return { state, generate, cancel, clearError }
}
