import type { Plugin as PostcssPlugin } from 'postcss'

/**
 * Drops `@import` rules pointing at an external origin.
 *
 * semantic-ui-css starts with `@import url(https://fonts.googleapis.com/...)` for Lato,
 * which would make every panel fetch a font from a third-party CDN at runtime. Lato is
 * only the first entry of `Lato,'Helvetica Neue',Arial,Helvetica,sans-serif`, so dropping
 * the import falls back to a system font instead of breaking the layout.
 */
export function stripExternalImports(): PostcssPlugin {
	return {
		postcssPlugin: 'mockman-strip-external-imports',
		AtRule: {
			import: (rule) => {
				if (/^\s*(url\()?\s*["']?(https?:)?\/\//i.test(rule.params)) {
					rule.remove()
				}
			},
		},
	}
}
stripExternalImports.postcss = true
