import { afterEach, describe, expect, it, vi } from 'vitest'

async function load(ext: unknown) {
	vi.resetModules()
	vi.stubGlobal('browser', undefined)
	vi.stubGlobal('chrome', ext)
	return import('@/panel/app/service/tab-message')
}

afterEach(() => {
	vi.unstubAllGlobals()
	vi.resetModules()
})

describe('messageTopFrame', () => {
	it('messages the tab itself when the tabs API is there', async () => {
		const sendMessage = vi.fn((_tabId: number, _message: unknown, _options: unknown, cb: (value: unknown) => void) => cb({ done: 1 }))
		const { messageTopFrame } = await load({ runtime: {}, tabs: { sendMessage } })

		await expect(messageTopFrame(5, { type: 'X' })).resolves.toEqual({ ok: true, value: { done: 1 } })
		expect(sendMessage).toHaveBeenCalledWith(5, { type: 'X' }, { frameId: 0 }, expect.any(Function))
	})

	it('goes through the background when the tabs API is missing, as in Firefox DevTools', async () => {
		const sendMessage = vi.fn().mockResolvedValue({ ok: true, value: { done: 2 } })
		const { messageTopFrame } = await load({ runtime: { sendMessage } })

		await expect(messageTopFrame(5, { type: 'X' })).resolves.toEqual({ ok: true, value: { done: 2 } })
		expect(sendMessage).toHaveBeenCalledWith({ type: 'PANEL_SEND_TO_TAB', tabId: 5, message: { type: 'X' } })
	})

	it('hands the background error through, and survives having no runtime at all', async () => {
		const sendMessage = vi.fn().mockResolvedValue({ ok: false, error: 'No connection to the page' })
		const { messageTopFrame } = await load({ runtime: { sendMessage } })
		await expect(messageTopFrame(5, { type: 'X' })).resolves.toEqual({ ok: false, error: 'No connection to the page' })

		const bare = await load({})
		await expect(bare.messageTopFrame(5, { type: 'X' })).resolves.toEqual({ ok: false, error: 'runtime.sendMessage is not available' })
	})
})
