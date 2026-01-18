# scheduling · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2026-01-19
- **Status:** draft

## Purpose

Drizzle-based adapter implementations for scheduling ports. Handles schedule CRUD, execution grants, job queue, and run ledger persistence.

## Pointers

- [SCHEDULER_SPEC.md](../../../../docs/SCHEDULER_SPEC.md)
- [Scheduling Ports](../../../ports/scheduling/)

## Boundaries

```json
{
  "layer": "adapters/server",
  "may_import": ["ports", "shared", "types"],
  "must_not_import": ["app", "features", "core", "contracts"]
}
```

## Public Surface

- **Exports (via index.ts):**
  - `DrizzleJobQueueAdapter` — implements `JobQueuePort` (wraps `graphile_worker.add_job`)
  - `DrizzleExecutionGrantAdapter` — implements `ExecutionGrantPort`
  - `DrizzleScheduleManagerAdapter` — implements `ScheduleManagerPort`
  - `DrizzleScheduleRunAdapter` — implements `ScheduleRunRepository`
- **Routes:** none
- **CLI:** none
- **Env/Config keys:** none
- **Files considered API:** index.ts

## Ports

- **Uses ports:** none
- **Implements ports:** `JobQueuePort`, `ExecutionGrantPort`, `ScheduleManagerPort`, `ScheduleRunRepository`
- **Contracts:** tests/contract/schedules.contracts.test.ts, tests/stack/scheduling/schedules-crud.stack.test.ts

## Responsibilities

- This directory **does:** persist schedules, grants, runs; enqueue Graphile Worker jobs; validate grants for graph execution.
- This directory **does not:** contain scheduling logic, cron computation, or worker task code.

## Usage

```typescript
import {
  DrizzleJobQueueAdapter,
  DrizzleExecutionGrantAdapter,
} from "@/adapters/server";
```

## Standards

- All SQL encapsulated in adapters (no raw SQL outside this directory)
- Grant validation checks scope format `graph:execute:{graphId}` or wildcard
- Job enqueue uses `job_key_mode => 'replace'` for idempotency

## Dependencies

- **Internal:** @/ports/scheduling, @/shared/db
- **External:** drizzle-orm

## Change Protocol

- Update this file when **Exports** or **Implements ports** change
- Bump **Last reviewed** date
- Ensure contract tests pass

## Notes

- `DrizzleScheduleManagerAdapter` creates grant + schedule + job atomically on schedule creation
- Scope format owned by `DrizzleExecutionGrantAdapter.validateGrantForGraph()`
