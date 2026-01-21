# db-schema · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @cogni-dao
- **Last reviewed:** 2026-01-21
- **Status:** stable

## Purpose

Drizzle ORM table definitions for all database domains. Provides type-safe schema exports consumed by adapters and the main application.

## Pointers

- [SCHEDULER_SPEC.md](../../docs/SCHEDULER_SPEC.md): Scheduling domain invariants
- [DATABASES.md](../../docs/DATABASES.md): Database architecture and migrations
- [PACKAGES_ARCHITECTURE.md](../../docs/PACKAGES_ARCHITECTURE.md): Package isolation boundaries

## Boundaries

```json
{
  "layer": "packages",
  "may_import": ["packages"],
  "must_not_import": [
    "app",
    "features",
    "ports",
    "core",
    "adapters",
    "shared",
    "services"
  ]
}
```

**External deps:** `drizzle-orm`.

## Public Surface

- **Exports (via subpath exports):**
  - `@cogni/db-schema/refs` - Core FK reference tables (`users`, `billingAccounts`)
  - `@cogni/db-schema/scheduling` - Scheduling tables (`executionGrants`, `schedules`, `scheduleRuns`, `executionRequests`, `SCHEDULE_RUN_STATUSES`)
  - `@cogni/db-schema/auth` - Auth tables
  - `@cogni/db-schema/billing` - Billing tables
  - `@cogni/db-schema/ai` - AI-related tables
- **CLI:** none
- **Env/Config keys:** none
- **Files considered API:** All `src/*.ts` files via package.json exports

## Ports

- **Uses ports:** none
- **Implements ports:** none (schema definitions only)

## Responsibilities

- This directory **does**: Define Drizzle table schemas, foreign key relationships, indexes
- This directory **does not**: Contain queries, adapters, business logic, or I/O

## Usage

```bash
pnpm --filter @cogni/db-schema typecheck
pnpm --filter @cogni/db-schema build
```

## Standards

- Per FORBIDDEN: No `@/`, `src/`, `process.env`, or runtime logic
- Per ALLOWED: Pure Drizzle schema definitions only
- All tables reference core entities via `./refs.ts` imports

## Dependencies

- **Internal:** none (standalone package)
- **External:** `drizzle-orm`

## Change Protocol

- Update this file when table schemas or subpath exports change
- Bump **Last reviewed** date
- Run migrations after schema changes

## Notes

- Subpath exports enable tree-shaking: consumers import only needed slices
- `refs.ts` defines FK target tables shared across all slices
- Schedule tables support Temporal migration (execution_requests for idempotency)
