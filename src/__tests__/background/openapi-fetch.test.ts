import { describe, it, expect } from 'vitest'

import {
	isRecord,
	parseSimpleYaml,
	safeAbsoluteUrl,
	getLikelySpecCandidates,
	extractSpecCandidatesFromSwaggerHtml,
	parseSpecCandidate,
	fetchOpenApiSpec,
} from '../../background/openapi-fetch'

describe('isRecord', () => {
	it('returns true for an object', () => {
		expect(isRecord({})).toBe(true)
		expect(isRecord({ foo: 'bar' })).toBe(true)
	})

	it('returns false for null', () => {
		expect(isRecord(null)).toBe(false)
	})

	it('returns false for primitives', () => {
		expect(isRecord('string')).toBe(false)
		expect(isRecord(123)).toBe(false)
		expect(isRecord(true)).toBe(false)
		expect(isRecord(undefined)).toBe(false)
	})

	it('treats an array as an object', () => {
		expect(isRecord([])).toBe(true)
		expect(isRecord([1, 2, 3])).toBe(true)
	})
})

describe('parseSimpleYaml', () => {
	it('parses simple YAML', () => {
		const yaml = `
key: value
name: test
`
		const result = parseSimpleYaml(yaml) as Record<string, unknown>
		expect(result.key).toBe('value')
		expect(result.name).toBe('test')
	})

	it('parses nested objects', () => {
		const yaml = `
parent:
  child: value
`
		const result = parseSimpleYaml(yaml) as Record<string, unknown>
		expect(result.parent).toEqual({ child: 'value' })
	})

	it('parses booleans', () => {
		expect((parseSimpleYaml('enabled: true') as Record<string, unknown>).enabled).toBe(true)
		expect((parseSimpleYaml('disabled: false') as Record<string, unknown>).disabled).toBe(false)
	})

	it('parses numbers', () => {
		expect((parseSimpleYaml('count: 42') as Record<string, unknown>).count).toBe(42)
		expect((parseSimpleYaml('price: 9.99') as Record<string, unknown>).price).toBe(9.99)
	})

	it('parses arrays', () => {
		const result = parseSimpleYaml('items: [a, b, c]') as Record<string, unknown>
		expect(result.items).toEqual(['a', 'b', 'c'])
	})

	it('returns an empty object for an empty string', () => {
		expect(parseSimpleYaml('')).toEqual({})
	})

	it('returns an empty object for a whitespace-only string', () => {
		expect(parseSimpleYaml('   ')).toEqual({})
	})

	it('ignores comments', () => {
		const yaml = `
# This is a comment
key: value
`
		const result = parseSimpleYaml(yaml) as Record<string, unknown>
		expect(result.key).toBe('value')
	})

	it('handles single quotes', () => {
		const result = parseSimpleYaml('key: \'quoted value\'') as Record<string, unknown>
		expect(result.key).toBe('quoted value')
	})

	it('handles double quotes', () => {
		const result = parseSimpleYaml('key: "double quoted"') as Record<string, unknown>
		expect(result.key).toBe('double quoted')
	})

	it('handles a key with a colon and no value', () => {
		const result = parseSimpleYaml('key:') as Record<string, unknown>
		expect(result.key).toEqual({})
	})

	it('handles several nested levels', () => {
		const yaml = `
a:
  b:
    c: value
`
		const result = parseSimpleYaml(yaml) as Record<string, unknown>
		expect(result).toEqual({ a: { b: { c: 'value' } } })
	})

	it('handles a hash inside a value', () => {
		const result = parseSimpleYaml('key: value#withhash') as Record<string, unknown>
		expect(result.key).toBe('value#withhash')
	})
})

describe('safeAbsoluteUrl', () => {
	it('builds an absolute URL from a relative one', () => {
		const result = safeAbsoluteUrl('https://example.com/api', '/swagger.json')
		expect(result).toBe('https://example.com/swagger.json')
	})

	it('returns an absolute URL unchanged', () => {
		const result = safeAbsoluteUrl('https://example.com/api', 'https://other.com/spec.json')
		expect(result).toBe('https://other.com/spec.json')
	})

	it('returns null for an empty string', () => {
		expect(safeAbsoluteUrl('https://example.com', '')).toBe(null)
	})

	it('returns null for a data URL', () => {
		expect(safeAbsoluteUrl('https://example.com', 'data:text/plain,hello')).toBe(null)
	})

	it('handles a relative path in an unusual format', () => {
		const result = safeAbsoluteUrl('https://example.com', '://invalid')
		expect(result).toBe('https://example.com/://invalid')
	})

	it('strips quotes', () => {
		const result = safeAbsoluteUrl('https://example.com', '\'/api/test\'')
		expect(result).toBe('https://example.com/api/test')
	})
})

describe('getLikelySpecCandidates', () => {
	it('returns specific paths for JSON', () => {
		const result = getLikelySpecCandidates('https://api.example.com/openapi.json')
		expect(result).toContain('https://api.example.com/openapi.json')
	})

	it('returns specific paths for YAML', () => {
		const result = getLikelySpecCandidates('https://api.example.com/openapi.yaml')
		expect(result).toContain('https://api.example.com/openapi.yaml')
	})

	it('returns specific paths for YML', () => {
		const result = getLikelySpecCandidates('https://api.example.com/openapi.yml')
		expect(result).toContain('https://api.example.com/openapi.yml')
	})

	it('adds standard paths for swagger ui', () => {
		const result = getLikelySpecCandidates('https://api.example.com/swagger/')
		expect(result).toContain('https://api.example.com/swagger.json')
		expect(result).toContain('https://api.example.com/openapi.json')
		expect(result).toContain('https://api.example.com/v3/api-docs')
	})

	it('adds standard paths for api-docs', () => {
		const result = getLikelySpecCandidates('https://api.example.com/api-docs')
		expect(result).toContain('https://api.example.com/swagger.json')
		expect(result).toContain('https://api.example.com/openapi.json')
	})

	it('returns an empty array for an invalid URL', () => {
		expect(getLikelySpecCandidates('not-a-url')).toEqual([])
	})

	it('always includes the original URL', () => {
		const result = getLikelySpecCandidates('https://api.example.com/custom/path')
		expect(result).toContain('https://api.example.com/custom/path')
	})

	it('adds standard paths for openapi', () => {
		const result = getLikelySpecCandidates('https://api.example.com/openapi/')
		expect(result).toContain('https://api.example.com/swagger.json')
		expect(result).toContain('https://api.example.com/openapi.json')
		expect(result).toContain('https://api.example.com/v3/api-docs')
		expect(result).toContain('https://api.example.com/swagger/v1/swagger.json')
	})

	it('adds standard paths for a URL whose path contains swagger', () => {
		const result = getLikelySpecCandidates('https://api.example.com/my-swagger-page')
		expect(result).toContain('https://api.example.com/swagger.json')
		expect(result).toContain('https://api.example.com/openapi.json')
	})

	it('adds swagger/v1/swagger.json', () => {
		const result = getLikelySpecCandidates('https://api.example.com/')
		expect(result).toContain('https://api.example.com/swagger/v1/swagger.json')
	})
})

describe('extractSpecCandidatesFromSwaggerHtml', () => {
	it('extracts the URL from window.swaggerUrl', () => {
		const html = `
<!DOCTYPE html>
<html lang="">
<body>
<script>
window.swaggerUrl = "/api/swagger.json";
</script>
</body>
</html>
`
		const result = extractSpecCandidatesFromSwaggerHtml(html, 'https://api.example.com/docs')
		expect(result).toContain('https://api.example.com/api/swagger.json')
	})

	it('extracts the URL from window.openapiUrl', () => {
		const html = `
<!DOCTYPE html>
<html lang="">
<body>
<script>
window.openapiUrl = "/v3/api-docs";
</script>
</body>
</html>
`
		const result = extractSpecCandidatesFromSwaggerHtml(html, 'https://api.example.com')
		expect(result).toContain('https://api.example.com/v3/api-docs')
	})

	it('extracts URLs from window.urls', () => {
		const html = `
<!DOCTYPE html>
<html lang="">
<body>
<script>
var urls = [{url: "/specs/api1.json"}, {url: "/specs/api2.json"}];
</script>
</body>
</html>
`
		const result = extractSpecCandidatesFromSwaggerHtml(html, 'https://api.example.com')
		expect(result).toContain('https://api.example.com/specs/api1.json')
		expect(result).toContain('https://api.example.com/specs/api2.json')
	})

	it('adds standard paths', () => {
		const html = '<html lang=""><body></body></html>'
		const result = extractSpecCandidatesFromSwaggerHtml(html, 'https://api.example.com/docs')
		expect(result).toContain('https://api.example.com/swagger.json')
		expect(result).toContain('https://api.example.com/openapi.json')
		expect(result).toContain('https://api.example.com/v3/api-docs')
	})

	it('keeps duplicates', () => {
		const html = `
<!DOCTYPE html>
<html lang="">
<body>
<script>
window.swaggerUrl = "/swagger.json";
</script>
</body>
</html>
`
		const result = extractSpecCandidatesFromSwaggerHtml(html, 'https://api.example.com')
		expect(result).toContain('https://api.example.com/swagger.json')
		const exactMatches = result.filter((r) => r === 'https://api.example.com/swagger.json')
		expect(exactMatches).toHaveLength(1)
	})

	it('extracts the URL from the swaggerUrl = "..." form', () => {
		const html = `
<!DOCTYPE html>
<html lang="">
<body>
<script>
var swaggerUrl = "/v2/api-docs";
</script>
</body>
</html>
`
		const result = extractSpecCandidatesFromSwaggerHtml(html, 'https://api.example.com')
		expect(result).toContain('https://api.example.com/v2/api-docs')
	})

	it('extracts the URL from the openapiUrl = "..." form', () => {
		const html = `
<!DOCTYPE html>
<html lang="">
<body>
<script>
var openapiUrl = "/openapi/v3.json";
</script>
</body>
</html>
`
		const result = extractSpecCandidatesFromSwaggerHtml(html, 'https://api.example.com')
		expect(result).toContain('https://api.example.com/openapi/v3.json')
	})

	it('handles empty HTML', () => {
		const html = ''
		const result = extractSpecCandidatesFromSwaggerHtml(html, 'https://api.example.com')
		expect(result).toContain('https://api.example.com/swagger.json')
		expect(result).toContain('https://api.example.com/openapi.json')
		expect(result).toContain('https://api.example.com/v3/api-docs')
		expect(result).toContain('https://api.example.com/swagger/v1/swagger.json')
	})
})

describe('parseSpecCandidate', () => {
	it('recognises a valid OpenAPI spec', () => {
		const spec = {
			openapi: '3.0.0',
			info: { title: 'Test API', version: '1.0.0' },
			paths: {},
		}
		expect(parseSpecCandidate(JSON.stringify(spec))).toEqual(spec)
	})

	it('recognises a valid Swagger spec', () => {
		const spec = {
			swagger: '2.0',
			info: { title: 'Test API', version: '1.0.0' },
			paths: {},
		}
		expect(parseSpecCandidate(JSON.stringify(spec))).toEqual(spec)
	})

	it('returns null for a spec without paths', () => {
		const spec = {
			openapi: '3.0.0',
			info: { title: 'Test API', version: '1.0.0' },
		}
		expect(parseSpecCandidate(JSON.stringify(spec))).toBeNull()
	})

	it('returns null for invalid JSON', () => {
		expect(parseSpecCandidate('not json')).toBeNull()
	})

	it('returns null for primitives', () => {
		expect(parseSpecCandidate('"just a string"')).toBeNull()
		expect(parseSpecCandidate('123')).toBeNull()
		expect(parseSpecCandidate('true')).toBeNull()
	})
})

describe('fetchOpenApiSpec', () => {
	it('returns an error for an empty URL', async () => {
		const result = await fetchOpenApiSpec('')
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.error).toBe('OpenAPI URL is empty.')
	})

	it('returns an error for a whitespace URL', async () => {
		const result = await fetchOpenApiSpec('   ')
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.error).toBe('OpenAPI URL is empty.')
	})

	it('returns an error for an invalid URL', async () => {
		const result = await fetchOpenApiSpec('not-a-url')
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.error).toBe('OpenAPI URL must be an absolute URL.')
	})

	it('returns an error for the file protocol', async () => {
		const result = await fetchOpenApiSpec('file:///path/to/spec.json')
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.error).toBe('Only http/https OpenAPI URLs are supported.')
	})

	it('returns an error for the ftp protocol', async () => {
		const result = await fetchOpenApiSpec('ftp://example.com/spec.json')
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.error).toBe('Only http/https OpenAPI URLs are supported.')
	})
})
