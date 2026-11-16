# Mockman automation protocol

Browser-independent contract v1 shared by the extension and MCP server. This
workspace contains JSON Schema Draft 7 definitions, runtime validation, TypeScript
types, example bundles and a synthetic HTTP fixture. It has no browser API or
React dependencies. Schema IDs are identifiers; validation does not fetch them.

From the repository root:

```sh
npm ci
npm run test:protocol
```

See `schemas/bundle.json`, `schemas/command.json` and `schemas/result.json` for the
contract, and `examples/` for fixed, conditional and sequential responses.
Transport code must enforce byte limits before decoding JSON. Mutation commands
include a library revision and an expiring operation ID for idempotent retries.

The HTTP fixture in `fixture/server.js` supplies local synthetic endpoints for
browser tests. No production accounts, service addresses or captured data are used.
