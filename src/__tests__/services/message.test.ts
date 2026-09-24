import { describe, it, expect, vi, afterEach } from 'vitest'

import { send, listen, MessageService } from '../../services/message'

vi.stubGlobal('chrome', {
	runtime: {
		sendMessage: vi.fn(),
		connect: vi.fn(() => ({ postMessage: vi.fn() })),
		onMessage: {
			addListener: vi.fn(),
			removeListener: vi.fn(),
		},
	},
})

describe('services/message: send', () => {
	afterEach(() => {
		vi.clearAllMocks()
	})

	it('sends known routes through chrome.runtime.sendMessage', () => {
		const runtimeSpy = vi.spyOn(chrome.runtime, 'sendMessage').mockImplementation(vi.fn())
		send({ to: 'CONTENT', from: 'PANEL', message: {} })
		expect(runtimeSpy).toHaveBeenCalled()
	})

	it('never posts extension messages on the page window channel', () => {
		const postMessageSpy = vi.spyOn(window, 'postMessage').mockImplementation(vi.fn())
		send({ to: 'CONTENT', from: 'PANEL', message: { data: 1 } })
		send({ to: 'PANEL', from: 'CONTENT', message: { data: 1 } })
		expect(postMessageSpy).not.toHaveBeenCalled()
	})

	it('drops messages for unknown routes', () => {
		const runtimeSpy = vi.spyOn(chrome.runtime, 'sendMessage').mockImplementation(vi.fn())
		send({ to: 'BACKGROUND', from: 'PANEL', message: {} })
		expect(runtimeSpy).not.toHaveBeenCalled()
	})

	it('adds extensionName to the envelope', () => {
		const runtimeSpy = vi.spyOn(chrome.runtime, 'sendMessage').mockImplementation(vi.fn())
		send({ to: 'CONTENT', from: 'PANEL', message: {} })
		expect(runtimeSpy).toHaveBeenCalledWith(
			expect.objectContaining({ extensionName: 'MOCKMAN' }),
			expect.any(Function),
		)
	})
})

describe('services/message: listen', () => {
	afterEach(() => {
		vi.clearAllMocks()
	})

	it('subscribes to chrome.runtime messages only', () => {
		const addEventListenerSpy = vi.spyOn(window, 'addEventListener').mockImplementation(vi.fn())
		listen('PANEL', vi.fn())
		expect(chrome.runtime.onMessage.addListener).toHaveBeenCalled()
		expect(addEventListenerSpy).not.toHaveBeenCalledWith('message', expect.any(Function))
	})

	it('returns a cleanup function', () => {
		const removeListenerSpy = vi.spyOn(chrome.runtime.onMessage, 'removeListener')

		const cleanup = listen('PANEL', vi.fn())
		cleanup()

		expect(removeListenerSpy).toHaveBeenCalled()
	})
})

describe('services/message: MessageService', () => {
	it('exports send and listen', () => {
		expect(MessageService.send).toBeDefined()
		expect(MessageService.listen).toBeDefined()
		expect(typeof MessageService.send).toBe('function')
		expect(typeof MessageService.listen).toBe('function')
	})
})
