# scheduler-core · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @cogni-dao
- **Last reviewed:** 2026-01-21
- **Status:** stable

## Purpose

Pure TypeScript types and port interfaces for the scheduling domain. Defines contracts for schedule lifecycle, execution grants, execution requests, and schedule runs. Contains no implementations or I/O.

## Pointers

- [SCHEDULER_SPEC.md](../../docs/SCHEDULER_SPEC.md): Scheduling architecture and invariants
- [TEMPORAL_PATTERNS.md](../../docs/TEMPORAL_PATTERNS.md): Temporal patterns and anti-patterns

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

**External deps:** `zod` (payload schemas), `type-fest` (JsonValue type).

## Public Surface

- **Exports:**
  - `ScheduleControlPort` - Vendor-agnostic schedule lifecycle control (create/pause/resume/delete)
  - `ScheduleManagerPort` - Schedule CRUD operations with grant management
  - `ExecutionGrantPort` - Durable grant validation for scheduled runs
  - `ExecutionRequestPort` - Idempotency layer for execution requests
  - `ScheduleRunRepository` - Schedule run persistence
  - `ScheduleSpec`, `ScheduleRun`, `ExecutionGrant`, `ExecutionRequest` - Domain types
  - `ScheduleDescription`, `CreateScheduleParams` - Schedule control types
  - `IdempotencyCheckResult`, `ExecutionOutcome` - Execution request types
  - Error classes: `ScheduleControlUnavailableError`, `ScheduleControlConflictError`, `ScheduleControlNotFoundError`, grant errors, validation errors
  - Type guards: `isScheduleControl*Error`, `isGrant*Error`, `isSchedule*Error`
  - Payload schemas: `ExecuteScheduledRunPayloadSchema`, `ReconcileSchedulesPayloadSchema`
- **CLI:** none
- **Env/Config keys:** none
- **Files considered API:** `index.ts`

## Ports

- **Uses ports:** none
- **Implements ports:** none (defines port interfaces)

## Responsibilities

- This directory **does**: Define port interfaces, domain types, error classes, and Zod payload schemas
- This directory **does not**: Contain implementations, make I/O calls, or depend on any adapter code

## Usage

```bash
pnpm --filter @cogni/scheduler-core typecheck
pnpm --filter @cogni/scheduler-core build
```

## Standards

- Per `FORBIDDEN`: No `@/`, `src/`, `drizzle-orm`, or any I/O
- Per `ALLOWED`: Pure TypeScript types/interfaces only
- All exports must be serialization-safe (no Date objects in port interfaces, use ISO strings)

## Dependencies

- **Internal:** none (standalone package)
- **External:** `zod` (payload schemas), `type-fest` (JsonValue type)

## Change Protocol

- Update this file when port interfaces or error types change
- Coordinate with SCHEDULER_SPEC.md invariants
- Bump **Last reviewed** date

## Notes

- `ScheduleControlPort` replaces the deprecated `JobQueuePort` (Graphile Worker)
- Per CRUD_IS_TEMPORAL_AUTHORITY: Only CRUD endpoints use ScheduleControlPort
- Per WORKER_NEVER_CONTROLS_SCHEDULES: Worker service must not depend on ScheduleControlPort
