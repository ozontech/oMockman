# Contributing

Thanks for taking the time to contribute.

## Getting started

```bash
npm ci
npm run build:chrome   # load dist/chrome as an unpacked extension
npm test
```

Node.js 24 is expected (see `.nvmrc`). `make help` lists the common commands.

## Before opening a pull request

- `npm run lint` passes (eslint + TypeScript).
- `npm test` passes, and new behaviour comes with tests.
- `npm run playwright` passes if you touched interception, the bridge or the panel.
- The changelog entry is added under *Unreleased* in `CHANGELOG.md`.

## Ground rules for this codebase

- **Everything is in English**: code, comments, commit messages, documentation.
- **The page world holds no extension data.** Code in `src/inject` runs inside
  the inspected page. It may only receive the answer to the request it asked
  about. If you need more data there, that is a design discussion, not a patch.
- **Messages are untrusted input.** Anything arriving from a page, a content
  script or an imported file is validated before it is used or stored.
- **Outbound requests go through `src/services/net-guard.ts`.** No new `fetch`
  to a user-supplied URL without those checks.
- Keep the diff focused: one concern per pull request.

## Commit messages

Short imperative subject, a body when the reason is not obvious. Do not
reference internal trackers.

## Reporting bugs

Open an issue with the browser and version, what you did, what you expected and
what happened. For security problems, [report them privately](https://github.com/ozontech/oMockman/security/advisories/new)
instead of opening an issue.
