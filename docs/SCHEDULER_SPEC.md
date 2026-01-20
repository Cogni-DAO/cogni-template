# Scheduled Graph Execution Design

> [!CRITICAL]
> Scheduled runs execute via **internal HTTP API** using durable **ExecutionGrants** (not user sessions). Worker calls `POST /api/internal/graphs/{graphId}/runs` with shared-secret auth—never imports graph execution code. Uses Graphile Worker's `add_job()` with `job_key` for job idempotency—NOT crontab polling.

---

## Core Invariants

1. **SCHEDULES_NEVER_BYPASS_EXECUTOR**: All scheduled graph execution flows through `GraphExecutorPort.runGraph()`. Scheduling layer owns timing only—never direct LLM/provider calls.

2. **GRANT_NOT_SESSION**: Scheduled runs authenticate via durable `ExecutionGrant` (scoped, revocable, time-limited), never user sessions. Workers never hold `NextAuth` session state.

3. **BILLING_VIA_GRANT**: Every `ExecutionGrant` has a `billingAccountId`. Execution service derives `virtualKeyId` from billing account's default key. All existing billing/idempotency invariants (GRAPH_EXECUTION.md) apply unchanged.

4. **JOB_KEY_PER_SLOT**: Each scheduled run uses `job_key = scheduleId:scheduledFor` (ISO timestamp). Prevents duplicate execution if same slot enqueued twice.

5. **PRODUCER_ENQUEUES_NEXT**: After each execution (success or failure), worker enqueues next run via `add_job()` with computed `run_at`. No polling. No static crontab.

6. **QUEUE_SERIALIZES_SCHEDULE**: Each schedule uses `queue_name = scheduleId`. Graphile Worker processes one job per queue at a time—no app-level overlap checks needed.

7. **SKIP_MISSED_RUNS**: P0 does not backfill missed runs. If chain breaks (worker down), only next future slot is scheduled on recovery.

8. **RECONCILER_GUARANTEES_CHAIN**: Reconciler runs on worker startup + self-reschedules every 5 min. For stale schedules (`next_run_at < now()`), computes next future slot and enqueues.

9. **GRANT_VALIDATED_TWICE**: Worker validates grant before calling API (fail-fast). Execution service re-validates grant validity + scope (defense-in-depth). Scope format: `graph:execute:{graphId}` or `graph:execute:*`.

10. **RUN_LEDGER_FOR_GOVERNANCE**: Every execution creates `schedule_runs` record with status progression (pending→running→success/error).

11. **EXECUTION_VIA_SERVICE_API**: Worker triggers runs via HTTP to `POST /api/internal/graphs/{graphId}/runs`. Worker NEVER imports graph execution code.

12. **INTERNAL_API_SHARED_SECRET**: Internal calls require Bearer token (shared secret). Follows `METRICS_TOKEN` pattern. Caller service name logged. P1: JWT with aud/exp.

13. **EXECUTION_IDEMPOTENCY_PERSISTED**: Graphile `job_key` only dedupes _queued_ jobs—completed jobs deleted. `execution_requests` table persists idempotency key → `{runId, traceId}`.

14. **RUN_OWNERSHIP_BOUNDARY**: Worker owns `schedule_runs`. Execution service owns graph runs + billing (`charge_receipts`). Correlation via `runId` and `langfuseTraceId`.

---

## Architecture

### Progression

| Phase           | Worker Entry                            | Graph Execution           | Status      |
| --------------- | --------------------------------------- | ------------------------- | ----------- |
| **1 (Current)** | `src/scripts/run-scheduler-worker.ts`   | v0 stub (no execution)    | ✅ Merged   |
| **P0 Blocker**  | Same                                    | HTTP call to internal API | 🔲 Next     |
| **2 (Future)**  | `services/scheduler-worker/src/main.ts` | Same HTTP call            | 🔲 After P0 |

### Phase 2 Package Extraction

| Extract From                         | Extract To              |
| ------------------------------------ | ----------------------- |
| `src/types/scheduling.ts`            | `@cogni/scheduler-core` |
| `src/ports/scheduling/*`             | `@cogni/scheduler-core` |
| `src/adapters/server/scheduling/*`   | `@cogni/db-client`      |
| `src/shared/db/schema.scheduling.ts` | `@cogni/db-client`      |

**`@cogni/db-client` Invariants:**

- MUST: Export `createDbClient(databaseUrl: string)` factory
- FORBIDDEN: `@/shared/env` imports, Next.js imports, app bootstrap

### Execution Flow

```
USER → POST /api/v1/schedules → Create grant + schedule + enqueue first job
                                         │
                                         ▼
GRAPHILE WORKER (at run_at) → execute_scheduled_run task
  1. Load schedule, validate grant
  2. Create schedule_runs (pending)
  3. POST /api/internal/graphs/{graphId}/runs
     ├─ Bearer: $INTERNAL_API_TOKEN
     ├─ Idempotency-Key: {scheduleId}:{scheduledFor}
     └─ Body: { executionGrantId, input }
  4. Update schedule_runs (success/error)
  5. Enqueue next job
                                         │
                                         ▼
EXECUTION SERVICE → Verify token → Check idempotency → Run graph → Return {runId, traceId}
```

### Idempotency Layers

| Layer         | Key                       | Storage                  | Prevents                |
| ------------- | ------------------------- | ------------------------ | ----------------------- |
| Job enqueue   | `scheduleId:scheduledFor` | Graphile (deleted after) | Duplicate jobs          |
| Execution API | `Idempotency-Key` header  | `execution_requests`     | Duplicate runs on retry |
| Billing       | `runId/attempt/unit`      | `charge_receipts`        | Duplicate charges       |

### Graphile Worker Pattern

Use `add_job()` with queue serialization—NOT crontab (which is static/deploy-time only):

```sql
SELECT graphile_worker.add_job(
  'execute_scheduled_run',
  json_build_object('scheduleId', schedule_id, 'scheduledFor', next_run_at),
  queue_name := schedule_id::text,           -- serializes per schedule
  run_at := next_run_at,
  job_key := schedule_id || ':' || next_run_at::text,  -- slot dedupe
  job_key_mode := 'replace'
);
```

**Why `job_key_mode=replace`:**

- `job_key` dedupes _queued_ jobs only—prevents duplicate enqueues for same slot
- After job completes, Graphile deletes it—`job_key` no longer exists
- `execution_requests` table is the correctness layer for execution idempotency
- Do NOT rely on Graphile job state for execution guarantees

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

| Column               | Type        | Constraints                   | Notes                  |
| -------------------- | ----------- | ----------------------------- | ---------------------- |
| `id`                 | uuid        | PK                            |                        |
| `owner_user_id`      | text        | NOT NULL, FK users            |                        |
| `execution_grant_id` | uuid        | NOT NULL, FK execution_grants |                        |
| `graph_id`           | text        | NOT NULL                      | e.g., `langgraph:poet` |
| `input`              | jsonb       | NOT NULL                      | Graph input payload    |
| `cron`               | text        | NOT NULL                      | 5-field cron           |
| `timezone`           | text        | NOT NULL                      | IANA timezone          |
| `enabled`            | boolean     | NOT NULL, default true        |                        |
| `next_run_at`        | timestamptz | NULL                          |                        |
| `last_run_at`        | timestamptz | NULL                          |                        |
| `created_at`         | timestamptz | NOT NULL                      |                        |
| `updated_at`         | timestamptz | NOT NULL                      |                        |

**Indexes:** `idx_schedules_owner`, `idx_schedules_next_run`, `idx_schedules_grant`

### `schedule_runs`

| Column              | Type        | Constraints                 | Notes                                 |
| ------------------- | ----------- | --------------------------- | ------------------------------------- |
| `id`                | uuid        | PK                          |                                       |
| `schedule_id`       | uuid        | NOT NULL, FK schedules      |                                       |
| `run_id`            | text        | **NULL**                    | Set after execution API responds      |
| `scheduled_for`     | timestamptz | NOT NULL                    | Cron slot                             |
| `started_at`        | timestamptz | NULL                        |                                       |
| `completed_at`      | timestamptz | NULL                        |                                       |
| `status`            | text        | NOT NULL, default 'pending' | pending/running/success/error/skipped |
| `langfuse_trace_id` | text        | NULL                        |                                       |
| `error_message`     | text        | NULL                        |                                       |

**Indexes:** `idx_runs_schedule`, `idx_runs_scheduled_for`, `idx_runs_run_id`
**Unique:** `(schedule_id, scheduled_for)` — one run per slot
**Pattern:** Idempotent get-or-create via `INSERT ON CONFLICT DO NOTHING` + `SELECT` to survive retries/concurrency.
**Note:** `run_id` nullable because row created (pending) BEFORE calling execution API.

### `execution_requests` (P0 Blocker)

| Column            | Type        | Constraints | Notes                                |
| ----------------- | ----------- | ----------- | ------------------------------------ |
| `idempotency_key` | text        | PK          | `scheduleId:scheduledFor`            |
| `request_hash`    | text        | NOT NULL    | SHA256 of normalized request payload |
| `run_id`          | text        | NOT NULL    |                                      |
| `trace_id`        | text        | NULL        |                                      |
| `created_at`      | timestamptz | NOT NULL    |                                      |

**Purpose:** Persists idempotency beyond Graphile job lifecycle (completed jobs are deleted).
**Invariant:** If `idempotency_key` exists but `request_hash` differs, reject with 422 (payload mismatch).

---

## Test Infrastructure

| Test Type                                             | Status     | Notes                          |
| ----------------------------------------------------- | ---------- | ------------------------------ |
| Unit tests (`packages/scheduler-worker/tests/`)       | ✅ Pass    | Mocked deps                    |
| Contract tests (`tests/contract/schedules.*.test.ts`) | ✅ Pass    | Schema validation              |
| Stack tests (`tests/stack/scheduling/`)               | ⏭️ Skipped | Needs `graphile_worker` schema |

**Schema Bootstrap:** Run before tests:

```bash
pnpm exec graphile-worker --schema-only --connection "$DATABASE_URL"
```

---

## File Pointers

### Current (Implemented)

| File                                                          | Purpose                                                 |
| ------------------------------------------------------------- | ------------------------------------------------------- |
| `src/types/scheduling.ts`                                     | `ExecutionGrant`, `ScheduleSpec`, `ScheduleRun` types   |
| `src/shared/db/schema.scheduling.ts`                          | `execution_grants`, `schedules`, `schedule_runs` tables |
| `src/ports/scheduling/job-queue.port.ts`                      | `JobQueuePort` interface                                |
| `src/ports/scheduling/execution-grant.port.ts`                | `ExecutionGrantPort` + error classes                    |
| `src/ports/scheduling/schedule-manager.port.ts`               | `ScheduleManagerPort` interface                         |
| `src/ports/scheduling/schedule-run.port.ts`                   | `ScheduleRunRepository` interface                       |
| `src/adapters/server/scheduling/drizzle-job-queue.adapter.ts` | `DrizzleJobQueueAdapter`                                |
| `src/adapters/server/scheduling/drizzle-grant.adapter.ts`     | `DrizzleExecutionGrantAdapter`                          |
| `src/adapters/server/scheduling/drizzle-schedule.adapter.ts`  | `DrizzleScheduleManagerAdapter`                         |
| `src/adapters/server/scheduling/drizzle-run.adapter.ts`       | `DrizzleScheduleRunAdapter`                             |
| `src/contracts/schedules.*.v1.contract.ts`                    | Schedule CRUD contracts (4 files)                       |
| `src/app/api/v1/schedules/route.ts`                           | POST (create), GET (list)                               |
| `src/app/api/v1/schedules/[scheduleId]/route.ts`              | PATCH (update), DELETE                                  |
| `src/bootstrap/container.ts`                                  | Wire scheduling ports (~line 303)                       |
| `src/scripts/run-scheduler-worker.ts`                         | Worker entry point                                      |
| `packages/scheduler-worker/src/tasks/execute-run.ts`          | `createExecuteScheduledRunTask` factory                 |
| `packages/scheduler-worker/src/tasks/reconcile.ts`            | `createReconcileSchedulesTask` factory                  |
| `packages/scheduler-worker/src/schemas/payloads.ts`           | Zod payload schemas                                     |
| `packages/scheduler-worker/src/utils/cron.ts`                 | `computeNextCronTime` utility                           |

### Planned (P0 Blocker)

| File                                                  | Purpose                                  |
| ----------------------------------------------------- | ---------------------------------------- |
| `src/shared/db/schema.execution.ts`                   | `execution_requests` table (idempotency) |
| `src/app/api/internal/graphs/[graphId]/runs/route.ts` | Internal execution endpoint              |
| `src/contracts/graphs.run.internal.v1.contract.ts`    | Internal execution contract              |

### Planned (Phase 2)

| File                                    | Purpose                               |
| --------------------------------------- | ------------------------------------- |
| `packages/scheduler-core/`              | Types + port interfaces (extracted)   |
| `packages/db-client/`                   | Drizzle client + adapters (extracted) |
| `services/scheduler-worker/src/main.ts` | Standalone worker entry point         |
| `services/scheduler-worker/Dockerfile`  | Multi-stage build                     |

---

## Implementation Checklist

### P0: Completed

- [x] Types: `ExecutionGrant`, `ScheduleSpec`, `ScheduleRun` in `src/types/scheduling.ts`
- [x] Schema: `execution_grants`, `schedules`, `schedule_runs` tables
- [x] Ports: `JobQueuePort`, `ExecutionGrantPort`, `ScheduleManagerPort`, `ScheduleRunRepository`
- [x] Adapters: All Drizzle adapters implemented
- [x] Routes: `/api/v1/schedules` CRUD endpoints
- [x] Worker package: Task factories with Zod validation
- [x] `pnpm scheduler:dev` script

### P0: Graph Execution API (Blocker)

**Internal Endpoint:**

- [ ] `POST /api/internal/graphs/{graphId}/runs` — service-auth endpoint
- [ ] Auth: Bearer `INTERNAL_API_TOKEN`, constant-time compare (like `METRICS_TOKEN`)
- [ ] Rate limit: Basic per-token limit (e.g., 100 req/sec) to prevent runaway loops
- [ ] `X-Service-Name` header: Log for audit, but treat as advisory (not trusted until JWT)
- [ ] Re-validate grant (validity + scope) — defense-in-depth, don't trust worker alone
- [ ] Request: `{ executionGrantId, input }` → Response: `{ runId, traceId, ok, errorCode? }`
- [ ] Create `execution_requests` table with `request_hash`
- [ ] On conflict: if `request_hash` matches return cached; if differs return 422

**Worker Integration:**

- [ ] Update `execute-run.ts` to call internal API via HTTP
- [ ] Add `INTERNAL_API_URL` and `INTERNAL_API_TOKEN` env vars

**Schema Bootstrap:**

- [ ] Add `db:setup:worker` script: `graphile-worker --schema-only`
- [ ] Integrate into `pnpm dev:stack:test:setup`
- [ ] Un-skip `tests/stack/scheduling/`

**Cleanup:**

- [ ] Remove `attempt_count` from `schedule_runs` (Graphile handles retries)
- [ ] Ensure `createSchedule` atomicity (grant+schedule+enqueue)

### Phase 2: Standalone Service

- [ ] Create `packages/scheduler-core/` (types + ports)
- [ ] Create `packages/db-client/` (Drizzle client + adapters)
- [ ] Create `services/scheduler-worker/` with Dockerfile
- [ ] Add to `docker-compose.dev.yml`
- [ ] Delete `src/scripts/run-scheduler-worker.ts`
- [ ] Remove `scripts` layer from `.dependency-cruiser.cjs`

### P1: Enhanced Auth + Runs API

- [ ] `GET /api/v1/schedules/:id/runs` — read-only runs endpoint
- [ ] `POST /api/v1/graphs/{graphId}/runs` — user-facing facade
- [ ] JWT auth with `aud`/`exp` claims for internal API
- [ ] Add `error_code` enum to `schedule_runs`
- [ ] `concurrencyPolicy` column (Allow, Forbid, Replace)

### P2: Advanced (Do NOT Build Preemptively)

- [ ] Backfill logic (requires user consent for billing implications)

---

## Anti-Patterns

| Anti-Pattern                           | Why Forbidden                           |
| -------------------------------------- | --------------------------------------- |
| Graphile crontab for user schedules    | Crontab is static/deploy-time           |
| Poll `schedules` table                 | Use `add_job()` with `run_at`           |
| NextAuth sessions in workers           | Sessions expire; workers are long-lived |
| Network-only auth for internal API     | Not auditable; can't rotate credentials |
| Execution without idempotency key      | Retries cause duplicate runs            |
| Worker imports graph code              | Couples to Next.js; prevents scaling    |
| Execution service writes schedule_runs | Ownership boundary violation            |

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
3. Persist idempotency — `execution_requests` survives Graphile job deletion

---

## Related Documents

- [GRAPH_EXECUTION.md](GRAPH_EXECUTION.md) — Execution invariants, billing
- [ACCOUNTS_DESIGN.md](ACCOUNTS_DESIGN.md) — Billing account lifecycle
- [ARCHITECTURE.md](ARCHITECTURE.md) — Hexagonal pattern

## Sources

- [Graphile Worker add_job](https://worker.graphile.org/docs/sql-add-job)
- [Graphile Worker job_key](https://worker.graphile.org/docs/job-key)
- [Stripe Idempotency](https://stripe.com/docs/api/idempotent_requests)

---

**Last Updated**: 2026-01-19
**Status**: P0 in progress — internal execution API is next blocker
