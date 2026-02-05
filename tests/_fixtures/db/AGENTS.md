# tests/\_fixtures/db · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @cogni-dao
- **Last reviewed:** 2026-02-05
- **Status:** stable

## Purpose

Database fixture helpers for integration tests. Provides a service-role (BYPASSRLS) database client for test seeding and cleanup operations.

## Pointers

- [testcontainers global setup](../../integration/setup/testcontainers-postgres.global.ts)
- [DATABASE_RLS_SPEC.md](../../../docs/DATABASE_RLS_SPEC.md): RLS architecture

## Boundaries

```json
{
  "layer": "tests",
  "may_import": ["packages"],
  "must_not_import": ["adapters", "core", "features", "app", "ports"]
}
```

## Public Surface

- **Exports:**
  - `getSeedDb()` — lazy service-role database singleton (BYPASSRLS) for test INSERT/DELETE
- **Routes:** none
- **CLI:** none
- **Env/Config keys:** `DATABASE_SERVICE_URL` (set by testcontainers global setup)
- **Files considered API:** `seed-client.ts`

## Ports

- **Uses ports:** none
- **Implements ports:** none

## Responsibilities

- This directory **does**: Provide BYPASSRLS database access for test fixture seeding and cleanup
- This directory **does not**: Provide app-role access, contain test assertions, or run application code

## Usage

```bash
pnpm test:int
```

## Standards

- Test code uses `getSeedDb()` for INSERT/DELETE (seeding) and SELECT assertions (BYPASSRLS)
- Requires `DATABASE_SERVICE_URL` in env (set by testcontainers global setup)

## Dependencies

- **Internal:** `@cogni/db-client`, `@cogni/db-client/service`
- **External:** none

## Change Protocol

- Update this file when **Exports** or **Env/Config** change
- Bump **Last reviewed** date

## Notes

- `getSeedDb()` connects via `DATABASE_SERVICE_URL`, not `DATABASE_URL`
- Lazy singleton — connects on first access only
