# db-client · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @cogni-dao
- **Last reviewed:** 2026-01-21
- **Status:** stable

## Purpose

Database client factory and Drizzle adapter implementations for scheduling domain ports. Provides portable database access for the scheduler-worker service without framework dependencies.

## Pointers

- [SCHEDULER_SPEC.md](../../docs/SCHEDULER_SPEC.md): Scheduling architecture and invariants
- [PACKAGES_ARCHITECTURE.md](../../docs/PACKAGES_ARCHITECTURE.md): Package isolation boundaries
- [scheduler-core](../scheduler-core): Port interfaces implemented by adapters

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

**External deps:** `drizzle-orm`, `postgres`, `type-fest`. Internal deps: `@cogni/db-schema`, `@cogni/scheduler-core`, `@cogni/ai-core`.

## Public Surface

- **Exports:**
  - `createDbClient(url, logger?)` - Database client factory
  - `Database` - Drizzle client type
  - `LoggerLike` - Logger interface for client factory
  - `DrizzleScheduleManagerAdapter` - Implements `ScheduleManagerPort`
  - `DrizzleExecutionGrantAdapter` - Implements `ExecutionGrantPort`
  - `DrizzleExecutionRequestAdapter` - Implements `ExecutionRequestPort`
  - `DrizzleScheduleRunAdapter` - Implements `ScheduleRunRepository`
  - Re-exports from `@cogni/db-schema/scheduling` (tables, types)
- **CLI:** none
- **Env/Config keys:** none (accepts DATABASE_URL via factory parameter)
- **Files considered API:** `index.ts`

## Ports

- **Uses ports:** none
- **Implements ports:** `ScheduleManagerPort`, `ExecutionGrantPort`, `ExecutionRequestPort`, `ScheduleRunRepository`
- **Contracts:** Contract tests in `tests/contract/<port>.contract.ts`

## Responsibilities

- This directory **does**: Provide Drizzle-based adapter implementations for scheduling ports
- This directory **does not**: Access process.env, contain business logic, or depend on Next.js

## Usage

```bash
pnpm --filter @cogni/db-client typecheck
pnpm --filter @cogni/db-client build
```

## Standards

- Per FORBIDDEN: No `@/`, `src/`, `process.env`, or Next.js imports
- Per ALLOWED: Pure database operations via Drizzle ORM
- Adapters implement port interfaces from `@cogni/scheduler-core`

## Dependencies

- **Internal:** `@cogni/db-schema`, `@cogni/scheduler-core`, `@cogni/ai-core`
- **External:** `drizzle-orm`, `postgres`, `type-fest`

## Change Protocol

- Update this file when exports or port implementations change
- Bump **Last reviewed** date
- Ensure contract tests pass for implemented ports

## Notes

- Re-exports scheduling schema so consumers (scheduler-worker) get schema transitively
- All adapters accept a `Database` instance via constructor (dependency injection)
