import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { MessageAPI } from '../../services/message/api'

describe('MessageAPI', () => {
	beforeEach(() => {
		vi.stubGlobal('chrome', {
			runtime: {
				sendMessage: vi.fn(),
			},
		})
	})

	afterEach(() => {
		vi.unstubAllGlobals()
		vi.clearAllMocks()
	})

	describe('notifyUpdateStore', () => {
		it('sends UPDATE_STORE with a tabId', async () => {
			const sendSpy = vi.fn()
			const { MessageService } = await import('../../services/message/index')
			vi.spyOn(MessageService, 'send').mockImplementation(sendSpy)

			MessageAPI.notifyUpdateStore(123)

			expect(sendSpy).toHaveBeenCalledWith({
				message: 'UPDATE_STORE',
				from: 'PANEL',
				to: 'CONTENT',
				type: 'NOTIFICATION',
				id: 123,
			})
		})

		it('sends UPDATE_STORE without a tabId', async () => {
			const sendSpy = vi.fn()
			const { MessageService } = await import('../../services/message/index')
			vi.spyOn(MessageService, 'send').mockImplementation(sendSpy)

			MessageAPI.notifyUpdateStore()

			expect(sendSpy).toHaveBeenCalledWith({
				message: 'UPDATE_STORE',
				from: 'PANEL',
				to: 'CONTENT',
				type: 'NOTIFICATION',
			})
		})
	})

	describe('applyMocksNow', () => {
		it('does nothing when a tabId is given but tabs is undefined', () => {
			vi.stubGlobal('chrome', {
				tabs: undefined,
				runtime: {
					sendMessage: vi.fn(),
				},
			})

			expect(() => MessageAPI.applyMocksNow(123, false)).not.toThrow()
		})
	})

	describe('initFromContent', () => {
		it('sends an INIT message with the host', async () => {
			const sendSpy = vi.fn()
			const { MessageService } = await import('../../services/message/index')
			vi.spyOn(MessageService, 'send').mockImplementation(sendSpy)

			MessageAPI.initFromContent('http://example.com')

			expect(sendSpy).toHaveBeenCalledWith({
				message: 'http://example.com',
				type: 'INIT',
				from: 'CONTENT',
				to: 'PANEL',
			})
		})
	})

	describe('forwardLogToPanel', () => {
		it('forwards a message to the panel', async () => {
			const sendSpy = vi.fn()
			const { MessageService } = await import('../../services/message/index')
			vi.spyOn(MessageService, 'send').mockImplementation(sendSpy)

			const eventMessage = {
				message: { id: 'log-1', request: { url: '/api' } },
				from: 'CONTENT' as const,
				to: 'PANEL' as const,
				type: 'LOG' as const,
				extensionName: 'MOCKMAN' as const,
			}

			MessageAPI.forwardLogToPanel(eventMessage)

			expect(sendSpy).toHaveBeenCalledWith(eventMessage)
		})
	})
})