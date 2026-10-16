# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.4.0]

### Added

- Request-body mocking: each mock part (response body, response headers, request body) has its own
  toggle; with the request body on, the page's request goes to the server with the body from the
  mock and the page receives the real response. AI generation and OpenAPI validation cover the
  request body too.
- Headers-only mode: mock headers are laid over the real response.
- Sending a request from the panel ("Send again" in Logs, "Send now" in the mock form): the request
  goes out from the page context with its cookies, the response is shown in place and logged.
- Collection scenarios: rules "request → response" answer one endpoint call after call; the last
  rule repeats, "From the server" lets the real response through; the call count resets on page
  reload, from the collection settings or by the badge in the mocks table.
- Date columns ("Time" in Logs, "Created" in Mocks), typed icons in Logs (mocked / patched / sent /
  scenario), body search with Ctrl/Cmd+F from anywhere in the mock form, large responses shown in
  full with copy and download.

### Changed

- Switching a collection off turns its mocks off; switching it on leaves them off, to be enabled
  one by one.
- Logs keep the latest 300 requests.
- The collection settings hold the scenario; the per-collection OpenAPI URL is gone (each mock
  carries its own).

### Fixed

- A page no longer crashes when a file is downloaded over XHR with `responseType: blob`.
- `fetch` streams and SSE reach the page immediately instead of waiting for the download to end.
- Safer logging (bodies are not read while logging is off, binary responses are logged by size,
  noisy pages drop repeats first) and AI keys stored separately from mocks, readable only by the
  background script.
- Firefox DevTools: messages to the inspected tab go through the background, fixing "Send request"
  and friends.
- Unchecked `runtime.lastError` noise in the extensions error page.

## [2.3.3]

- Prepare for opensource.

## [2.3.2]

### Fixed

- Plugin fix.

## [2.3.1]

### Fixed

- CI configuration fix.

## [2.3.0]

### Added

- AI generation of mock responses.
- Playwright end-to-end tests and further unit tests.

## [2.2.1]

### Changed

- Updated lodash.

## [2.2.0]

### Added

- Response validation against a schema.

## [2.1.0]

### Fixed

- Assorted bug and UI fixes.

## [2.0.2]

### Changed

- Manifest update.

## [2.0.1]

### Added

- Firefox build.

## [2.0.0]

### Added

- New functionality, plus bug fixes.
- Platform configuration.

## [1.1.0]

### Added

- Import and export of mocks.

## [1.0.0]

### Added

- Initial release.
