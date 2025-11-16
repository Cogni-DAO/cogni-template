# API tests · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-16
- **Status:** draft

## Purpose

Test API endpoints by making HTTP requests to a running Next.js server. Uses fake adapters in CI via APP_ENV=test.

## Pointers

- [API routes](../../src/app/api/)
- [HTTP contracts](../../src/contracts/http/)

## Boundaries

```json
{
  "layer": "tests",
  "may_import": ["contracts", "shared"],
  "must_not_import": ["features", "adapters/server", "adapters/worker", "core"]
}
```

## Public Surface

- **Exports:** none
- **Routes:** none
- **CLI:** `pnpm test:api`
- **Env/Config keys:** `TEST_BASE_URL`, `APP_ENV` (triggers fake adapters)
- **Files considered API:** `*.spec.ts`

## Responsibilities

- This directory **does:** verify API endpoints work end-to-end; assert fake adapter responses in CI
- This directory **does not:** test business logic or adapter implementations

## Usage

```bash
pnpm test tests/api
pnpm test:api
```

## Standards

- Mirror API structure under `tests/api/**` following `src/app/api/**`
- Use `fetch()` for HTTP requests
- Validate with contract schemas

## Dependencies

- **Internal:** src/contracts
- **External:** vitest, node fetch

## Change Protocol

- Update tests when API routes change
- Bump **Last reviewed** date
- Ensure contract schemas are up to date

## Notes

- Requires running Next.js server
- Uses `TEST_BASE_URL` environment variable (defaults to http://127.0.0.1:3000 if not set)
- CI sets `APP_ENV=test` to use fake adapters for deterministic responses
- No .env.test file needed - defaults handle local development
