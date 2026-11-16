import React, { useEffect, useMemo } from 'react'
import { Dropdown, Form } from 'semantic-ui-react'

import s from './collection-select.module.scss'

import type { ICollectionEntry, ICollectionTree } from '@/interface/collection'
import { useGlobalStore } from '@/panel/app/store'

export function buildCollectionOptions(tree: ICollectionTree): Array<{ key: string; value: string; text: string; title: string }> {
	const options: Array<{ key: string; value: string; text: string; title: string }> = []
	const visited = new Set<string>()
	const visit = (entries: ICollectionEntry[], parentPath: string): void => {
		for (const entry of entries) {
			if (entry.type !== 'collection' || visited.has(entry.id)) continue
			const node = tree.nodes[entry.id]
			if (!node) continue
			visited.add(node.id)
			const path = parentPath ? `${parentPath}/${node.name}` : node.name
			options.push({ key: node.id, value: node.id, text: path, title: path })
			visit(node.entries, path)
		}
	}
	visit(tree.root, '')
	return options
}

export function CollectionSelect({ tree, value, onChange }: {
	tree: ICollectionTree
	value?: string | null
	onChange: (collectionId: string | null) => void
}): React.ReactElement {
	const t = useGlobalStore((state) => state.t)
	const isDark = useGlobalStore((state) => state.resolvedScheme === 'dark')
	const options = useMemo(() => buildCollectionOptions(tree), [tree])
	const selected = options.find((option) => option.value === value)

	useEffect(() => {
		if (value && !selected) onChange(null)
	}, [value, selected, onChange])

	return (
		<Form.Field className={`${s.field} ${isDark ? s.dark : ''}`}>
			<label>{t.mock_fieldCollection}</label>
			<Dropdown
				fluid
				selection
				clearable
				selectOnBlur={false}
				search={(items, query) => items.filter((item) => String(item.text).toLowerCase().includes(query.trim().toLowerCase()))}
				options={options}
				value={selected?.value ?? ''}
				onChange={(_, data) => onChange(typeof data.value === 'string' && data.value ? data.value : null)}
				placeholder={t.mock_noCollection}
				noResultsMessage={t.mock_collectionNoResults}
				aria-label={t.mock_fieldCollection}
				searchInput={{ 'aria-label': t.mock_fieldCollection }}
				title={selected?.text}
				className={s.select}
				data-testid="mock-collection-select"
			/>
		</Form.Field>
	)
}
