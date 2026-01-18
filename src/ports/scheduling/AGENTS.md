# scheduling · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2026-01-19
- **Status:** draft

## Purpose

Port interfaces for scheduled graph execution. Defines contracts for job queuing, execution grants, schedule management, and run ledger.

## Pointers

- [SCHEDULER_SPEC.md](../../../docs/SCHEDULER_SPEC.md)
- [Parent ports/AGENTS.md](../AGENTS.md)

## Boundaries

```json
{
  "layer": "ports",
  "may_import": ["ports", "core", "types"],
  "must_not_import": ["app", "features", "adapters/server", "shared"]
}
```

## Public Surface

- **Exports (via index.ts):**
  - `JobQueuePort` — generic job enqueue interface (`enqueueJob(taskId, payload, runAt, jobKey, queueName?)`)
  - `ExecutionGrantPort` — grant CRUD + validation (`createGrant`, `validateGrant`, `validateGrantForGraph`, `deleteGrant`)
  - `ScheduleManagerPort` — schedule CRUD + stale detection (`createSchedule`, `getSchedule`, `listSchedules`, `updateSchedule`, `deleteSchedule`, `findStaleSchedules`, `updateNextRunAt`, `updateLastRunAt`)
  - `ScheduleRunRepository` — run ledger (`createRun`, `markRunStarted`, `markRunCompleted`)
  - Grant errors: `GrantNotFoundError`, `GrantExpiredError`, `GrantRevokedError`, `GrantScopeMismatchError`
  - Schedule errors: `ScheduleNotFoundError`, `ScheduleAccessDeniedError`, `InvalidCronExpressionError`, `InvalidTimezoneError`
  - Types: `ExecutionGrant`, `ScheduleSpec`, `CreateScheduleInput`, `UpdateScheduleInput`, `ScheduleRun`, `ScheduleRunStatus`, `EnqueueJobParams`
- **Routes:** none
- **CLI:** none
- **Env/Config keys:** none
- **Files considered API:** all \*.port.ts, index.ts

## Responsibilities

- This directory **does:** define interfaces for scheduling infrastructure, document grant/schedule invariants.
- This directory **does not:** contain implementations, SQL, or cron computation logic.

## Usage

```typescript
import type { JobQueuePort, ScheduleManagerPort } from "@/ports";
```

## Standards

- Interface-only files (no classes or side effects)
- Port filenames end with `.port.ts`
- Error classes define `name` and `message` for type guards

## Dependencies

- **Internal:** none
- **External:** none

## Change Protocol

- Update this file when **Exports** change
- Bump **Last reviewed** date
- Update parent ports/AGENTS.md

## Notes

- `JobQueuePort` is scheduler-agnostic (supports future Temporal migration)
- `validateGrantForGraph` owns scope checking (worker passes graphId, not scope strings)
- See SCHEDULER_SPEC.md for invariants: GRANT_SCOPES_CONSTRAIN_GRAPHS, JOB_KEY_PER_SLOT
