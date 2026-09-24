import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

import { useAIGeneration } from '@/panel/app/mocks/addMock/hooks/use-ai-generation'
import type { IStore, IMockResponseRaw } from '@/interface/mock'
import type { AIChatResponse, IAIProviderConfig, IAISettings } from '@/interface/ai'

const { aiChatMock, getActiveAIProviderMock, getAISettingsMock, buildMessagesMock } = vi.hoisted(() => ({
	aiChatMock: vi.fn<(req: unknown) => Promise<AIChatResponse>>(),
	getActiveAIProviderMock: vi.fn<() => IAIProviderConfig | null>(),
	getAISettingsMock: vi.fn<() => IAISettings>(),
	buildMessagesMock: vi.fn(() => [{ role: 'user', content: 'prompt' }]),
}))

vi.mock('@/services/ai', () => ({
	aiChat: aiChatMock,
	getActiveAIProvider: getActiveAIProviderMock,
	getAISettings: getAISettingsMock,
	buildMockGenerationMessages: buildMessagesMock,
}))

const provider: IAIProviderConfig = {
	id: 'p1',
	name: 'Test',
	baseURL: 'https://example.test',
	apiKey: 'key',
	model: 'm',
	createdOn: 0,
}

const settings: IAISettings = {
	enabled: true,
	activeProviderId: 'p1',
	providers: [provider],
	globalSystemPrompt: undefined,
}

const store = {} as IStore
const values = { collectionId: undefined } as unknown as IMockResponseRaw

function render() {
	const onResult = vi.fn()
	const view = renderHook(() => useAIGeneration({ store, values, onResult }))
	return { ...view, onResult }
}

describe('useAIGeneration', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		getActiveAIProviderMock.mockReturnValue(provider)
		getAISettingsMock.mockReturnValue(settings)
		buildMessagesMock.mockImplementation(() => [{ role: 'user', content: 'prompt' }])
	})

	it('starts idle', () => {
		const { result } = render()
		expect(result.current.state).toEqual({ status: 'idle' })
	})

	it('without an active provider: error, no request sent', async () => {
		getActiveAIProviderMock.mockReturnValue(null)
		const { result, onResult } = render()

		await act(async () => {
			await result.current.generate()
		})

		expect(result.current.state).toMatchObject({
			status: 'error',
			message: expect.stringContaining('No active AI connection'),
		})
		expect(aiChatMock).not.toHaveBeenCalled()
		expect(onResult).not.toHaveBeenCalled()
	})

	it('successful generation: passes JSON to onResult and returns to idle', async () => {
		aiChatMock.mockResolvedValue({ ok: true, content: '{"a":1}', model: 'm' })
		const { result, onResult } = render()

		await act(async () => {
			await result.current.generate('happy')
		})

		expect(onResult).toHaveBeenCalledTimes(1)
		expect(JSON.parse(onResult.mock.calls[0][0] as string)).toEqual({ a: 1 })
		expect(result.current.state).toEqual({ status: 'success' })
	})

	it('success returns to idle on its own', async () => {
		vi.useFakeTimers()
		try {
			aiChatMock.mockResolvedValue({ ok: true, content: '{"a":1}', model: 'm' })
			const { result } = render()

			await act(async () => {
				await result.current.generate()
			})
			expect(result.current.state).toEqual({ status: 'success' })

			act(() => {
				vi.advanceTimersByTime(1500)
			})
			expect(result.current.state).toEqual({ status: 'idle' })
		} finally {
			vi.useRealTimers()
		}
	})

	it('strips a ```json ... ``` markdown wrapper', async () => {
		aiChatMock.mockResolvedValue({ ok: true, content: '```json\n{"a":1}\n```', model: 'm' })
		const { result, onResult } = render()

		await act(async () => {
			await result.current.generate()
		})

		expect(JSON.parse(onResult.mock.calls[0][0] as string)).toEqual({ a: 1 })
	})

	it('makes a compact retry on response_truncated', async () => {
		aiChatMock
			.mockResolvedValueOnce({ ok: false, error: { code: 'response_truncated', message: 'cut off' } })
			.mockResolvedValueOnce({ ok: true, content: '{"a":1}', model: 'm' })
		const { result, onResult } = render()

		await act(async () => {
			await result.current.generate()
		})

		expect(aiChatMock).toHaveBeenCalledTimes(2)
		expect((buildMessagesMock.mock.calls[1] as unknown[])[0]).toMatchObject({ compactRetry: true })
		expect(onResult).toHaveBeenCalledTimes(1)
		expect(result.current.state).toEqual({ status: 'success' })
	})

	it('turns a provider error into a readable state with traceId', async () => {
		aiChatMock.mockResolvedValue({ ok: false, error: { code: 'token_invalid', message: 'bad', traceId: 't1' } })
		const { result, onResult } = render()

		await act(async () => {
			await result.current.generate()
		})

		expect(result.current.state).toMatchObject({
			status: 'error',
			message: expect.stringContaining('API key is invalid'),
			traceId: 't1',
		})
		expect(onResult).not.toHaveBeenCalled()
	})

	it('invalid JSON from the model: error, onResult not called', async () => {
		aiChatMock.mockResolvedValue({ ok: true, content: 'not really json', model: 'm' })
		const { result, onResult } = render()

		await act(async () => {
			await result.current.generate()
		})

		expect(result.current.state).toMatchObject({
			status: 'error',
			message: expect.stringContaining('invalid JSON'),
		})
		expect(onResult).not.toHaveBeenCalled()
	})

	it('cancel during generation drops the answer and resets to idle', async () => {
		let resolveChat!: (r: AIChatResponse) => void
		aiChatMock.mockReturnValue(new Promise<AIChatResponse>((res) => { resolveChat = res }))
		const { result, onResult } = render()

		let genPromise: Promise<void>
		act(() => {
			genPromise = result.current.generate()
		})
		expect(result.current.state).toEqual({ status: 'generating', phase: 'initial' })

		act(() => {
			result.current.cancel()
		})
		expect(result.current.state).toEqual({ status: 'idle' })

		await act(async () => {
			resolveChat({ ok: true, content: '{"a":1}', model: 'm' })
			await genPromise
		})

		// The answer arrived after cancel, so it must not reach the editor.
		expect(onResult).not.toHaveBeenCalled()
		expect(result.current.state).toEqual({ status: 'idle' })
	})

	it('clearError clears only the error state', async () => {
		aiChatMock.mockResolvedValue({ ok: false, error: { code: 'rate_limited', message: 'slow down' } })
		const { result } = render()

		await act(async () => {
			await result.current.generate()
		})
		expect(result.current.state.status).toBe('error')

		act(() => {
			result.current.clearError()
		})
		expect(result.current.state).toEqual({ status: 'idle' })
	})
})
