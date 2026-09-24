export function safeParseJson<T = unknown>(
	input: string | undefined | null,
):
	| { ok: true; value: T }
	| {
		ok: false
		error: string
	} {
	if (input == null) return { ok: true, value: undefined as unknown as T }
	const text = String(input).trim()
	if (text === '') return { ok: true, value: undefined as unknown as T }
	try {
		return { ok: true, value: JSON.parse(text) as T }
	} catch (e) {
		return { ok: false, error: (e as Error).message }
	}
}

export function isJsonValid(input: string): boolean {
	const res = safeParseJson(input)
	return res.ok
}

function normalizeJsonLikeInput(input: string): string {
	let text = input

	text = text.replace(/,\s*([}\]])/g, '$1')

	text = text.replace(/([{,]\s*)([A-Za-z_$][\w$-]*)(\s*:)/g, '$1"$2"$3')

	text = text.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, inner: string) => {
		const unescapedSingleQuote = inner.replace(/\\'/g, '\'')
		const escapedDoubleQuote = unescapedSingleQuote.replace(/"/g, '\\"')
		return `"${escapedDoubleQuote}"`
	})

	text = text.replace(
		/(:\s*)([^,\]}\n\r]+)(\s*[,}\]])/g,
		(_, prefix: string, rawValue: string, suffix: string) => {
			const value = String(rawValue).trim()
			if (!value) return `${prefix}${rawValue}${suffix}`

			if (
				value.startsWith('"') ||
				value.startsWith('\'') ||
				value.startsWith('{') ||
				value.startsWith('[')
			) {
				return `${prefix}${rawValue}${suffix}`
			}

			if (/^(true|false|null)$/i.test(value)) {
				return `${prefix}${rawValue}${suffix}`
			}

			if (/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)) {
				return `${prefix}${rawValue}${suffix}`
			}

			const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
			return `${prefix}"${escaped}"${suffix}`
		},
	)

	return text
}

function parseJsonWithFallback(input: string): unknown {
	try {
		return JSON.parse(input)
	} catch {
		const candidate = normalizeJsonLikeInput(input)
		return JSON.parse(candidate)
	}
}

export function prettifyJson(input: string): string {
	const text = String(input ?? '')

	let source = text
	try {
		parseJsonWithFallback(text)
	} catch {
		return input
	}

	try {
		source = JSON.stringify(parseJsonWithFallback(text))
	} catch {
		source = text
	}

	let result = ''
	let indent = 0
	let inString = false
	let isEscaped = false

	const repeatIndent = (level: number): string => '  '.repeat(Math.max(0, level))

	for (const char of source) {
		if (isEscaped) {
			result += char
			isEscaped = false
			continue
		}

		if (char === '\\') {
			result += char
			isEscaped = inString
			continue
		}

		if (char === '"') {
			inString = !inString
			result += char
			continue
		}

		if (inString) {
			result += char
			continue
		}

		switch (char) {
			case '{':
			case '[':
				result += `${char}\n${repeatIndent(indent + 1)}`
				indent += 1
				break
			case '}':
			case ']':
				indent = Math.max(indent - 1, 0)
				result += `\n${repeatIndent(indent)}${char}`
				break
			case ',':
				result += `${char}\n${repeatIndent(indent)}`
				break
			case ':':
				result += ': '
				break
			case ' ':
			case '\t':
			case '\n':
			case '\r':
				break
			default:
				result += char
		}
	}

	return result
}
