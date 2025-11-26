# stack · AGENTS.md

> Scope: this directory only. ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-18
- **Status:** draft

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
  "may_import": ["shared", "types"],
  "must_not_import": ["app", "features", "core", "adapters", "ports"],
  "database_access": "external_client_only"
}
```

## Public Surface

- **Exports:** none (test-only directory)
- **Routes (if any):** none
- **CLI (if any):** pnpm test:stack, pnpm test:stack:setup, pnpm test:stack:db:migrate, pnpm docker:stack:test
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

# Run stack tests (automatically resets test database)
pnpm test:stack:dev  # or pnpm test:stack:docker
```

## Standards

- **HTTP-first testing**: Stack tests MUST NOT import app DB clients, adapters, or server internals
- Tests make real HTTP requests to TEST_BASE_URL as primary interface
- Database inspection allowed via exposed ports (e.g., for verifying side effects)
- Use .stack.test.ts extension
- Focus on API contract compliance, not business logic
- Database is reset automatically between test runs (no manual cleanup needed)

## Dependencies

- **Internal:** shared/ (for utilities only)
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
