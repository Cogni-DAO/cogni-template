# stack · AGENTS.md

> Scope: this directory only. ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-17
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
  "layer": "tests/stack",
  "may_import": ["shared", "types"],
  "must_not_import": ["app", "features", "core", "adapters", "ports"]
}
```

## Public Surface

- **Exports:** none (test-only directory)
- **Routes (if any):** none
- **CLI (if any):** pnpm test:stack
- **Env/Config keys:** TEST_BASE_URL
- **Files considered API:** \*.stack.test.ts files

## Responsibilities

- This directory **does**: Test HTTP API endpoints against running Docker Compose stack; verify request/response behavior; test auth flows
- This directory **does not**: Test adapters directly; mock infrastructure; test business logic

## Usage

Requires running Docker Compose stack with app+postgres services.

```bash
# Start stack first
docker compose -f platform/infra/services/runtime/docker-compose.yml up -d app postgres

# Run stack tests
pnpm test:stack
```

## Standards

- Tests make real HTTP requests to TEST_BASE_URL
- Use .stack.test.ts extension
- Focus on API contract compliance, not business logic
- Clean up test data in afterAll/afterEach hooks

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
