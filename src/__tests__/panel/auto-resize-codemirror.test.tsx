import { render } from '@testing-library/react'
import React, { Profiler } from 'react'
import { describe, expect, it } from 'vitest'

import { AutoResizeCodeMirror } from '@/panel/app/common/auto-resize-codemirror'

/** Commits of the editor's first mount, cut off at a cap so an endless loop fails instead of hanging. */
function countCommits(node: React.ReactElement, cap = 50): number {
	let commits = 0
	try {
		render(
			<Profiler
				id="editor"
				onRender={() => {
					commits += 1
					if (commits > cap) throw new Error('render loop')
				}}
			>
				{node}
			</Profiler>,
		)
	} catch {
		return Number.POSITIVE_INFINITY
	}
	return commits
}

describe('AutoResizeCodeMirror', () => {
	it('settles without diagnostics: a fresh empty list must not re-render it forever', () => {
		expect(countCommits(<AutoResizeCodeMirror value='{"a":1}' isDark={false} readOnly onChange={() => undefined} />))
			.toBeLessThan(10)
	})

	it('settles with diagnostics passed as undefined', () => {
		expect(countCommits(
			<AutoResizeCodeMirror value='{"a":1}' isDark={false} onChange={() => undefined} externalDiagnostics={undefined} />,
		)).toBeLessThan(10)
	})
})
