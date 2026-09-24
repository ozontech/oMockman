import { useEffect } from 'react'

import { useChromeStore } from '../store'

import { storeActions } from '@/panel/app/service'
import { STORE_NAME } from '@/panel/app/service/store-actions'

export function useStorageSync(): void {
	const setStoreProperties = useChromeStore((s) => s.setStoreProperties)

	useEffect(() => {
		function handleChange(
			changes: { [key: string]: chrome.storage.StorageChange },
			areaName: string,
		): void {
			try {
				if (areaName !== 'local') return
				if (!changes || !Object.prototype.hasOwnProperty.call(changes, STORE_NAME)) return
				storeActions.getStore().then(setStoreProperties).catch(() => void 0)
			} catch { void 0 }
		}

		try {
			chrome.storage.onChanged.addListener(handleChange)
		} catch { void 0 }

		return () => {
			try {
				chrome.storage.onChanged.removeListener(handleChange)
			} catch { void 0 }
		}
	}, [setStoreProperties])
}
