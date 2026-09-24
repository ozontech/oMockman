import { Decoration, EditorView } from '@codemirror/view'
import { RangeSetBuilder, StateEffect, StateField } from '@codemirror/state'

export const setFindDecos = StateEffect.define<{ ranges: Array<{ from: number; to: number }>; current: number }>()

export const findDecoField = StateField.define({
	create() {
		return Decoration.none
	},
	update(value, tr) {
		for (const e of tr.effects) {
			if (e.is(setFindDecos)) {
				const { ranges, current } = e.value
				if (!ranges?.length) return Decoration.none
				const builder = new RangeSetBuilder<Decoration>()
				for (const r of ranges) {
					builder.add(r.from, r.to, Decoration.mark({ class: 'mm-find-match' }))
				}
				const idx = Math.max(0, Math.min(current, ranges.length - 1))
				const cur = ranges[idx]
				if (cur) {
					builder.add(cur.from, cur.to, Decoration.mark({ class: 'mm-find-match-current' }))
				}
				return builder.finish()
			}
		}
		if (tr.docChanged) return Decoration.none
		return value
	},
	provide: (f) => EditorView.decorations.from(f),
})
