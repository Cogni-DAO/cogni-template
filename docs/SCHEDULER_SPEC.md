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

10. **NAMESPACE_PER_ENV**: Temporal namespace = `cogni-{APP_ENV}` (cogni-test, cogni-production). Single `scheduler-tasks` task queue per namespace.

11. **WORKER_NEVER_CONTROLS_SCHEDULES**: `scheduler-temporal-worker` must not depend on `ScheduleControlPort` or call Temporal schedule APIs. CRUD routes are the single authority. Enforce via dep-cruiser.

12. **WORKFLOW_ID_INCLUDES_TIMESTAMP**: Temporal workflowId = `{scheduleId}:{TemporalScheduledStartTime}`. Each scheduled slot gets a unique workflow. `scheduleId` remains the business key for correlation. Temporal overlap=SKIP ensures only one active workflow per schedule at a time.

13. **SLOT_IDEMPOTENCY_VIA_EXECUTION_REQUESTS**: Slot deduplication handled by `execution_requests` table with key = `scheduleId:TemporalScheduledStartTime`. The internal API idempotency layer (request_hash check) is the correctness guarantee—not workflowId uniqueness.

13b. **ACTIVITY_IDEMPOTENCY**: All Activities must be idempotent or rely on downstream idempotency. `executeGraphActivity` relies on `execution_requests` table. `updateScheduleRunActivity` must use monotonic status updates (pending→running→success/error, never backwards).

14. **SCHEDULED_TIMESTAMP_FROM_TEMPORAL**: Activities derive `scheduledFor` from `TemporalScheduledStartTime` search attribute (authoritative source), never from workflow input or wall clock.

15. **CRUD_IS_TEMPORAL_AUTHORITY**: Schedule CRUD endpoints (create/update/enable/disable/delete) are the single authority for Temporal schedule lifecycle. Worker never modifies schedules.

16. **NO_WORKER_RECONCILIATION**: Worker executes workflows only. Drift repair is a separate admin command (`pnpm scheduler:reconcile`), not an always-on loop.

17. **DB_TIMING_IS_CACHE_ONLY**: `schedules.next_run_at` and `last_run_at` are cache columns for UI/quick-queries. Authoritative timing lives in Temporal. Synced on CRUD only; drift is acceptable.

18. **SKIP_MISSED_RUNS**: P0 does not backfill missed runs. Temporal `catchupWindow=0` enforces this.

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
│ All Temporal calls go through ScheduleControlPort (vendor-agnostic)         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  POST /api/v1/schedules                                                     │
│    1. Create ExecutionGrant                                                 │
│    2. Insert into schedules table                                           │
│    3. scheduleControl.createSchedule({ scheduleId, cron, timezone, ... })   │
│       └─► Adapter: overlap=SKIP, catchupWindow=0 (hardcoded)                │
│    On Temporal failure: rollback DB, return 503                             │
│                                                                             │
│  PATCH /api/v1/schedules/:id (enabled toggle)                               │
│    1. Update DB                                                             │
│    2. scheduleControl.pauseSchedule() / resumeSchedule()                    │
│    On Temporal failure: rollback DB, return 503                             │
│                                                                             │
│  DELETE /api/v1/schedules/:id                                               │
│    1. scheduleControl.deleteSchedule()                                      │
│    2. Delete from DB (only if Temporal succeeds)                            │
│    On Temporal failure: return 503, do NOT delete DB                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Temporal Infrastructure                                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Temporal Cloud (or self-hosted)                                            │
│    • Namespace: cogni-{APP_ENV}                                             │
│    • TaskQueue: scheduler-tasks                                             │
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

| Layer             | Key                                         | Storage              | Prevents                    |
| ----------------- | ------------------------------------------- | -------------------- | --------------------------- |
| Temporal Schedule | scheduleId (DB UUID)                        | Temporal             | Duplicate schedule identity |
| Workflow          | workflowId = `{scheduleId}:{scheduledFor}`  | Temporal             | Concurrent slot executions  |
| Execution API     | `{scheduleId}:{TemporalScheduledStartTime}` | `execution_requests` | Duplicate runs on retry     |
| Billing           | `runId/attempt/unit`                        | `charge_receipts`    | Duplicate charges           |

> **Note:** Temporal `scheduleId` = DB `schedules.id`. Each scheduled slot gets a unique `workflowId` with timestamp suffix. `overlap=SKIP` ensures only one active workflow per schedule at a time.

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
| `run_id`            | text        | NULL                        | Set after execution API responds      |
| `scheduled_for`     | timestamptz | NOT NULL                    | From TemporalScheduledStartTime       |
| `started_at`        | timestamptz | NULL                        |                                       |
| `completed_at`      | timestamptz | NULL                        |                                       |
| `status`            | text        | NOT NULL, default 'pending' | pending/running/success/error/skipped |
| `langfuse_trace_id` | text        | NULL                        |                                       |
| `error_message`     | text        | NULL                        |                                       |

**Indexes:** `idx_runs_schedule`, `idx_runs_scheduled_for`, `idx_runs_run_id`
**Unique:** `(schedule_id, scheduled_for)` — one run per slot
**Pattern:** Idempotent get-or-create via `INSERT ON CONFLICT DO NOTHING` + `SELECT`.

> **Note:** `run_id` is NULL on creation (set after internal API returns). The `ScheduleRunRepository.createRun()` port needs update to accept `runId?: string | null` to match schema.

### `execution_requests`

| Column            | Type        | Constraints | Notes                                   |
| ----------------- | ----------- | ----------- | --------------------------------------- |
| `idempotency_key` | text        | PK          | `scheduleId:TemporalScheduledStartTime` |
| `request_hash`    | text        | NOT NULL    | SHA256 of normalized request payload    |
| `run_id`          | text        | NOT NULL    |                                         |
| `trace_id`        | text        | NULL        |                                         |
| `ok`              | boolean     | NOT NULL    | Execution outcome                       |
| `error_code`      | text        | NULL        | `AiExecutionErrorCode` if `ok=false`    |
| `created_at`      | timestamptz | NOT NULL    |                                         |

**Purpose:** Persists idempotency as the correctness layer for slot deduplication.
**Invariants:**

- If `idempotency_key` exists but `request_hash` differs, reject with 422 (payload mismatch)
- If `idempotency_key` exists and `request_hash` matches, return cached `{ok, runId, traceId, errorCode}` without re-executing
- Stores **both success and error outcomes** — retries return the cached outcome

> **TODO (P1):** Add `ok` and `error_code` columns to schema + migration. Update `storeRequest()` to persist outcome. Update `checkIdempotency()` to return cached outcome. Update route to return cached `ok`/`errorCode` correctly.

---

## File Pointers

### Current (Implemented)

| File                                                                   | Purpose                                                 |
| ---------------------------------------------------------------------- | ------------------------------------------------------- |
| `packages/scheduler-core/src/types.ts`                                 | `ExecutionGrant`, `ScheduleSpec`, `ScheduleRun` types   |
| `packages/db-schema/src/scheduling.ts`                                 | `execution_grants`, `schedules`, `schedule_runs` tables |
| `packages/scheduler-core/src/ports/execution-grant.port.ts`            | `ExecutionGrantPort` + error classes                    |
| `packages/scheduler-core/src/ports/execution-request.port.ts`          | `ExecutionRequestPort` for idempotency                  |
| `packages/scheduler-core/src/ports/schedule-manager.port.ts`           | `ScheduleManagerPort` interface                         |
| `packages/scheduler-core/src/ports/schedule-run.port.ts`               | `ScheduleRunRepository` interface                       |
| `packages/db-client/src/adapters/drizzle-grant.adapter.ts`             | `DrizzleExecutionGrantAdapter`                          |
| `packages/db-client/src/adapters/drizzle-execution-request.adapter.ts` | `DrizzleExecutionRequestAdapter`                        |
| `packages/db-client/src/adapters/drizzle-schedule.adapter.ts`          | `DrizzleScheduleManagerAdapter`                         |
| `packages/db-client/src/adapters/drizzle-run.adapter.ts`               | `DrizzleScheduleRunAdapter`                             |
| `src/contracts/schedules.*.v1.contract.ts`                             | Schedule CRUD contracts (4 files)                       |
| `src/app/api/v1/schedules/route.ts`                                    | POST (create), GET (list)                               |
| `src/app/api/v1/schedules/[scheduleId]/route.ts`                       | PATCH (update), DELETE                                  |
| `src/bootstrap/container.ts`                                           | Wire scheduling ports                                   |
| `packages/scheduler-core/src/payloads.ts`                              | Zod payload schemas                                     |

### Implemented (Temporal Migration)

| File                                                         | Purpose                                     |
| ------------------------------------------------------------ | ------------------------------------------- |
| `packages/scheduler-core/src/ports/schedule-control.port.ts` | `ScheduleControlPort` interface (no vendor) |
| `src/adapters/server/temporal/client.ts`                     | Temporal client factory                     |
| `src/adapters/server/temporal/schedule-control.adapter.ts`   | `TemporalScheduleControlAdapter`            |
| `services/scheduler-worker/`                                 | Temporal worker service                     |
| `services/scheduler-worker/src/main.ts`                      | Worker entry, connects to Temporal          |
| `services/scheduler-worker/src/workflows/`                   | GovernanceScheduledRunWorkflow              |
| `services/scheduler-worker/src/activities/`                  | validateGrant, createRun, executeGraph      |

### Implemented (P0)

| File                                                  | Purpose                     |
| ----------------------------------------------------- | --------------------------- |
| `src/app/api/internal/graphs/[graphId]/runs/route.ts` | Internal execution endpoint |
| `src/contracts/graphs.run.internal.v1.contract.ts`    | Internal execution contract |

### Deleted (Graphile Cleanup)

| File                                                           | Reason                               |
| -------------------------------------------------------------- | ------------------------------------ |
| `packages/scheduler-core/src/ports/job-queue.port.ts`          | Graphile-specific, replaced          |
| `packages/db-client/src/adapters/drizzle-job-queue.adapter.ts` | Graphile-specific, replaced          |
| `services/scheduler-worker/src/tasks/reconcile.ts`             | Temporal handles scheduling natively |

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

**1. Port & Types (`@cogni/scheduler-core`):** ✅

- [x] Add `ScheduleControlPort` interface (vendor-agnostic):
  - `createSchedule(params)` → `Promise<void>` (scheduleId caller-supplied)
  - `pauseSchedule(scheduleId)` / `resumeSchedule(scheduleId)`
  - `deleteSchedule(scheduleId)`
  - `describeSchedule(scheduleId)` → `ScheduleDescription | null`
- [x] Add `ScheduleDescription` type: `{ scheduleId, nextRunAtIso, lastRunAtIso, isPaused }`
- [x] Add error types: `ScheduleControlUnavailableError`, `ScheduleControlConflictError`, `ScheduleControlNotFoundError`
- [x] Input as `JsonValue` (not `unknown`), dates as ISO strings

**ScheduleControlPort Idempotency & Error Semantics:**

| Method             | Idempotent? | On Not Found                         | On Already Exists                    |
| ------------------ | ----------- | ------------------------------------ | ------------------------------------ |
| `createSchedule`   | No          | N/A                                  | Throw `ScheduleControlConflictError` |
| `pauseSchedule`    | Yes         | Throw `ScheduleControlNotFoundError` | No-op if already paused              |
| `resumeSchedule`   | Yes         | Throw `ScheduleControlNotFoundError` | No-op if already running             |
| `deleteSchedule`   | Yes         | No-op (success)                      | N/A                                  |
| `describeSchedule` | Yes         | Return `null`                        | N/A                                  |

> **Rationale for CRUD rollback safety:**
>
> - `createSchedule` throws on conflict → CRUD can detect partial failure and rollback DB
> - `deleteSchedule` is idempotent → safe to retry after transient failure
> - `pause/resume` idempotent → safe for retry; not-found means DB/Temporal drift (503, manual reconcile)

**2. Adapter (`src/adapters/server/temporal/`):** ✅

- [x] Implement `TemporalScheduleControlAdapter`
- [x] Implement `TemporalScheduleControlAdapter`
- [x] Hardcode policies: `overlap: SKIP`, `catchupWindow: 0` (not exposed in port)
- [x] Map Temporal errors → port error types (see table below)
- [x] Connection lifecycle via `@temporalio/client`

**Temporal Error Mapping:**

| Temporal Error                   | Port Error                        |
| -------------------------------- | --------------------------------- |
| `ScheduleAlreadyRunning`         | `ScheduleControlConflictError`    |
| `ScheduleNotFoundError`          | `ScheduleControlNotFoundError`    |
| Connection/timeout errors        | `ScheduleControlUnavailableError` |
| Schedule already paused (no-op)  | Success (idempotent)              |
| Schedule already deleted (no-op) | Success (idempotent)              |

**3. Docker Infrastructure:** ✅

- [x] Add `temporal` + `temporal-ui` + `temporal-postgres` to docker-compose (temporalio/docker-compose v1.29.1 pinned)
- [x] Add env vars: `TEMPORAL_ADDRESS`, `TEMPORAL_NAMESPACE=cogni-{APP_ENV}`, `TEMPORAL_TASK_QUEUE=scheduler-tasks`
- [x] Health checks for temporal service (gRPC health via `temporal operator cluster health`)
- [x] Add `TEMPORAL_DB_USER`, `TEMPORAL_DB_PASSWORD` to deploy.sh + GitHub workflows
- [x] Sync dev + prod compose files

**4. CRUD Integration (failure semantics defined):** ✅

- [x] Update `DrizzleScheduleManagerAdapter`: replace `JobQueuePort` → `ScheduleControlPort`
- [x] Wire `ScheduleControlPort` in container.ts (Temporal required, no fallback)
- [x] Add `TEMPORAL_*` env vars to `src/shared/env/server.ts` (optional in test mode)
- [x] `POST`: grant + DB insert → `createSchedule()`. **On failure: rollback grant+DB, 503**
- [x] `PATCH enabled`: DB update → `pauseSchedule()`/`resumeSchedule()`. **On failure: rollback, 503**
- [x] `DELETE`: `deleteSchedule()` → DB delete. **On failure: 503, do NOT delete DB**
- [ ] Stack test: create → describe → pause → resume → delete

**5. Worker Service:** ✅

- [x] Create `services/scheduler-worker/` (standalone Temporal worker, no `ScheduleControlPort` dep)
- [x] Implement `GovernanceScheduledRunWorkflow`
- [x] Implement Activities: `validateGrant`, `createScheduleRun`, `executeGraph`, `updateScheduleRun`
- [x] `executeGraphActivity` calls internal API with Bearer + Idempotency-Key
- [x] Activities derive `scheduledFor` from `TemporalScheduledStartTime`
- [x] Add Dockerfile and docker-compose entry

**6. Cleanup (after validation):** ✅

- [x] Repurpose `services/scheduler-worker/` from Graphile to Temporal
- [x] Delete `JobQueuePort` and `DrizzleJobQueueAdapter`
- [x] Remove Graphile Worker dependencies

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

## Known Issues (P0)

- [ ] **Latest trace not displayed in UI**: `schedule_runs.langfuse_trace_id` is populated after execution, but Schedules list API doesn't return run history—UI hardcodes "No runs yet" (`view.tsx:440`)

---

**Last Updated**: 2026-01-22
**Status**: P1 complete; scheduler runs in dev with stack test passing. Missing deployment infra (CI/CD, production compose).
