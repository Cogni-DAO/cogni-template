# stack · AGENTS.md

> Scope: this directory only. ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2026-01-12
- **Status:** stable

## Purpose

Full-stack HTTP API integration tests requiring running Docker Compose infrastructure.

## Pointers

- [Root AGENTS.md](../../AGENTS.md)
- [Architecture](../../docs/ARCHITECTURE.md)
- [Testing Documentation](../../docs/TESTING.md)

## Boundaries

```json
{
  "layer": "tests",
  "may_import": ["app", "adapters", "shared", "types"],
  "must_not_import": ["features", "core", "ports"],
  "database_access": "via_getDb_for_assertions"
}
```

## Public Surface

- **Exports:** none (test-only directory)
- **Routes (if any):** none
- **CLI (if any):** pnpm test:stack:dev, pnpm test:stack:docker, pnpm db:migrate:test
- **Env/Config keys:** TEST_BASE_URL, DATABASE_URL, POSTGRES_DB, APP_ENV
- **Files considered API:** \*.stack.test.ts files

## Responsibilities

- This directory **does**: Test HTTP API endpoints against running Docker Compose stack; verify request/response behavior; test auth flows
- This directory **does not**: Test adapters directly; mock infrastructure; test business logic

## Usage

Requires running Docker Compose stack with app+postgres services.

```bash
# One-time setup (creates test database and runs migrations)
pnpm test:stack:setup

# Start infrastructure for testing
pnpm dev:stack:test  # or pnpm docker:test:stack:fast

# Run stack tests (automatically polls /livez and /readyz, resets test database)
pnpm test:stack:dev  # or pnpm test:stack:docker
```

**Probe validation**: `setup/wait-for-probes.ts` runs as vitest globalSetup, polling `/livez` (20s budget) then `/readyz` (120s budget) before any tests execute. Tests fail fast if stack not ready.

## Standards

- **Facade-level testing**: Stack tests call facades directly with real DB and configured fake adapters (APP_ENV=test)
- Tests use getDb() for direct DB assertions to verify side effects
- Use .stack.test.ts extension
- Focus on full vertical slice validation (facade → service → ports → DB)
- Database is reset automatically between test runs via vitest.stack.config.mts
- Configure fake adapters via exported test helpers (e.g., getTestOnChainVerifier)
- Never hard-code wallet addresses: use `seedAuthenticatedUser()` from `@tests/_fixtures/auth/db-helpers` which auto-generates unique addresses
- Fail fast: use explicit guards (`if (!record) throw`) instead of defensive `??` fallbacks in assertions
- BigInt conversions: use `asNumber()` from `@tests/_fixtures/db-utils` when asserting DB values (safe for values < 2^53)

## Dependencies

- **Internal:** app/\_facades/, adapters/server/db, adapters/test, shared/
- **External:** Running Next.js app, PostgreSQL database

## Change Protocol

- Update this file when **Test scope** or **Infrastructure requirements** change
- Bump **Last reviewed** date
- Ensure all stack tests run against real HTTP endpoints

## Notes

- Stack tests are slower than integration tests
- Requires external infrastructure (Docker Compose)
- Tests run sequentially to avoid database conflicts
- Uses APP_ENV=test in CI to get FakeLlmAdapter responses
