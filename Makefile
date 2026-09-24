.DEFAULT_GOAL := help
SHELL := /bin/bash

.PHONY: help install build build-chrome build-firefox pack test e2e lint typecheck coverage clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-16s %s\n", $$1, $$2}'

install: ## Install dependencies from the lockfile
	npm ci

build: build-chrome build-firefox ## Build both browser packages

build-chrome: ## Build the Chrome (MV3) package into dist/chrome
	npm run build:chrome

build-firefox: ## Build the Firefox (MV2) package into dist/firefox
	npm run build:firefox

pack: ## Build and zip the Firefox add-on
	npm run pack:firefox

test: ## Run unit tests
	npm test

coverage: ## Run unit tests with a coverage report
	npm run vitest:coverage

e2e: build-chrome ## Run end-to-end tests against the built extension
	npm run playwright

lint: ## Run eslint and the TypeScript compiler
	npm run lint

typecheck: ## Type-check without emitting
	npm run typescript

clean: ## Remove build output and reports
	rm -rf dist coverage allure-results test-results junit.xml
