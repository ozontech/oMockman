export type Lang = 'en' | 'ru'

export interface Translations {
	col_settingsTitle: string
	col_save: string
	sc_enabled: string
	sc_hint: string
	sc_colRequest: string
	sc_colCall: string
	sc_colRespond: string
	sc_network: string
	sc_callHint: string
	sc_requestHint: string
	sc_respondHint: string
	sc_addRule: string
	sc_customEndpoint: string
	sc_noRules: string
	sc_reset: string
	sc_resetTitle: string
	sc_resetDone: string
	sc_resetFailed: string
	sc_moveUp: string
	sc_moveDown: string
	sc_deleteRule: string
	sc_mockOff: string
	sc_badgeTitle: string
	sc_badge: string
	log_scenario: (collection: string, call: number, network: boolean) => string
	/** For dates and times in tables. */
	dateLocale: string
	logs_colTime: string
	mocks_colCreated: string
	// Header buttons
	docsTitle: string
	settingsTitle: string

	// Header tabs / actions
	header_mocks: string
	header_logs: string
	header_addMock: string
	header_addCollection: string
	header_importMock: string
	header_search: string
	header_record: string
	header_recordStarted: string
	header_recordStopped: string
	header_stopLogging: string
	header_startLogging: string
	header_clearLogs: string

	// Mock import confirmation
	import_confirmTitle: string
	import_confirmSummary: string
	import_confirmTruncated: string
	import_confirmApply: string
	import_confirmCancel: string

	// Settings modal navigation
	settingsNav_ai: string
	settingsNav_env: string
	settingsNav_other: string

	// Other tab
	other_theme: string
	other_themeLight: string
	other_themeDark: string
	other_themeSystem: string
	other_language: string
	other_languageEn: string
	other_languageRu: string
	other_security: string
	other_allowLocalOpenApi: string
	other_allowLocalOpenApi_hint: string

	// Per-origin site access
	settingsNav_sites: string
	siteAccess_title: string
	siteAccess_bannerTitle: (origin: string) => string
	siteAccess_bannerText: string
	siteAccess_bannerSettingsLink: string
	siteAccess_applyAndReload: string
	siteAccess_autoGrant: string
	siteAccess_empty: string
	siteAccess_revoke: string
	siteAccess_undoRevoke: string
	siteAccess_revokeBlocked: string
	siteAccess_notAllowedHere: string
	toast_siteAccessSaved: (origin: string) => string
	toast_siteAccessRevoked: (origin: string) => string

	// AI settings (inside modal)
	ai_title: string
	ai_connectHint: string
	ai_addConnection: string
	ai_importJson: string
	ai_add: string
	ai_pickHint: string
	ai_emptyTitle: string
	ai_emptyHint: string
	ai_orPaste: string
	ai_editTitle: (name: string) => string
	ai_addTitle: string
	ai_cancel: string
	ai_save: string
	ai_addConnectionBtn: string
	ai_close: string

	// Provider list
	provider_inUse: string
	provider_noKey: string
	provider_edit: string
	provider_remove: string
	provider_removeConfirm: (name: string) => string

	// Provider form fields
	field_name: string
	field_name_placeholder: string
	field_serverUrl: string
	field_serverUrl_placeholder: string
	field_serverUrl_hint: string
	field_apiKey: string
	field_apiKey_hint: string
	field_apiKey_rebind: string
	field_model: string
	field_model_placeholder: string
	field_model_hint: string
	field_advanced: string
	field_authHeader: string
	field_authHeader_tip: string
	field_authPrefix: string
	field_authPrefix_tip: string
	field_temperature: string
	field_temperature_tip: string
	field_maxTokens: string
	field_maxTokens_tip: string
	field_jsonMode: string
	field_jsonMode_tip: string
	field_jsonMode_label: string
	field_allowLocalHttp: string
	field_allowLocalHttp_tip: string
	field_extraHeaders: string
	field_extraHeaders_tip: string
	field_addHeader: string
	field_customInstructions: string
	field_customInstructions_tip: string
	field_customInstructions_placeholder: string
	field_fillToTest: string

	// Test connection
	test_btn: string
	test_pending: string
	test_ok: (ms: number, model: string) => string
	test_fail: string

	// API key field
	apiKey_placeholder: string
	apiKey_keepPlaceholder: (mask: string) => string
	toast_keySaveFailed: (reason: string) => string

	// Setup hint
	setupHint_getKey: string
	setupHint_copy: string
	setupHint_copied: string

	// System prompt
	systemPrompt_placeholder: string
	systemPrompt_saved: string

	// Import preset
	import_title: string
	import_hint: string
	import_placeholder: string
	import_cancel: string
	import_apply: string
	import_error: string

	// Environment & Variables
	env_title: string
	env_selected: string
	env_add: string
	env_delete: string
	env_nameLabel: string
	env_varsLabel: string
	env_addVar: string
	env_removeVar: string
	env_cancel: string
	env_save: string

	// Mocks table / list
	mocks_noMocks: string
	mocks_noMocksHint: string
	mocks_noSearch: string
	mocks_noSearchHint: string
	mocks_copyUrl: string
	mocks_urlCopied: string
	mocks_maxDepth: string
	mocks_collectionSaved: string
	mocks_colName: string
	mocks_colUrl: string
	mocks_colMethod: string
	mocks_colStatus: string
	mocks_colDelay: string
	mocks_colActions: string
	mocks_enableAll: string
	mocks_disableAll: string
	mocks_enableMock: string
	mocks_disableMock: string
	mocks_hasActive: string
	mocks_enableCollection: string
	mocks_disableCollection: string
	mocks_collectionOn: string
	mocks_collectionOff: string
	mocks_expand: string
	mocks_collapse: string
	mocks_editRow: (name: string) => string

	// Collection actions
	col_addOptions: string
	col_addMock: string
	col_addSub: string
	col_settings: string
	col_export: (name: string) => string
	col_delete: (name: string) => string
	col_deleteTitle: string
	col_deleteBody: (name: string) => string
	col_deleteConfirm: string
	col_cancel: string
	col_delete_btn: string

	// Mock actions (row tooltips)
	mock_edit: (name: string | undefined) => string
	mock_export: (name: string | undefined) => string
	mock_duplicate: (name: string | undefined) => string
	mock_delete: (name: string | undefined) => string

	// Add / Edit mock form
	mock_addTitle: string
	mock_updateTitle: string
	mock_attachBack: string
	mock_openWindow: string
	mock_close: string
	mock_fieldName: string
	mock_namePlaceholder: string
	mock_fieldDesc: string
	mock_descPlaceholder: string
	mock_fieldOpenApi: string
	mock_openApiPlaceholder: string
	mock_openApiPartial: string
	mock_openApiTooLarge: (size: string, limit: string) => string
	mock_statusLabel: string
	mock_statusActive: string
	mock_statusInactive: string
	mock_methodLabel: string
	mock_urlLabel: string
	mock_urlPlaceholder: string
	mock_resolvedUrl: string
	mock_addBtn: string
	mock_updateBtn: string

	// Toast notifications
	toast_mockAdded: (name: string | undefined) => string
	toast_mockUpdated: (name: string | undefined) => string
	toast_mockCannotAdd: string
	toast_mockCannotUpdate: string
	toast_mockEnabled: (name: string | undefined) => string
	toast_mockDisabled: (name: string | undefined) => string
	toast_mockCannotDelete: string
	toast_mockDuplicated: (name: string | undefined) => string
	toast_mockCannotDuplicate: string
	toast_mockingEnabled: string
	toast_mockingDisabled: string
	toast_mockCannotToggle: string
	toast_collectionCannotUpdate: string
	toast_collectionCreated: string
	toast_connectionAdded: (name: string | undefined) => string
	toast_connectionUpdated: (name: string | undefined) => string
	toast_connectionRemoved: (name: string | undefined) => string
	toast_envSaved: string
	toast_settingsSaved: string
	toast_storageWriteFailed: (reason: string) => string

	// Add mock panes (tabs/buttons inside modal)
	pane_tabResponse: string
	pane_tabHeaders: string
	pane_tabRequestBody: string
	pane_requestPatchInvalidJson: string
	pane_requestPatchNotObject: string
	pane_requestPatchTooLarge: string
	pane_requestPatchNoBodyMethod: string
	pane_switchTitle: string
	pane_applyNothing: string
	pane_statusFromServer: string
	pane_requestBodyPlaceholder: string
	pane_responseLabel: string
	pane_responseTooLarge: (size: string, limit: string) => string
	pane_responseNotCaptured: (size: string, limit: string) => string
	pane_generate: string
	pane_generated: string
	pane_generateTitle: (mode: string) => string
	pane_generateModeTitle: (mode: string) => string
	pane_format: string
	pane_find: string
	pane_addHeader: string
	pane_headerNamePlaceholder: string
	pane_headerValuePlaceholder: string
	pane_deleteHeader: string

	// AI generation
	ai_gate_setup: string
	ai_gate_pick: string
	ai_gate_addKey: (name: string) => string
	ai_gate_generate: (name: string) => string
	ai_errorMissing_schema: string
	ai_errorMissing_status: string
	ai_errorDisabled: (reasons: string) => string
	ai_errorJoin: string
	ai_stopGeneration: string
	ai_mode_happy: string
	ai_mode_happy_desc: string
	ai_mode_corner: string
	ai_mode_corner_desc: string
	ai_mode_error: string
	ai_mode_error_desc: string
	ai_mode_happy_req_desc: string
	ai_mode_corner_req_desc: string
	ai_mode_error_req_desc: string
	ai_phrase_generating: string[]
	ai_phrase_retrying: string[]

	// Logs
	log_mockedCall: string
	log_networkCall: string
	log_patchedCall: string
	log_mockedHeaders: string
	send_title: string
	send_button: string
	send_shortcut: string
	send_credentials: string
	send_credentialsHint: string
	send_body: string
	send_headers: string
	send_response: string
	send_sending: string
	send_headersMissing: string
	send_headersFromSite: (host: string) => string
	send_noBodyMethod: string
	send_binaryBody: string
	send_tooLargeBody: string
	send_noTab: string
	send_error_invalid: string
	send_error_notAllowed: string
	send_error_unavailable: string
	send_error_network: string
	send_error_timeout: string
	log_sentCall: string
	log_replay: string
	pane_sendNow: string
	log_noLogs: string
	log_noLogsHint: string
	log_noSearch: string
	log_noSearchHint: string
	log_edit: string
	log_mock: string
	log_exportMock: string
	log_deleteLog: string
	log_urlCopied: string

	// Log details
	logDetail_title: string
	logDetail_mock: string
	logDetail_attachBack: string
	logDetail_openWindow: string
	logDetail_url: string
	logDetail_tabResponse: string
	logDetail_tabRequestBody: string
	logDetail_tabQueryParams: string
	logDetail_tabHeaders: string
	logDetail_largeBody: (size: string, lines: string) => string
	logDetail_copy: string
	logDetail_copied: string
	logDetail_download: string
	logDetail_sentBody: string
	logDetail_originalBody: string
	logDetail_responseHeaders: string
	logDetail_requestHeaders: string
	logDetail_noHeaders: string
	logDetail_pending: string
	logDetail_nothingToPreview: string
	logDetail_bodyTooLargeTitle: string
	logDetail_bodyTooLarge: (size: string, limit: string) => string
	logDetail_binaryTitle: string
	logDetail_binary: (size: string) => string
	logDetail_close: string
}

export const en: Translations = {
	col_settingsTitle: 'Collection settings',
	col_save: 'Save',
	sc_enabled: 'Use a scenario',
	sc_hint: 'Rows of one endpoint answer in turn: the first row answers its first call, the next one the second, and the last row every later call. Reloading the page starts the count over.',
	sc_colRequest: 'Request',
	sc_colCall: 'Call',
	sc_colRespond: 'Answer',
	sc_network: 'From the server',
	sc_callHint: 'Which call of the endpoint the row answers. The last row also answers every later call',
	sc_requestHint: 'Which request of the page the rule catches',
	sc_respondHint: 'What to answer with: a mock (even one that is off in the table) or the server response',
	sc_addRule: 'Rule',
	sc_customEndpoint: 'Add: ',
	sc_noRules: 'No rules yet. Add a row per call of an endpoint: the first row answers its first call, the last one repeats.',
	sc_reset: 'Start over',
	sc_resetTitle: 'Start the call count over',
	sc_resetDone: 'The call count starts over',
	sc_resetFailed: 'Could not start the call count over',
	sc_moveUp: 'Up',
	sc_moveDown: 'Down',
	sc_deleteRule: 'Delete the rule',
	sc_mockOff: 'off',
	sc_badgeTitle: 'The collection scenario is on. Click to start the call count over',
	sc_badge: 'Scenario',
	log_scenario: (collection, call, network) => `Scenario “${collection}”, call ${call}: ${network ? 'server response' : 'mocked'}`,
	dateLocale: 'en-GB',
	logs_colTime: 'Time',
	mocks_colCreated: 'Created',
	docsTitle: 'Documentation',
	settingsTitle: 'Settings',

	header_mocks: 'Mocks',
	header_logs: 'Logs',
	header_addMock: 'Add Mock',
	header_addCollection: 'Add Collection',
	header_importMock: 'Import Mock',
	header_search: 'Search…',
	header_record: 'Record network calls',
	header_recordStarted: 'Recording started. All network calls will be saved as mock.',
	header_recordStopped: 'Recorded network calls were successfully converted to mocks.',
	header_stopLogging: 'Stop logging',
	header_startLogging: 'Start logging',
	header_clearLogs: 'Clear logs',

	import_confirmTitle: 'Review import',
	import_confirmSummary: 'About to import {mocks} mock(s) and {collections} collection(s), {size} of data.',
	import_confirmTruncated: 'and {rest} more…',
	import_confirmApply: 'Import',
	import_confirmCancel: 'Cancel',

	settingsNav_ai: 'AI connections',
	settingsNav_env: 'Environment & Variables',
	settingsNav_other: 'Other',

	other_theme: 'Theme',
	other_themeLight: 'Light',
	other_themeDark: 'Dark',
	other_themeSystem: 'System',
	other_language: 'Language',
	other_languageEn: 'English',
	other_languageRu: 'Russian',
	other_security: 'Network',
	other_allowLocalOpenApi: 'Allow local OpenAPI sources',
	other_allowLocalOpenApi_hint: 'Lets Mockman load schemas from localhost and private addresses.',

	settingsNav_sites: 'Site access',
	siteAccess_title: 'Site access for mock',
	siteAccess_bannerTitle: (origin) => `Mockman is not active on ${origin}`,
	siteAccess_bannerText: 'Allow Mockman to replace responses here. The page will reload.',
	siteAccess_bannerSettingsLink: 'Access can be granted automatically in settings',
	siteAccess_applyAndReload: 'Allow and reload',
	siteAccess_autoGrant: 'Allow every site automatically',
	siteAccess_empty: 'No site has been granted access yet.',
	siteAccess_revoke: 'Revoke',
	siteAccess_undoRevoke: 'Undo',
	siteAccess_revokeBlocked: 'Turn off automatic access to revoke a single site.',
	siteAccess_notAllowedHere: 'Not allowed on this site',
	toast_siteAccessSaved: (origin) => `Access for ${origin} saved.`,
	toast_siteAccessRevoked: (origin) => `Access for ${origin} revoked.`,

	ai_title: 'AI connections',
	ai_connectHint: 'Pick the connection used to generate mocks.',
	ai_addConnection: 'Add a connection',
	ai_importJson: 'Import JSON',
	ai_add: 'Add',
	ai_pickHint: 'Pick the connection used to generate mocks.',
	ai_emptyTitle: 'Connect an AI to generate mocks',
	ai_emptyHint: 'Add a connection to any OpenAI-compatible AI — OpenAI, a corporate gateway, or a local model. You\'ll need a server URL, an API key, and a model name.',
	ai_orPaste: 'or paste a setup from JSON',
	ai_editTitle: (name) => `Edit connection: ${name}`,
	ai_addTitle: 'Add a connection',
	ai_cancel: 'Cancel',
	ai_save: 'Save',
	ai_addConnectionBtn: 'Add connection',
	ai_close: 'Close',

	provider_inUse: 'In use',
	provider_noKey: 'Add an API key to use this connection',
	provider_edit: 'Edit connection',
	provider_remove: 'Remove connection',
	provider_removeConfirm: (name) => `Remove connection "${name}"?`,

	field_name: 'Name',
	field_name_placeholder: 'e.g. OpenAI, or my company\'s AI',
	field_serverUrl: 'Server URL',
	field_serverUrl_placeholder: 'https://api.openai.com/v1',
	field_serverUrl_hint: 'The OpenAI-compatible API base. Requests go to /chat/completions under it.',
	field_apiKey: 'API key',
	field_apiKey_hint: 'Kept by the extension apart from your mocks: the panel only ever shows a mask of it. Sent only to the server it was entered for, never exported.',
	field_apiKey_rebind: 'The server URL now points to another host, so the saved key does not apply to it. Enter the key for this server.',
	field_model: 'Model',
	field_model_placeholder: 'e.g. gpt-4o-mini',
	field_model_hint: 'The model name your server expects.',
	field_advanced: 'Advanced',
	field_authHeader: 'Auth header',
	field_authHeader_tip: 'HTTP header used to pass the API key. Defaults to "Authorization". Some gateways use "x-api-key" or "api-key".',
	field_authPrefix: 'Auth prefix',
	field_authPrefix_tip: 'Prefix added before the token in the auth header. Defaults to "Bearer " (with a space). Leave empty if your gateway expects a bare token with no prefix.',
	field_temperature: 'Temperature',
	field_temperature_tip: 'Randomness of the model output, 0–2. Lower values (0.3–0.4) produce strict schema-following output; higher (0.7+) add variety. Leave empty — Mockman picks the right value per generation mode automatically.',
	field_maxTokens: 'Max tokens',
	field_maxTokens_tip: 'Maximum tokens in the model response. Increase if generation gets cut off mid-way (error: Response was cut off). Default is 8000.',
	field_jsonMode: 'JSON mode',
	field_jsonMode_tip: 'Sends response_format: { type: "json_object" } — guarantees the model returns valid JSON. Disable if your gateway does not support this parameter and returns a 400 error.',
	field_jsonMode_label: 'Enable (response_format: json_object)',
	field_allowLocalHttp: 'Allow local http endpoint',
	field_allowLocalHttp_tip: 'By default the api key is only sent over https. Enable this for a model server on localhost (http://127.0.0.1). Plain http to any other host stays blocked.',
	field_extraHeaders: 'Extra headers',
	field_extraHeaders_tip: 'Additional HTTP headers sent with every request. Use for project ID, org ID, beta flags, or any other gateway-specific parameters.',
	field_addHeader: 'Add header',
	field_customInstructions: 'Custom instructions',
	field_customInstructions_tip: 'Appended to the built-in generation rules for every generation. Use to set language, tone, or domain conventions — e.g. \'All product names in Russian, prices in rubles\'.',
	field_customInstructions_placeholder: 'e.g. Generate plausible Russian-language data. Avoid placeholder values like \'string\' or \'foo\'.',
	field_fillToTest: 'Fill in name, server URL, API key and model to test the connection.',

	test_btn: 'Test connection',
	test_pending: 'Testing…',
	test_ok: (ms, model) => `Connected · ${ms} ms · ${model}`,
	test_fail: 'Connection failed',

	apiKey_placeholder: 'sk-…',
	apiKey_keepPlaceholder: (mask) => `Saved: ${mask}. Leave empty to keep it`,
	toast_keySaveFailed: (reason) => `Could not save the API key: ${reason}`,

	setupHint_getKey: 'How to get a key',
	setupHint_copy: 'Copy',
	setupHint_copied: 'Copied',

	systemPrompt_placeholder: 'e.g. Generate plausible Russian-language data. Avoid placeholder values like \'string\' or \'foo\'.',
	systemPrompt_saved: 'Saved',

	import_title: 'Import connection from JSON',
	import_hint: 'Paste a provider config JSON. Only name, baseURL and model are required.',
	import_placeholder: '{ "name": "My AI", "baseURL": "https://...", "model": "..." }',
	import_cancel: 'Cancel',
	import_apply: 'Apply',
	import_error: 'Invalid JSON or missing required fields (name, baseURL, model).',

	env_title: 'Environment & Variables',
	env_selected: 'Selected',
	env_add: 'Add',
	env_delete: 'Delete',
	env_nameLabel: 'Name',
	env_varsLabel: 'Use in URL: {BASE_URL} or any other {VAR}',
	env_addVar: 'Add variable',
	env_removeVar: 'Remove variable',
	env_cancel: 'Cancel',
	env_save: 'Save',

	mocks_noMocks: 'No mocks created yet',
	mocks_noMocksHint: 'Create a mock from scratch or record it from logs.',
	mocks_noSearch: 'No mock matches your search',
	mocks_noSearchHint: 'Search by name, url, method or status.',
	mocks_copyUrl: 'Copy URL',
	mocks_urlCopied: 'URL copied to clipboard.',
	mocks_maxDepth: 'Maximum folder depth reached (3).',
	mocks_collectionSaved: 'Collection settings saved.',
	mocks_colName: 'Name',
	mocks_colUrl: 'URL',
	mocks_colMethod: 'Method',
	mocks_colStatus: 'Status',
	mocks_colDelay: 'Delay (ms)',
	mocks_colActions: 'Actions',
	mocks_enableAll: 'All mocking on',
	mocks_disableAll: 'All mocking off',
	mocks_enableMock: 'Enable mocking',
	mocks_disableMock: 'Disable mocking',
	mocks_hasActive: 'Has active mocks',
	mocks_enableCollection: 'Enable collection mocking',
	mocks_disableCollection: 'Disable collection mocking',
	mocks_collectionOn: 'On',
	mocks_collectionOff: 'Off',
	mocks_expand: 'Expand',
	mocks_collapse: 'Collapse',
	mocks_editRow: (name) => `Edit ${name}`,

	col_addOptions: 'Add options',
	col_addMock: 'Add Mock',
	col_addSub: 'Add Subcollection',
	col_settings: 'Collection settings',
	col_export: (name) => `Export mocks in ${name}`,
	col_delete: (name) => `Delete collection ${name}`,
	col_deleteTitle: 'Delete collection?',
	col_deleteBody: (name) => `Collection ${name} is not empty. Delete it and all its contents?`,
	col_deleteConfirm: 'Delete',
	col_cancel: 'Cancel',
	col_delete_btn: 'Delete',

	mock_edit: (name) => `Edit ${name}`,
	mock_export: (name) => `Export ${name}`,
	mock_duplicate: (name) => `Duplicate ${name}`,
	mock_delete: (name) => `Delete ${name}`,

	mock_addTitle: 'Add Mock',
	mock_updateTitle: 'Update Mock',
	mock_attachBack: 'Attach back to panel',
	mock_openWindow: 'Open in separate window',
	mock_close: 'Close',
	mock_fieldName: 'Name',
	mock_namePlaceholder: 'Empty task list',
	mock_fieldDesc: 'Description',
	mock_descPlaceholder: 'No tasks for today, to check the empty screen',
	mock_fieldOpenApi: 'OpenAPI / Swagger URL',
	mock_openApiPlaceholder: 'https://api.example.com/swagger.json',
	mock_openApiPartial: 'Suggestions are partially loaded for a large schema.',
	mock_openApiTooLarge: (size, limit) => `The body is ${size}, over ${limit}: it is not checked against the schema, so the form stays fast. AI generation still uses the schema.`,
	mock_statusLabel: 'Status',
	mock_statusActive: 'Active',
	mock_statusInactive: 'Inactive',
	mock_methodLabel: 'Method',
	mock_urlLabel: 'URL',
	mock_urlPlaceholder: 'https://api.awesomeapp.com/goals',
	mock_resolvedUrl: 'Resolved URL',
	mock_addBtn: 'Add Mock',
	mock_updateBtn: 'Update Mock',

	toast_mockAdded: (name) => `Mock "${name}" has been added.`,
	toast_mockUpdated: (name) => `Mock "${name}" has been updated.`,
	toast_mockCannotAdd: 'Cannot add mock. Something went wrong.',
	toast_mockCannotUpdate: 'Cannot update mock. Something went wrong.',
	toast_mockEnabled: (name) => `"${name}" enabled.`,
	toast_mockDisabled: (name) => `"${name}" disabled.`,
	toast_mockCannotDelete: 'Cannot delete mock.',
	toast_mockDuplicated: (name) => `Mock "${name}" has been added.`,
	toast_mockCannotDuplicate: 'Cannot duplicate mock.',
	toast_mockingEnabled: 'Mocking enabled',
	toast_mockingDisabled: 'Mocking disabled',
	toast_mockCannotToggle: 'Cannot update mocking state.',
	toast_collectionCannotUpdate: 'Cannot update collections.',
	toast_collectionCreated: 'Collection created.',
	toast_connectionAdded: (name) => `Connection "${name}" has been added.`,
	toast_connectionUpdated: (name) => `Connection "${name}" has been saved.`,
	toast_connectionRemoved: (name) => `Connection "${name}" has been removed.`,
	toast_envSaved: 'Environment saved.',
	toast_settingsSaved: 'Settings saved.',
	toast_storageWriteFailed: (reason) => `Could not save to extension storage: ${reason}`,

	pane_tabResponse: 'Response Body',
	pane_tabHeaders: 'Response Headers',
	pane_tabRequestBody: 'Request Body',
	pane_requestPatchInvalidJson: 'The body is not valid JSON.',
	pane_requestPatchNotObject: 'Merge needs a JSON object: { ... }.',
	pane_requestPatchTooLarge: 'The body is over the size limit.',
	pane_requestPatchNoBodyMethod: 'The browser sends no body with GET and HEAD, so the patch does not apply to them.',
	pane_switchTitle: 'Turn on or off',
	pane_applyNothing: 'Turn on at least one: response body, response headers or request body.',
	pane_statusFromServer: 'The status comes from the server',
	pane_requestBodyPlaceholder: 'The body sent to the server',
	pane_responseLabel: 'Response (JSON)',
	pane_responseTooLarge: (size, limit) => `Response is too large: ${size}, the limit is ${limit}. A mock this big cannot be saved.`,
	pane_responseNotCaptured: (size, limit) => (size
		? `The original response was ${size}, larger than ${limit}, and was not captured. Paste a smaller body.`
		: `The original response was larger than ${limit} and was not captured. Paste a smaller body.`),
	pane_generate: 'Generate',
	pane_generated: 'Done',
	pane_generateTitle: (mode) => `Generate: ${mode}`,
	pane_generateModeTitle: (mode) => `Generation mode: ${mode}`,
	pane_format: 'Format',
	pane_find: 'Find in response',
	pane_addHeader: 'Add Header',
	pane_headerNamePlaceholder: 'Name',
	pane_headerValuePlaceholder: 'Value',
	pane_deleteHeader: 'Delete header',

	ai_gate_setup: 'Connect an AI first: Settings (gear icon in the top bar) → AI connections',
	ai_gate_pick: 'Pick an AI connection (gear icon in the top bar)',
	ai_gate_addKey: (name) => `Add an API key for "${name}" (gear icon in the top bar)`,
	ai_gate_generate: (name) => `Generate with ${name}`,
	ai_errorMissing_schema: 'add an OpenAPI schema',
	ai_errorMissing_status: 'set status 400–599',
	ai_errorDisabled: (reasons) => `Error mode unavailable: ${reasons}`,
	ai_errorJoin: 'and',
	ai_stopGeneration: 'Stop generation',
	ai_mode_happy: 'Happy',
	ai_mode_happy_desc: 'Valid data',
	ai_mode_corner: 'Corner',
	ai_mode_corner_desc: 'Edge cases: empty, long, special chars',
	ai_mode_error: 'Error',
	ai_mode_error_desc: 'Error response per schema',
	ai_mode_happy_req_desc: 'Valid body the server accepts',
	ai_mode_corner_req_desc: 'Edge values the schema still allows',
	ai_mode_error_req_desc: 'Invalid body to test server validation',
	ai_phrase_generating: ['Generating…', 'Filling…', 'Expanding…', 'Crafting…', 'Assembling…'],
	ai_phrase_retrying: ['Optimizing…', 'Trimming…', 'Compacting…', 'Shrinking…'],

	log_mockedCall: 'Mocked Response',
	log_networkCall: 'Network call',
	log_patchedCall: 'Mocked Request',
	log_mockedHeaders: 'Mocked Response headers',
	send_title: 'Send request',
	send_button: 'Send',
	send_shortcut: 'Ctrl/⌘ + Enter',
	send_credentials: 'Send the site cookies',
	send_credentialsHint: 'credentials: include. Turn off for an API that does not allow credentials in CORS.',
	send_body: 'Body',
	send_headers: 'Headers',
	send_response: 'Response',
	send_sending: 'Sending…',
	send_headersMissing: 'Logs have no calls to this site, so no headers (Authorization among them) were filled in. Reload the site with the panel open, or add the headers on the Headers tab.',
	send_headersFromSite: (host) => `Headers taken from the latest call to ${host}: Logs have no call to this endpoint.`,
	send_noBodyMethod: 'GET and HEAD requests carry no body.',
	send_binaryBody: 'Binary body, not shown.',
	send_tooLargeBody: 'The body is over the size limit, not shown.',
	send_noTab: 'The panel is not attached to a tab.',
	send_error_invalid: 'The URL is not valid',
	send_error_notAllowed: 'Mockman is not allowed on this site: allow it in Settings → Sites',
	send_error_unavailable: 'No connection to the page: open or reload the site tab',
	send_error_network: 'The request did not get through: network, CORS or the browser blocked it. Try without cookies.',
	send_error_timeout: 'No answer in 60 seconds',
	log_sentCall: 'Sent from Mockman',
	log_replay: 'Send again',
	pane_sendNow: 'Send now',
	log_noLogs: 'No network calls yet!',
	log_noLogsHint: 'XHR / fetch requests will appear here.',
	log_noSearch: 'No matched log',
	log_noSearchHint: 'Search by method, URL or status.',
	log_edit: 'Edit',
	log_mock: 'Mock',
	log_exportMock: 'Export mock',
	log_deleteLog: 'Delete log',
	log_urlCopied: 'URL copied to clipboard.',

	logDetail_title: 'Log Details',
	logDetail_mock: 'Mock',
	logDetail_attachBack: 'Attach back to panel',
	logDetail_openWindow: 'Open in separate window',
	logDetail_url: 'URL:',
	logDetail_tabResponse: 'Response',
	logDetail_tabRequestBody: 'Request Body',
	logDetail_tabQueryParams: 'Query Params',
	logDetail_tabHeaders: 'Headers',
	logDetail_largeBody: (size, lines) => `Large body: ${size}, ${lines} lines. It scrolls inside the editor; line wrapping and error highlighting are off.`,
	logDetail_copy: 'Copy',
	logDetail_copied: 'Body copied',
	logDetail_download: 'Download',
	logDetail_sentBody: 'Sent body (patched by Mockman)',
	logDetail_originalBody: 'Original body from the page',
	logDetail_responseHeaders: 'Response Headers',
	logDetail_requestHeaders: 'Request Headers',
	logDetail_noHeaders: 'No headers',
	logDetail_pending: 'Request pending',
	logDetail_nothingToPreview: 'Nothing to preview',
	logDetail_binaryTitle: 'Binary response',
	logDetail_binary: (size) => (size
		? `A file or binary data, ${size}. Its body is not captured.`
		: 'A file or binary data. Its body is not captured.'),
	logDetail_bodyTooLargeTitle: 'Body is too large',
	logDetail_bodyTooLarge: (size, limit) => (size
		? `The body is ${size}, larger than ${limit}, so it was not captured.`
		: `The body is larger than ${limit}, so it was not captured.`),
	logDetail_close: 'Close',
}

export const ru: Translations = {
	col_settingsTitle: 'Настройки коллекции',
	col_save: 'Сохранить',
	sc_enabled: 'Включить сценарий',
	sc_hint: 'Строки одной ручки отвечают по очереди: первая — на её первый вызов, следующая — на второй, последняя — на все дальнейшие. После перезагрузки страницы счёт начинается заново.',
	sc_colRequest: 'Запрос',
	sc_colCall: 'Вызов',
	sc_colRespond: 'Ответ',
	sc_network: 'От сервера',
	sc_callHint: 'На какой по счёту вызов ручки отвечает строка. Последняя строка отвечает и на все следующие вызовы',
	sc_requestHint: 'Какой запрос страницы ловит правило',
	sc_respondHint: 'Чем ответить: моком (даже если он выключен в таблице) или ответом от сервера',
	sc_addRule: 'Правило',
	sc_customEndpoint: 'Добавить: ',
	sc_noRules: 'Правил пока нет. Добавьте строку на каждый вызов ручки: первая ответит на её первый вызов, последняя будет повторяться.',
	sc_reset: 'Сбросить',
	sc_resetTitle: 'Начать счёт вызовов заново',
	sc_resetDone: 'Счёт вызовов начат заново',
	sc_resetFailed: 'Не получилось начать счёт вызовов заново',
	sc_moveUp: 'Выше',
	sc_moveDown: 'Ниже',
	sc_deleteRule: 'Удалить правило',
	sc_mockOff: 'выключен',
	sc_badgeTitle: 'Сценарий коллекции включён. Нажмите, чтобы начать счёт вызовов заново',
	sc_badge: 'Сценарий',
	log_scenario: (collection, call, network) => `Сценарий «${collection}», вызов ${call}: ${network ? 'ответ от сервера' : 'ответ из мока'}`,
	dateLocale: 'ru-RU',
	logs_colTime: 'Время',
	mocks_colCreated: 'Создан',
	docsTitle: 'Документация',
	settingsTitle: 'Настройки',

	header_mocks: 'Моки',
	header_logs: 'Логи',
	header_addMock: 'Добавить мок',
	header_addCollection: 'Добавить коллекцию',
	header_importMock: 'Импортировать мок',
	header_search: 'Поиск…',
	header_record: 'Запись сетевых запросов',
	header_recordStarted: 'Запись начата. Все сетевые запросы будут сохранены как моки.',
	header_recordStopped: 'Записанные запросы успешно преобразованы в моки.',
	header_stopLogging: 'Остановить логирование',
	header_startLogging: 'Начать логирование',
	header_clearLogs: 'Очистить логи',

	import_confirmTitle: 'Проверьте импорт',
	import_confirmSummary: 'Будет импортировано моков: {mocks}, коллекций: {collections}, объём данных: {size}.',
	import_confirmTruncated: 'и ещё {rest}…',
	import_confirmApply: 'Импортировать',
	import_confirmCancel: 'Отмена',

	settingsNav_ai: 'AI-подключения',
	settingsNav_env: 'Среды и переменные',
	settingsNav_other: 'Другое',

	other_theme: 'Тема',
	other_themeLight: 'Светлая',
	other_themeDark: 'Тёмная',
	other_themeSystem: 'Системная',
	other_language: 'Язык',
	other_languageEn: 'Английский',
	other_languageRu: 'Русский',
	other_security: 'Сеть',
	other_allowLocalOpenApi: 'Разрешить локальные OpenAPI-схемы',
	other_allowLocalOpenApi_hint: 'Позволяет загружать схемы с localhost и приватных адресов.',

	settingsNav_sites: 'Доступ к сайтам',
	siteAccess_title: 'Доступ к сайтам для мокирования',
	siteAccess_bannerTitle: (origin) => `Mockman не активен на ${origin}`,
	siteAccess_bannerText: 'Разрешите Mockman подменять ответы на этом сайте. Страница перезагрузится.',
	siteAccess_bannerSettingsLink: 'Автоматически разрешать доступы можно в настройках',
	siteAccess_applyAndReload: 'Разрешить и перезагрузить',
	siteAccess_autoGrant: 'Автоматически разрешать все сайты',
	siteAccess_empty: 'Доступ пока никому не выдан.',
	siteAccess_revoke: 'Отозвать',
	siteAccess_undoRevoke: 'Вернуть',
	siteAccess_revokeBlocked: 'Чтобы отозвать отдельный сайт, выключите автоматический доступ.',
	siteAccess_notAllowedHere: 'Не разрешено на этом сайте',
	toast_siteAccessSaved: (origin) => `Доступ для ${origin} сохранён.`,
	toast_siteAccessRevoked: (origin) => `Доступ для ${origin} отозван.`,

	ai_title: 'AI-подключения',
	ai_connectHint: 'Выберите подключение для генерации моков.',
	ai_addConnection: 'Добавить подключение',
	ai_importJson: 'Импорт JSON',
	ai_add: 'Добавить',
	ai_pickHint: 'Выберите подключение для генерации моков.',
	ai_emptyTitle: 'Подключите AI для генерации моков',
	ai_emptyHint: 'Добавьте подключение к любому OpenAI-совместимому AI — OpenAI, корпоративному шлюзу или локальной модели. Понадобятся URL сервера, API-ключ и название модели.',
	ai_orPaste: 'или вставьте конфиг в формате JSON',
	ai_editTitle: (name) => `Редактировать: ${name}`,
	ai_addTitle: 'Добавить подключение',
	ai_cancel: 'Отмена',
	ai_save: 'Сохранить',
	ai_addConnectionBtn: 'Добавить подключение',
	ai_close: 'Закрыть',

	provider_inUse: 'Активно',
	provider_noKey: 'Добавьте API-ключ для использования',
	provider_edit: 'Редактировать',
	provider_remove: 'Удалить',
	provider_removeConfirm: (name) => `Удалить подключение «${name}»?`,

	field_name: 'Название',
	field_name_placeholder: 'Например: OpenAI или корпоративный AI',
	field_serverUrl: 'URL сервера',
	field_serverUrl_placeholder: 'https://api.openai.com/v1',
	field_serverUrl_hint: 'Базовый URL OpenAI-совместимого API. Запросы идут на /chat/completions.',
	field_apiKey: 'API-ключ',
	field_apiKey_hint: 'Хранится расширением отдельно от моков, в панели виден только по маске. Уходит только на сервер, для которого введён, и никогда не экспортируется.',
	field_apiKey_rebind: 'Адрес сервера теперь ведёт на другой хост, сохранённый ключ к нему не подходит. Введите ключ для этого сервера.',
	field_model: 'Модель',
	field_model_placeholder: 'Например: gpt-4o-mini',
	field_model_hint: 'Название модели, которую ожидает ваш сервер.',
	field_advanced: 'Дополнительно',
	field_authHeader: 'Заголовок авторизации',
	field_authHeader_tip: 'HTTP-заголовок для передачи API-ключа. По умолчанию — «Authorization». Некоторые шлюзы используют «x-api-key» или «api-key».',
	field_authPrefix: 'Префикс авторизации',
	field_authPrefix_tip: 'Префикс перед токеном в заголовке. По умолчанию — «Bearer » (с пробелом). Оставьте пустым, если шлюз ожидает голый токен без префикса.',
	field_temperature: 'Температура',
	field_temperature_tip: 'Случайность вывода модели, от 0 до 2. Низкие значения (0.3–0.4) дают строгое следование схеме, высокие (0.7+) — больше разнообразия. Оставьте пустым — Mockman подберёт значение автоматически.',
	field_maxTokens: 'Макс. токены',
	field_maxTokens_tip: 'Максимальное число токенов в ответе модели. Увеличьте, если генерация обрывается на середине (ошибка «ответ обрезан»). По умолчанию 8000.',
	field_jsonMode: 'JSON-режим',
	field_jsonMode_tip: 'Отправляет response_format: { type: "json_object" } — гарантирует корректный JSON в ответе. Отключите, если шлюз не поддерживает этот параметр и возвращает ошибку 400.',
	field_jsonMode_label: 'Включить (response_format: json_object)',
	field_allowLocalHttp: 'Разрешить локальный http-эндпоинт',
	field_allowLocalHttp_tip: 'По умолчанию ключ уходит только по https. Включите для локальной модели (http://127.0.0.1). Обычный http на любой другой хост остаётся запрещён.',
	field_extraHeaders: 'Доп. заголовки',
	field_extraHeaders_tip: 'Дополнительные HTTP-заголовки для каждого запроса. Используйте для project ID, org ID, бета-флагов и других параметров шлюза.',
	field_addHeader: 'Добавить заголовок',
	field_customInstructions: 'Свои инструкции',
	field_customInstructions_tip: 'Добавляются к встроенным правилам генерации. Используйте для задания языка, тона или доменных соглашений — например: «Все названия продуктов на русском, цены в рублях».',
	field_customInstructions_placeholder: 'Например: Генерируй правдоподобные данные на русском. Не используй заглушки вроде «string» или «foo».',
	field_fillToTest: 'Заполните название, URL сервера, API-ключ и модель для проверки подключения.',

	test_btn: 'Проверить подключение',
	test_pending: 'Проверяю…',
	test_ok: (ms, model) => `Подключено · ${ms} мс · ${model}`,
	test_fail: 'Ошибка подключения',

	apiKey_placeholder: 'sk-…',
	apiKey_keepPlaceholder: (mask) => `Сохранён: ${mask}. Оставьте пустым, чтобы не менять`,
	toast_keySaveFailed: (reason) => `Не удалось сохранить API-ключ: ${reason}`,

	setupHint_getKey: 'Как получить ключ',
	setupHint_copy: 'Копировать',
	setupHint_copied: 'Скопировано',

	systemPrompt_placeholder: 'Например: Генерируй правдоподобные данные на русском. Не используй заглушки вроде «string» или «foo».',
	systemPrompt_saved: 'Сохранено',

	import_title: 'Импорт подключения из JSON',
	import_hint: 'Вставьте JSON конфига провайдера. Обязательные поля: name, baseURL, model.',
	import_placeholder: '{ "name": "My AI", "baseURL": "https://...", "model": "..." }',
	import_cancel: 'Отмена',
	import_apply: 'Применить',
	import_error: 'Некорректный JSON или отсутствуют обязательные поля (name, baseURL, model).',

	env_title: 'Среды и переменные',
	env_selected: 'Активная среда',
	env_add: 'Добавить',
	env_delete: 'Удалить',
	env_nameLabel: 'Название',
	env_varsLabel: 'Используйте в URL: {BASE_URL} или другая {ПЕРЕМЕННАЯ}',
	env_addVar: 'Добавить переменную',
	env_removeVar: 'Удалить переменную',
	env_cancel: 'Отмена',
	env_save: 'Сохранить',

	mocks_noMocks: 'Ещё нет ни одного мока',
	mocks_noMocksHint: 'Создайте мок с нуля или запишите из логов.',
	mocks_noSearch: 'Мок не найден',
	mocks_noSearchHint: 'Поиск по названию, URL, методу или статусу.',
	mocks_copyUrl: 'Скопировать URL',
	mocks_urlCopied: 'URL скопирован в буфер обмена.',
	mocks_maxDepth: 'Достигнута максимальная глубина папок (3).',
	mocks_collectionSaved: 'Настройки коллекции сохранены.',
	mocks_colName: 'Название',
	mocks_colUrl: 'URL',
	mocks_colMethod: 'Метод',
	mocks_colStatus: 'Статус',
	mocks_colDelay: 'Задержка (мс)',
	mocks_colActions: 'Действия',
	mocks_enableAll: 'Включить все',
	mocks_disableAll: 'Выключить все',
	mocks_enableMock: 'Включить мок',
	mocks_disableMock: 'Выключить мок',
	mocks_hasActive: 'Есть активные моки',
	mocks_enableCollection: 'Включить моки коллекции',
	mocks_disableCollection: 'Выключить моки коллекции',
	mocks_collectionOn: 'Вкл',
	mocks_collectionOff: 'Выкл',
	mocks_expand: 'Развернуть',
	mocks_collapse: 'Свернуть',
	mocks_editRow: (name) => `Редактировать ${name}`,

	col_addOptions: 'Действия',
	col_addMock: 'Добавить мок',
	col_addSub: 'Добавить подколлекцию',
	col_settings: 'Настройки коллекции',
	col_export: (name) => `Экспортировать моки из ${name}`,
	col_delete: (name) => `Удалить коллекцию ${name}`,
	col_deleteTitle: 'Удалить коллекцию?',
	col_deleteBody: (name) => `Коллекция «${name}» не пуста. Удалить её вместе со всем содержимым?`,
	col_deleteConfirm: 'Удалить',
	col_cancel: 'Отмена',
	col_delete_btn: 'Удалить',

	mock_edit: (name) => `Редактировать ${name}`,
	mock_export: (name) => `Экспортировать ${name}`,
	mock_duplicate: (name) => `Дублировать ${name}`,
	mock_delete: (name) => `Удалить ${name}`,

	mock_addTitle: 'Добавить мок',
	mock_updateTitle: 'Изменить мок',
	mock_attachBack: 'Прикрепить обратно к панели',
	mock_openWindow: 'Открыть в отдельном окне',
	mock_close: 'Закрыть',
	mock_fieldName: 'Название',
	mock_namePlaceholder: 'Пустой список заданий',
	mock_fieldDesc: 'Описание',
	mock_descPlaceholder: 'Заданий на сегодня нет — проверяем пустой экран',
	mock_fieldOpenApi: 'OpenAPI / Swagger URL',
	mock_openApiPlaceholder: 'https://api.example.com/swagger.json',
	mock_openApiPartial: 'Подсказки загружены частично — схема очень большая.',
	mock_openApiTooLarge: (size, limit) => `Тело ${size}, больше ${limit}: по схеме не проверяется, чтобы форма не тормозила. AI-генерация схему по-прежнему использует.`,
	mock_statusLabel: 'Статус',
	mock_statusActive: 'Активен',
	mock_statusInactive: 'Неактивен',
	mock_methodLabel: 'Метод',
	mock_urlLabel: 'URL',
	mock_urlPlaceholder: 'https://api.awesomeapp.com/goals',
	mock_resolvedUrl: 'Итоговый URL',
	mock_addBtn: 'Добавить мок',
	mock_updateBtn: 'Сохранить мок',

	toast_mockAdded: (name) => `Мок «${name}» добавлен.`,
	toast_mockUpdated: (name) => `Мок «${name}» обновлён.`,
	toast_mockCannotAdd: 'Не удалось добавить мок.',
	toast_mockCannotUpdate: 'Не удалось обновить мок.',
	toast_mockEnabled: (name) => `«${name}» включён.`,
	toast_mockDisabled: (name) => `«${name}» выключен.`,
	toast_mockCannotDelete: 'Не удалось удалить мок.',
	toast_mockDuplicated: (name) => `Мок «${name}» добавлен.`,
	toast_mockCannotDuplicate: 'Не удалось дублировать мок.',
	toast_mockingEnabled: 'Моки включены',
	toast_mockingDisabled: 'Моки выключены',
	toast_mockCannotToggle: 'Не удалось изменить состояние моков.',
	toast_collectionCannotUpdate: 'Не удалось обновить коллекции.',
	toast_collectionCreated: 'Коллекция создана.',
	toast_connectionAdded: (name) => `Подключение «${name}» добавлено.`,
	toast_connectionUpdated: (name) => `Подключение «${name}» сохранено.`,
	toast_connectionRemoved: (name) => `Подключение «${name}» удалено.`,
	toast_envSaved: 'Среда сохранена.',
	toast_settingsSaved: 'Настройки сохранены.',
	toast_storageWriteFailed: (reason) => `Не удалось сохранить в хранилище расширения: ${reason}`,

	pane_tabResponse: 'Тело ответа',
	pane_tabHeaders: 'Заголовки ответа',
	pane_tabRequestBody: 'Тело запроса',
	pane_requestPatchInvalidJson: 'Тело — невалидный JSON.',
	pane_requestPatchNotObject: 'Для слияния нужен JSON-объект: { ... }.',
	pane_requestPatchTooLarge: 'Тело больше допустимого размера.',
	pane_requestPatchNoBodyMethod: 'Браузер не отправляет тело у GET и HEAD, поэтому подмена к ним не применяется.',
	pane_switchTitle: 'Включить или выключить',
	pane_applyNothing: 'Включите хотя бы одно: тело ответа, заголовки ответа или тело запроса.',
	pane_statusFromServer: 'Статус придёт от сервера',
	pane_requestBodyPlaceholder: 'Тело, которое уйдёт на сервер',
	pane_responseLabel: 'Ответ (JSON)',
	pane_responseTooLarge: (size, limit) => `Ответ слишком большой: ${size}, лимит ${limit}. Такой мок нельзя сохранить.`,
	pane_responseNotCaptured: (size, limit) => (size
		? `Исходный ответ весил ${size}, больше ${limit}, и не был сохранён. Вставьте тело поменьше.`
		: `Исходный ответ больше ${limit} и не был сохранён. Вставьте тело поменьше.`),
	pane_generate: 'Сгенерировать',
	pane_generated: 'Готово',
	pane_generateTitle: (mode) => `Сгенерировать: ${mode}`,
	pane_generateModeTitle: (mode) => `Режим генерации: ${mode}`,
	pane_format: 'Форматировать',
	pane_find: 'Поиск в ответе',
	pane_addHeader: 'Добавить заголовок',
	pane_headerNamePlaceholder: 'Имя',
	pane_headerValuePlaceholder: 'Значение',
	pane_deleteHeader: 'Удалить заголовок',

	ai_gate_setup: 'Сначала подключите AI: Настройки (шестерёнка в верхней панели) → AI-подключения',
	ai_gate_pick: 'Выберите AI-подключение (шестерёнка в верхней панели)',
	ai_gate_addKey: (name) => `Добавьте API-ключ для «${name}» (шестерёнка в верхней панели)`,
	ai_gate_generate: (name) => `Сгенерировать через ${name}`,
	ai_errorMissing_schema: 'добавьте OpenAPI-схему',
	ai_errorMissing_status: 'поставьте статус 400–599',
	ai_errorDisabled: (reasons) => `Режим Error недоступен: ${reasons}`,
	ai_errorJoin: 'и',
	ai_stopGeneration: 'Остановить генерацию',
	ai_mode_happy: 'Happy',
	ai_mode_happy_desc: 'Валидные данные',
	ai_mode_corner: 'Corner',
	ai_mode_corner_desc: 'Граничные: пустые, длинные, спецсимволы',
	ai_mode_error: 'Error',
	ai_mode_error_desc: 'Ответ-ошибка по схеме',
	ai_mode_happy_req_desc: 'Валидное тело, которое примет сервер',
	ai_mode_corner_req_desc: 'Граничные, но допустимые схемой значения',
	ai_mode_error_req_desc: 'Невалидное тело для проверки валидации сервера',
	ai_phrase_generating: ['Генерирую…', 'Заполняю…', 'Формирую…', 'Собираю…', 'Составляю…'],
	ai_phrase_retrying: ['Оптимизирую…', 'Сокращаю…', 'Компактизирую…', 'Уменьшаю…'],

	log_mockedCall: 'Мок ответа',
	log_networkCall: 'Сетевой запрос',
	log_patchedCall: 'Мок запроса',
	log_mockedHeaders: 'Мок заголовков ответа',
	send_title: 'Отправить запрос',
	send_button: 'Отправить',
	send_shortcut: 'Ctrl/⌘ + Enter',
	send_credentials: 'Отправлять куки сайта',
	send_credentialsHint: 'credentials: include. Выключите для API, которое не разрешает куки в CORS.',
	send_body: 'Тело',
	send_headers: 'Заголовки',
	send_response: 'Ответ',
	send_sending: 'Отправка…',
	send_headersMissing: 'В Logs нет запросов к этому сайту, поэтому заголовки (в том числе Authorization) не подставлены. Обновите страницу сайта с открытой панелью или добавьте заголовки на вкладке «Заголовки».',
	send_headersFromSite: (host) => `Заголовки взяты из последнего запроса к ${host}: вызовов этой ручки в Logs не было.`,
	send_noBodyMethod: 'У GET и HEAD нет тела.',
	send_binaryBody: 'Бинарное тело, не показывается.',
	send_tooLargeBody: 'Тело больше допустимого размера, не показывается.',
	send_noTab: 'Панель не привязана к вкладке.',
	send_error_invalid: 'Неверный URL',
	send_error_notAllowed: 'Mockman не разрешён на этом сайте: разрешите его в Настройки → Сайты',
	send_error_unavailable: 'Нет связи со страницей: откройте или перезагрузите вкладку сайта',
	send_error_network: 'Запрос не прошёл: сеть, CORS или браузер заблокировал. Попробуйте без кук.',
	send_error_timeout: 'Нет ответа за 60 секунд',
	log_sentCall: 'Отправлен из Mockman',
	log_replay: 'Отправить ещё раз',
	pane_sendNow: 'Отправить сейчас',
	log_noLogs: 'Запросов пока нет',
	log_noLogsHint: 'Здесь появятся XHR / fetch запросы.',
	log_noSearch: 'Ничего не найдено',
	log_noSearchHint: 'Поиск по методу, URL или статусу.',
	log_edit: 'Редактировать',
	log_mock: 'Создать мок',
	log_exportMock: 'Экспортировать мок',
	log_deleteLog: 'Удалить запись',
	log_urlCopied: 'URL скопирован в буфер обмена.',

	logDetail_title: 'Детали запроса',
	logDetail_mock: 'Создать мок',
	logDetail_attachBack: 'Прикрепить обратно к панели',
	logDetail_openWindow: 'Открыть в отдельном окне',
	logDetail_url: 'URL:',
	logDetail_tabResponse: 'Ответ',
	logDetail_tabRequestBody: 'Тело запроса',
	logDetail_tabQueryParams: 'Параметры',
	logDetail_tabHeaders: 'Заголовки',
	logDetail_largeBody: (size, lines) => `Большое тело: ${size}, ${lines} строк. Прокрутка внутри редактора, перенос строк и подсветка ошибок отключены.`,
	logDetail_copy: 'Копировать',
	logDetail_copied: 'Тело скопировано',
	logDetail_download: 'Скачать',
	logDetail_sentBody: 'Отправленное тело (изменено Mockman)',
	logDetail_originalBody: 'Исходное тело от страницы',
	logDetail_responseHeaders: 'Заголовки ответа',
	logDetail_requestHeaders: 'Заголовки запроса',
	logDetail_noHeaders: 'Заголовков нет',
	logDetail_pending: 'Запрос выполняется…',
	logDetail_nothingToPreview: 'Нет данных для отображения',
	logDetail_binaryTitle: 'Бинарный ответ',
	logDetail_binary: (size) => (size
		? `Файл или бинарные данные, ${size}. Тело не сохраняется.`
		: 'Файл или бинарные данные. Тело не сохраняется.'),
	logDetail_bodyTooLargeTitle: 'Тело слишком большое',
	logDetail_bodyTooLarge: (size, limit) => (size
		? `Тело весит ${size}, больше ${limit}, поэтому не сохранено.`
		: `Тело больше ${limit}, поэтому не сохранено.`),
	logDetail_close: 'Закрыть',
}

export const translations: Record<Lang, Translations> = { en, ru }
