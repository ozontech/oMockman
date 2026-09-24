import { safeNumberInt } from '@/services/number'

type KeyEventLike = {
	key?: unknown
	keyCode?: unknown
	which?: unknown
}

type KeyCode = string

const toInt = (v: unknown): number | undefined => {
	if (typeof v !== 'number' && typeof v !== 'string' && typeof v !== 'bigint' && typeof v !== 'boolean') return undefined
	const n = safeNumberInt(v)
	return n == null ? undefined : n
}

const keyboardKey = {
	Backspace: 'Backspace' as KeyCode,
	Enter: 'Enter' as KeyCode,
	Escape: 'Escape' as KeyCode,
	ArrowDown: 'ArrowDown' as KeyCode,
	ArrowUp: 'ArrowUp' as KeyCode,
	Spacebar: 'Spacebar' as KeyCode,

	getCode(e: KeyEventLike): KeyCode {
		const key = e?.key
		if (typeof key === 'string') {
			if (key === ' ' || key === 'Space') return 'Spacebar'
			if (key === 'Esc') return 'Escape'
			return key
		}

		const code = toInt(e?.keyCode ?? e?.which)
		switch (code) {
			case 8:
				return 'Backspace'
			case 13:
				return 'Enter'
			case 27:
				return 'Escape'
			case 32:
				return 'Spacebar'
			case 38:
				return 'ArrowUp'
			case 40:
				return 'ArrowDown'
			default:
				return ''
		}
	},
}

export default keyboardKey
