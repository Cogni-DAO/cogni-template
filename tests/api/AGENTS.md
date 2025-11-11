# API tests · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-11
- **Status:** draft

## Purpose

Test API endpoints by making HTTP requests to a running Next.js server.

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
- **Env/Config keys:** `TEST_BASE_URL`
- **Files considered API:** `*.spec.ts`

## Responsibilities

- This directory **does:** verify API endpoints work end-to-end
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
- No .env.test file needed - defaults handle local development
