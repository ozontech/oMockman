/** Where the panel leaves a reset for the pages: every top frame listening starts its counts over. */
export const SCENARIO_RESET_KEY = 'mockman.scenario.reset'

export interface ScenarioResetSignal {
	/** Absent: every collection. */
	collectionId?: string
	/** Makes a repeated reset of the same collection a change too. */
	at: number
}

/**
 * Starts the call counts of a collection scenario (or of all of them) over on every open page.
 * Goes through storage rather than a message to one tab, so it does not depend on which tab the
 * panel thinks it inspects.
 */
export async function resetScenario(collectionId?: string): Promise<boolean> {
	const signal: ScenarioResetSignal = { collectionId, at: Date.now() }
	try {
		await chrome.storage.local.set({ [SCENARIO_RESET_KEY]: signal })
		return true
	} catch {
		return false
	}
}
