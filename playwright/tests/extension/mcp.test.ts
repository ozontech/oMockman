import { expect, test } from '../../mcp-fixtures'

test.describe('MCP settings', () => {
	test('rejects an invalid pairing code and accepts a fresh code', async ({ mcp }) => {
		const { setup } = mcp
		await setup.getByRole('textbox', { name: 'MCP code' }).fill('0000000000000000')
		await setup.getByRole('button', { name: 'Pair', exact: true }).click()
		await expect(setup.getByRole('alert')).toContainText('Code rejected')
		expect(await mcp.call('list_connections')).toEqual([])
		await mcp.pair()
		await expect(setup.getByRole('alert')).toHaveCount(0)
	})

	test('keeps the selected tab pending until site access is granted', async ({ mcp }) => {
		const connectionId = await mcp.pair()
		const tab = await mcp.tab('Tasks')
		const select = mcp.setup.getByLabel('MCP tab')
		await select.selectOption(tab.id)
		await expect(mcp.setup.getByRole('alert')).toContainText(mcp.origin)
		await expect(select).toHaveValue(tab.id)
		expect(await mcp.call('list_tabs', { connectionId })).toEqual([])
		// A refresh must not restore the previous selection while the permission banner is shown.
		await mcp.setup.getByRole('button', { name: 'Refresh tabs' }).click()
		await expect(select).toHaveValue(tab.id)
		await mcp.setup.getByRole('button', { name: 'Allow site', exact: true }).click()
		await expect(mcp.setup.getByRole('alert')).toHaveCount(0)
		await expect
			.poll(() => mcp.call('list_tabs', { connectionId }))
			.toEqual([{ tabId: Number(tab.id), origin: mcp.origin }])
		expect(
			await mcp.worker.evaluate(async (origin) => {
				const data = await chrome.storage.local.get('mockman.extension.main.db')
				return (data['mockman.extension.main.db'] as { sitePermissions: Record<string, { grantedOn: number }> })
					.sitePermissions[origin]
			}, mcp.origin),
		).toMatchObject({ grantedOn: expect.any(Number) })
		await mcp.setup.reload()
		await expect(select).toHaveValue(tab.id)
	})

	test('groups tabs by site and allows changing the pinned tab', async ({ mcp }) => {
		const connectionId = await mcp.pair()
		const first = await mcp.tab('First task')
		const second = await mcp.tab('Second task')
		const group = mcp.setup.locator('optgroup')
		await expect(group).toHaveCount(1)
		await expect(group).toHaveAttribute('label', mcp.origin)
		await expect(group.locator('option')).toHaveCount(2)
		const select = mcp.setup.getByLabel('MCP tab')
		await select.selectOption(first.id)
		await mcp.setup.getByRole('button', { name: 'Allow site', exact: true }).click()
		await expect
			.poll(() => mcp.call('list_tabs', { connectionId }))
			.toEqual([{ tabId: Number(first.id), origin: mcp.origin }])
		await select.selectOption(second.id)
		await expect(select).toHaveValue(second.id)
		await expect
			.poll(() => mcp.call('list_tabs', { connectionId }))
			.toEqual([{ tabId: Number(second.id), origin: mcp.origin }])
		await select.selectOption(first.id)
		await expect
			.poll(() => mcp.call('list_tabs', { connectionId }))
			.toEqual([{ tabId: Number(first.id), origin: mcp.origin }])
	})

	test('can stop following the active tab and select a tab manually', async ({ mcp }) => {
		await mcp.pair()
		const first = await mcp.tab('First task')
		const second = await mcp.tab('Second task')
		const select = mcp.setup.getByLabel('MCP tab')
		await select.selectOption(first.id)
		await mcp.setup.getByRole('button', { name: 'Allow site', exact: true }).click()
		const follow = mcp.setup.getByLabel('Follow active tab')
		await follow.click()
		await expect(follow).toBeChecked()
		await second.page.bringToFront()
		await expect(select).toHaveValue(second.id)
		await follow.click()
		await expect(follow).not.toBeChecked()
		await select.selectOption(first.id)
		await expect(select).toHaveValue(first.id)
		await mcp.setup.getByRole('button', { name: 'Refresh tabs' }).click()
		await expect(select).toHaveValue(first.id)
	})

	test('does not expose the privileged panel API to the setup page', async ({
		mcp,
	}) => {
		expect(
			await mcp.setup.evaluate(() =>
				chrome.runtime.sendMessage({ type: 'PANEL_QUERY_TABS', query: {} }),
			),
		).toBeUndefined()
	})

	test('separates write and traffic permissions and revokes access on disconnect', async ({ mcp }) => {
		const connectionId = await mcp.pair()
		const tab = await mcp.tab('Tasks')
		await mcp.setup.getByLabel('MCP tab').selectOption(tab.id)
		await mcp.setup.getByRole('button', { name: 'Allow site', exact: true }).click()
		const writes = mcp.setup.getByLabel('Allow MCP scenario changes')
		const capture = mcp.setup.getByLabel('Allow MCP traffic capture')
		await expect(writes).not.toBeChecked()
		await expect(capture).not.toBeChecked()
		await writes.click()
		await expect(writes).toBeChecked()
		await expect(capture).not.toBeChecked()
		await capture.click()
		await expect(capture).toBeChecked()
		await writes.click()
		await expect(writes).not.toBeChecked()
		await mcp.setup.reload()
		await expect(writes).not.toBeChecked()
		await expect(capture).toBeChecked()
		expect(
			await mcp.call('get_capabilities', { connectionId, tabId: Number(tab.id) }),
		).toMatchObject({ capture: true, mutations: false })
		await mcp.setup.getByRole('button', { name: 'Disconnect and revoke access' }).click()
		await expect(mcp.setup.getByRole('textbox', { name: 'MCP code' })).toBeVisible()
		await expect.poll(() => mcp.call('list_connections')).toEqual([])
	})
})
