# Scheduled Graph Execution Design

> [!CRITICAL]
> Scheduled runs execute via **internal HTTP API** using durable **ExecutionGrants** (not user sessions). Worker calls `POST /api/internal/graphs/{graphId}/runs` with shared-secret auth—never imports graph execution code.

---

## Core Invariants

> See [TEMPORAL_PATTERNS.md](TEMPORAL_PATTERNS.md) for canonical Temporal patterns, anti-patterns, and code examples shared across scheduler and governance workflows.

### Governance Layer (Stable)

1. **SCHEDULES_NEVER_BYPASS_EXECUTOR**: All scheduled graph execution flows through `GraphExecutorPort.runGraph()`. Scheduling layer owns timing only—never direct LLM/provider calls.

2. **GRANT_NOT_SESSION**: Scheduled runs authenticate via durable `ExecutionGrant` (scoped, revocable, time-limited), never user sessions. Workers never hold `NextAuth` session state.

3. **BILLING_VIA_GRANT**: Every `ExecutionGrant` has a `billingAccountId`. Execution service derives `virtualKeyId` from billing account's default key. All existing billing/idempotency invariants (GRAPH_EXECUTION.md) apply unchanged.

4. **GRANT_VALIDATED_TWICE**: Worker validates grant before calling API (fail-fast). Execution service re-validates grant validity + scope (defense-in-depth). Scope format: `graph:execute:{graphId}` or `graph:execute:*`.

5. **RUN_LEDGER_FOR_GOVERNANCE**: Every execution creates `schedule_runs` record with status progression (pending→running→success/error).

6. **EXECUTION_VIA_SERVICE_API**: Worker triggers runs via HTTP to `POST /api/internal/graphs/{graphId}/runs`. Worker NEVER imports graph execution code.

7. **INTERNAL_API_SHARED_SECRET**: Internal calls require Bearer token (shared secret). Follows `METRICS_TOKEN` pattern. Caller service name logged. P1: JWT with aud/exp.

8. **EXECUTION_IDEMPOTENCY_PERSISTED**: `execution_requests` table persists idempotency key → `{runId, traceId}`. This is the correctness layer for slot deduplication.

9. **RUN_OWNERSHIP_BOUNDARY**: Worker owns `schedule_runs`. Execution service owns graph runs + billing (`charge_receipts`). Correlation via `runId` and `langfuseTraceId`.

### Temporal-Specific Invariants

10. **WORKFLOW_ID_INCLUDES_TIMESTAMP**: Temporal workflowId = `{scheduleId}:{TemporalScheduledStartTime}`. Each scheduled slot gets a unique workflow. `scheduleId` remains the business key for correlation. Temporal overlap=SKIP ensures only one active workflow per schedule at a time.

11. **SLOT_IDEMPOTENCY_VIA_EXECUTION_REQUESTS**: Slot deduplication handled by `execution_requests` table with key = `scheduleId:TemporalScheduledStartTime`. The internal API idempotency layer (request_hash check) is the correctness guarantee—not workflowId uniqueness.

11b. **ACTIVITY_IDEMPOTENCY**: All Activities must be idempotent or rely on downstream idempotency. `executeGraphActivity` relies on `execution_requests` table. `updateScheduleRunActivity` must use monotonic status updates (pending→running→success/error, never backwards).

12. **SCHEDULED_TIMESTAMP_FROM_TEMPORAL**: Activities derive `scheduledFor` from `TemporalScheduledStartTime` search attribute (authoritative source), never from workflow input or wall clock.

13. **CRUD_IS_TEMPORAL_AUTHORITY**: Schedule CRUD endpoints (create/update/enable/disable/delete) are the single authority for Temporal schedule lifecycle. Worker never modifies schedules.

14. **NO_WORKER_RECONCILIATION**: Worker executes workflows only. Drift repair is a separate admin command (`pnpm scheduler:reconcile`), not an always-on loop.

15. **DB_TIMING_IS_CACHE_ONLY**: `schedules.next_run_at` and `last_run_at` are cache columns for UI/quick-queries. Authoritative timing lives in Temporal. Synced on CRUD only; drift is acceptable.

16. **SKIP_MISSED_RUNS**: P0 does not backfill missed runs. Temporal `catchupWindow=0` enforces this.

---

## Architecture

### Progression

| Phase           | Worker Entry                            | Scheduler          | Status     |
| --------------- | --------------------------------------- | ------------------ | ---------- |
| **1 (Legacy)**  | `src/scripts/run-scheduler-worker.ts`   | Graphile Worker    | ✅ Deleted |
| **2 (Current)** | `services/scheduler-worker/src/main.ts` | Graphile Worker    | ✅ Merged  |
| **3 (Next)**    | `services/scheduler-temporal-worker/`   | Temporal Schedules | 🔲 Planned |

### Package Extraction (Complete)

| Extracted From                       | Extracted To            |
| ------------------------------------ | ----------------------- |
| `src/types/scheduling.ts`            | `@cogni/scheduler-core` |
| `src/ports/scheduling/*`             | `@cogni/scheduler-core` |
| `src/adapters/server/scheduling/*`   | `@cogni/db-client`      |
| `src/shared/db/schema.scheduling.ts` | `@cogni/db-schema`      |

### Temporal Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ CRUD Endpoints (Single Authority for Temporal Schedules)                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  POST /api/v1/schedules                                                     │
│    1. Insert into schedules table                                           │
│    2. temporalClient.schedule.create({                                      │
│         scheduleId: dbSchedule.id,                                          │
│         spec: { cronExpressions: [cron], timezone },                        │
│         action: { type: 'startWorkflow', workflowId: dbSchedule.id, ... },  │
│         policies: { overlap: 'SKIP', catchupWindow: 0 }                     │
│       })                                                                    │
│    3. Update schedules.temporal_schedule_id                                 │
│                                                                             │
│  PATCH /api/v1/schedules/:id (enabled=false)                                │
│    1. Update DB                                                             │
│    2. temporalClient.schedule.pause(scheduleId)                             │
│                                                                             │
│  DELETE /api/v1/schedules/:id                                               │
│    1. Delete from DB                                                        │
│    2. temporalClient.schedule.delete(scheduleId)                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Temporal Infrastructure                                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Temporal Cloud (or self-hosted)                                            │
│    • Namespace: cogni-{env}                                                 │
│    • TaskQueue: governance-runs                                             │
│    • Schedules: overlap=SKIP, catchupWindow=0                               │
│                                                                             │
│  services/scheduler-temporal-worker/                                        │
│    • Connects to Temporal, registers taskQueue                              │
│    • Hosts GovernanceScheduledRunWorkflow + Activities                      │
│    • Does NOT create/update/delete schedules (CRUD is authority)            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Execution Flow                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Temporal Schedule fires → GovernanceScheduledRunWorkflow                   │
│    Activity: validateGrantActivity(grantId)         // fail-fast            │
│    Activity: createScheduleRunActivity(...)         // ledger entry         │
│    Activity: executeGraphActivity({                                         │
│      scheduleId,                                                            │
│      graphId,                                                               │
│      grantId,                                                               │
│      scheduledFor: TemporalScheduledStartTime,      // from Temporal        │
│      idempotencyKey: `${scheduleId}:${scheduledFor}`                        │
│    })                                                                       │
│      → POST /api/internal/graphs/{graphId}/runs                             │
│         ├─ Bearer: $INTERNAL_API_TOKEN                                      │
│         ├─ Idempotency-Key: {scheduleId}:{scheduledFor}                     │
│         └─ Body: { executionGrantId, input }                                │
│    Activity: updateScheduleRunActivity(success/error)                       │
│                                                                             │
│  [If HITL required]                                                         │
│    Workflow waits for Signal: 'plane_review_decision'                       │
│    Plane webhook → temporalClient.workflow.signal(...)                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Idempotency Layers

| Layer         | Key                                     | Storage              | Prevents                |
| ------------- | --------------------------------------- | -------------------- | ----------------------- |
| Workflow      | workflowId = scheduleId                 | Temporal             | Concurrent workflows    |
| Execution API | `scheduleId:TemporalScheduledStartTime` | `execution_requests` | Duplicate runs on retry |
| Billing       | `runId/attempt/unit`                    | `charge_receipts`    | Duplicate charges       |

---

## Schema

### `execution_grants`

| Column               | Type        | Constraints                   | Notes                              |
| -------------------- | ----------- | ----------------------------- | ---------------------------------- |
| `id`                 | uuid        | PK                            |                                    |
| `user_id`            | text        | NOT NULL, FK users            | Grant owner                        |
| `billing_account_id` | text        | NOT NULL, FK billing_accounts | Charge target                      |
| `scopes`             | text[]      | NOT NULL                      | `["graph:execute:langgraph:poet"]` |
| `expires_at`         | timestamptz | NULL                          | Optional expiration                |
| `revoked_at`         | timestamptz | NULL                          | Soft revocation                    |
| `created_at`         | timestamptz | NOT NULL                      |                                    |

**Indexes:** `idx_grants_user_id`, `idx_grants_billing_account_id`

### `schedules`

| Column                 | Type        | Constraints                   | Notes                                      |
| ---------------------- | ----------- | ----------------------------- | ------------------------------------------ |
| `id`                   | uuid        | PK                            | Also used as Temporal scheduleId           |
| `owner_user_id`        | text        | NOT NULL, FK users            |                                            |
| `execution_grant_id`   | uuid        | NOT NULL, FK execution_grants |                                            |
| `graph_id`             | text        | NOT NULL                      | e.g., `langgraph:poet`                     |
| `input`                | jsonb       | NOT NULL                      | Graph input payload                        |
| `cron`                 | text        | NOT NULL                      | 5-field cron                               |
| `timezone`             | text        | NOT NULL                      | IANA timezone                              |
| `enabled`              | boolean     | NOT NULL, default true        |                                            |
| `temporal_schedule_id` | text        | NULL                          | Set after Temporal schedule created        |
| `next_run_at`          | timestamptz | NULL                          | **CACHE ONLY** - synced on CRUD, may drift |
| `last_run_at`          | timestamptz | NULL                          | **CACHE ONLY** - updated on run completion |
| `created_at`           | timestamptz | NOT NULL                      |                                            |
| `updated_at`           | timestamptz | NOT NULL                      |                                            |

**Indexes:** `idx_schedules_owner`, `idx_schedules_grant`

> **Note:** `next_run_at` and `last_run_at` are cache columns for UI display. Authoritative timing is from `temporalClient.schedule.describe(scheduleId).info.nextActionTimes`.

### `schedule_runs`

| Column              | Type        | Constraints                 | Notes                                 |
| ------------------- | ----------- | --------------------------- | ------------------------------------- |
| `id`                | uuid        | PK                          |                                       |
| `schedule_id`       | uuid        | NOT NULL, FK schedules      |                                       |
| `run_id`            | text        | **NULL**                    | Set after execution API responds      |
| `scheduled_for`     | timestamptz | NOT NULL                    | From TemporalScheduledStartTime       |
| `started_at`        | timestamptz | NULL                        |                                       |
| `completed_at`      | timestamptz | NULL                        |                                       |
| `status`            | text        | NOT NULL, default 'pending' | pending/running/success/error/skipped |
| `langfuse_trace_id` | text        | NULL                        |                                       |
| `error_message`     | text        | NULL                        |                                       |

**Indexes:** `idx_runs_schedule`, `idx_runs_scheduled_for`, `idx_runs_run_id`
**Unique:** `(schedule_id, scheduled_for)` — one run per slot
**Pattern:** Idempotent get-or-create via `INSERT ON CONFLICT DO NOTHING` + `SELECT`.

### `execution_requests`

| Column            | Type        | Constraints | Notes                                   |
| ----------------- | ----------- | ----------- | --------------------------------------- |
| `idempotency_key` | text        | PK          | `scheduleId:TemporalScheduledStartTime` |
| `request_hash`    | text        | NOT NULL    | SHA256 of normalized request payload    |
| `run_id`          | text        | NOT NULL    |                                         |
| `trace_id`        | text        | NULL        |                                         |
| `created_at`      | timestamptz | NOT NULL    |                                         |

**Purpose:** Persists idempotency as the correctness layer for slot deduplication.
**Invariant:** If `idempotency_key` exists but `request_hash` differs, reject with 422 (payload mismatch).

---

## File Pointers

### Current (Implemented)

| File                                                          | Purpose                                                 |
| ------------------------------------------------------------- | ------------------------------------------------------- |
| `packages/scheduler-core/src/types.ts`                        | `ExecutionGrant`, `ScheduleSpec`, `ScheduleRun` types   |
| `packages/db-schema/src/scheduling.ts`                        | `execution_grants`, `schedules`, `schedule_runs` tables |
| `packages/scheduler-core/src/ports/execution-grant.port.ts`   | `ExecutionGrantPort` + error classes                    |
| `packages/scheduler-core/src/ports/schedule-manager.port.ts`  | `ScheduleManagerPort` interface                         |
| `packages/scheduler-core/src/ports/schedule-run.port.ts`      | `ScheduleRunRepository` interface                       |
| `packages/db-client/src/adapters/drizzle-grant.adapter.ts`    | `DrizzleExecutionGrantAdapter`                          |
| `packages/db-client/src/adapters/drizzle-schedule.adapter.ts` | `DrizzleScheduleManagerAdapter`                         |
| `packages/db-client/src/adapters/drizzle-run.adapter.ts`      | `DrizzleScheduleRunAdapter`                             |
| `src/contracts/schedules.*.v1.contract.ts`                    | Schedule CRUD contracts (4 files)                       |
| `src/app/api/v1/schedules/route.ts`                           | POST (create), GET (list)                               |
| `src/app/api/v1/schedules/[scheduleId]/route.ts`              | PATCH (update), DELETE                                  |
| `src/bootstrap/container.ts`                                  | Wire scheduling ports                                   |
| `packages/scheduler-core/src/payloads.ts`                     | Zod payload schemas                                     |

### Planned (Temporal Migration)

| File                                                  | Purpose                                |
| ----------------------------------------------------- | -------------------------------------- |
| `services/scheduler-temporal-worker/`                 | Temporal worker service                |
| `services/scheduler-temporal-worker/src/main.ts`      | Worker entry, connects to Temporal     |
| `services/scheduler-temporal-worker/src/workflows/`   | GovernanceScheduledRunWorkflow         |
| `services/scheduler-temporal-worker/src/activities/`  | validateGrant, createRun, executeGraph |
| `src/app/api/internal/graphs/[graphId]/runs/route.ts` | Internal execution endpoint            |
| `src/contracts/graphs.run.internal.v1.contract.ts`    | Internal execution contract            |
| `packages/scheduler-core/src/ports/temporal.port.ts`  | TemporalSchedulePort interface         |

### To Delete (Post-Migration)

| File                                                           | Reason                                |
| -------------------------------------------------------------- | ------------------------------------- |
| `services/scheduler-worker/`                                   | Replaced by scheduler-temporal-worker |
| `packages/scheduler-core/src/ports/job-queue.port.ts`          | Graphile-specific                     |
| `packages/db-client/src/adapters/drizzle-job-queue.adapter.ts` | Graphile-specific                     |
| `services/scheduler-worker/src/tasks/reconcile.ts`             | Temporal handles scheduling natively  |

---

## Implementation Checklist

### P0: Completed

- [x] Types: `ExecutionGrant`, `ScheduleSpec`, `ScheduleRun` in `@cogni/scheduler-core`
- [x] Schema: `execution_grants`, `schedules`, `schedule_runs` tables
- [x] Ports: `ExecutionGrantPort`, `ScheduleManagerPort`, `ScheduleRunRepository`
- [x] Adapters: All Drizzle adapters implemented
- [x] Routes: `/api/v1/schedules` CRUD endpoints
- [x] Package extraction complete

### P0: Internal Execution API (Complete)

- [x] `POST /api/internal/graphs/{graphId}/runs` — service-auth endpoint
- [x] Auth: Bearer `SCHEDULER_API_TOKEN`, constant-time compare
- [x] Re-validate grant (validity + scope) — defense-in-depth
- [x] Request: `{ executionGrantId, input }` → Response: `{ runId, traceId, ok, errorCode? }`
- [x] Create `execution_requests` table with `request_hash`
- [x] On conflict: if `request_hash` matches return cached; if differs return 422
- [x] Add `AccountService.getBillingAccountById` for grant → virtualKeyId resolution
- [x] Stack tests for auth, idempotency, and grant validation

### P1: Temporal Migration

**Infrastructure:**

- [ ] Stand up Temporal (Cloud preferred, or local dev-server)
- [ ] Add env vars: `TEMPORAL_ADDRESS`, `TEMPORAL_NAMESPACE`, `TEMPORAL_TASK_QUEUE`
- [ ] Add `@temporalio/client` to app server dependencies

**CRUD → Temporal Integration:**

- [ ] Update `POST /api/v1/schedules` to create Temporal schedule (scheduleId = DB id)
- [ ] Update `PATCH /api/v1/schedules/:id` to pause/unpause Temporal schedule
- [ ] Update `DELETE /api/v1/schedules/:id` to delete Temporal schedule
- [ ] Set policies: `overlap: 'SKIP'`, `catchupWindow: 0`

**Worker Service:**

- [ ] Create `services/scheduler-temporal-worker/`
- [ ] Implement `GovernanceScheduledRunWorkflow`
- [ ] Implement Activities: `validateGrant`, `createScheduleRun`, `executeGraph`, `updateScheduleRun`
- [ ] Activities derive `scheduledFor` from `TemporalScheduledStartTime`
- [ ] Add Dockerfile and docker-compose entry

**Cleanup:**

- [ ] Delete `services/scheduler-worker/` (Graphile worker)
- [ ] Delete `JobQueuePort` and `DrizzleJobQueueAdapter`
- [ ] Remove Graphile Worker dependencies

### P2: HITL Integration

- [ ] Add Signal handler for `plane_review_decision` in workflow
- [ ] Implement Plane webhook endpoint to signal workflows
- [ ] Workflow waits for signal, then resumes execution

### P3: Admin Tools

- [ ] `pnpm scheduler:reconcile` — one-shot drift repair command
- [ ] Compare DB schedules vs Temporal schedules
- [ ] Report: missing, orphaned, state mismatch
- [ ] Optional `--fix` flag with audit logging

---

## Anti-Patterns

| Anti-Pattern                            | Why Forbidden                                   |
| --------------------------------------- | ----------------------------------------------- |
| Network calls in Temporal Workflow code | Non-deterministic; replays will fail            |
| Worker creates/modifies schedules       | CRUD endpoints are the single authority         |
| Reconciliation loop in worker           | Rebuilds control plane; creates authority split |
| Relying on workflowId for slot dedupe   | Use `execution_requests` table instead          |
| Using wall clock for scheduledFor       | Use `TemporalScheduledStartTime` attribute      |
| NextAuth sessions in workers            | Sessions expire; workers are long-lived         |
| Execution without idempotency key       | Retries cause duplicate runs                    |
| Worker imports graph code               | Couples to Next.js; prevents scaling            |
| Treating next_run_at as authoritative   | It's cache-only; Temporal is source of truth    |

---

## Auth & Boundary Summary

| Boundary                     | Auth                 | Precedent               |
| ---------------------------- | -------------------- | ----------------------- |
| User → Schedule API          | NextAuth session     | Existing                |
| Worker → Internal API        | Bearer shared secret | `METRICS_TOKEN` pattern |
| Internal API → GraphExecutor | In-process           | Same runtime            |

**Non-Negotiables:**

1. No user sessions in worker — use `ExecutionGrant` references only
2. No network-only auth — Bearer token required
3. Persist idempotency — `execution_requests` is the correctness layer
4. CRUD owns Temporal schedule lifecycle — worker is execution-only

---

## Related Documents

- [TEMPORAL_PATTERNS.md](TEMPORAL_PATTERNS.md) — Canonical Temporal patterns and anti-patterns
- [GRAPH_EXECUTION.md](GRAPH_EXECUTION.md) — Execution invariants, billing
- [ACCOUNTS_DESIGN.md](ACCOUNTS_DESIGN.md) — Billing account lifecycle
- [ARCHITECTURE.md](ARCHITECTURE.md) — Hexagonal pattern
- [PACKAGES_ARCHITECTURE.md](PACKAGES_ARCHITECTURE.md) — Package boundaries and rules

## Sources

- [Temporal Schedules](https://docs.temporal.io/workflows#schedule) — Native cron replacement
- [Temporal TypeScript SDK](https://docs.temporal.io/develop/typescript) — Worker and client APIs
- [Temporal Search Attributes](https://docs.temporal.io/visibility#search-attribute) — TemporalScheduledStartTime
- [Stripe Idempotency](https://stripe.com/docs/api/idempotent_requests) — Idempotency key pattern

---

**Last Updated**: 2026-01-21
**Status**: P0 internal execution API complete; P1 Temporal migration is next
