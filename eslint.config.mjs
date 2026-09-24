// @ts-check
import js from '@eslint/js'
import vitest from '@vitest/eslint-plugin'
import importPlugin from 'eslint-plugin-import'
import react from 'eslint-plugin-react'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
	{
		ignores: [
			'test-results/',
			'playwright-report/',
			'playwright/.auth/',
			'allure-results/',
			'**/coverage/',
			'**/dist/',
			'**/node_modules/',
			'src/vendor/**',
		],
	},

	js.configs.recommended,
	...tseslint.configs.recommended,

	{
		files: ['**/*.{ts,tsx,mts,cts,js,mjs,cjs}'],
		languageOptions: {
			ecmaVersion: 'latest',
			sourceType: 'module',
			globals: {
				...globals.browser,
				...globals.node,
				...globals.webextensions,
			},
		},
		plugins: {
			import: importPlugin,
		},
		settings: {
			'import/resolver': {
				typescript: {
					project: ['./tsconfig.json', './tsconfig.playwright.json'],
					noWarnOnMultipleProjects: true,
				},
			},
		},
		rules: {
			// Security-relevant: no code built from strings.
			'no-eval': 'error',
			'no-implied-eval': 'error',
			'no-new-func': 'error',
			'no-script-url': 'error',

			'no-var': 'error',
			'prefer-const': 'error',
			'no-debugger': 'error',
			'no-else-return': ['error', { allowElseIf: true }],
			'no-implicit-coercion': ['error', { allow: ['!!'] }],
			'no-empty': ['error', { allowEmptyCatch: false }],

			'@typescript-eslint/consistent-type-imports': 'error',
			'@typescript-eslint/no-import-type-side-effects': 'error',
			'@typescript-eslint/no-explicit-any': 'warn',
			'@typescript-eslint/no-non-null-assertion': 'warn',
			'@typescript-eslint/no-unused-vars': 'warn',
			'@typescript-eslint/no-unused-expressions': ['warn', { allowShortCircuit: true, allowTernary: true }],

			'import/no-duplicates': 'warn',
			'import/consistent-type-specifier-style': ['error', 'prefer-top-level'],
			'import/order': ['error', {
				'newlines-between': 'always',
				pathGroupsExcludedImportTypes: [],
				distinctGroup: true,
			}],
		},
	},

	{
		files: ['**/*.tsx'],
		plugins: { react },
		settings: { react: { version: 'detect' } },
		rules: {
			...react.configs.flat.recommended.rules,
			'react/react-in-jsx-scope': 'off',
			'react/prop-types': 'off',
			// Security-relevant: no raw HTML injection, no reverse tabnabbing.
			'react/no-danger': 'error',
			'react/jsx-no-target-blank': 'error',
			'react/jsx-no-script-url': 'error',
			'react/jsx-max-depth': ['error', { max: 5 }],
		},
	},

	{
		files: ['src/**/__tests__/**', 'src/**/*.test.{ts,tsx}'],
		plugins: { vitest },
		languageOptions: { globals: { ...vitest.environments.env.globals } },
		rules: {
			...vitest.configs.recommended.rules,
			// `if (!result.ok) return` is how the tests narrow discriminated unions.
			'vitest/no-conditional-expect': 'off',
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/no-non-null-assertion': 'off',
		},
	},
)
