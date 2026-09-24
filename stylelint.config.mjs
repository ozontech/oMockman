/** Minimal SCSS linting: parse errors and mistakes that break styles, no cosmetics. */
export default {
	customSyntax: 'postcss-scss',
	rules: {
		'block-no-empty': true,
		'color-no-invalid-hex': true,
		'declaration-block-no-duplicate-properties': [true, { ignore: ['consecutive-duplicates-with-different-values'] }],
		'declaration-block-no-shorthand-property-overrides': true,
		'font-family-no-duplicate-names': true,
		'function-calc-no-unspaced-operator': true,
		'keyframe-declaration-no-important': true,
		'no-duplicate-at-import-rules': true,
		'no-empty-source': true,
		'no-invalid-double-slash-comments': true,
		'no-invalid-position-at-import-rule': true,
		'property-no-unknown': true,
		'selector-pseudo-class-no-unknown': [true, { ignorePseudoClasses: ['global', 'local'] }],
		'selector-pseudo-element-no-unknown': [true, { ignorePseudoElements: ['v-deep'] }],
		'unit-no-unknown': true,
	},
	ignoreFiles: ['**/node_modules/**', 'dist/**', 'coverage/**'],
}
