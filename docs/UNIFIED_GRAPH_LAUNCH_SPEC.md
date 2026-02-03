# Unified Graph Launch Design

> [!CRITICAL]
> All graph execution flows through `GraphRunWorkflow` in Temporal. Triggers only decide **when** to start (immediate vs scheduled), not **how** runs execute. No inline execution in HTTP handlers.

## Core Invariants

1. **ONE_RUN_EXECUTION_PATH**: Every graph execution is executed by `GraphRunWorkflow` in Temporal. API handlers start workflows, never call `GraphExecutorPort` directly.

2. **TRIGGERS_ONLY_START_RUNS**: Trigger handlers (API, webhook, schedule) create run records and start workflows. They do not execute graphs.

3. **IDEMPOTENT_RUN_START**: `workflowId = graph-run:{tenantId}:{idempotencyKey}`. Starting the same run twice results in at most one workflow execution.

4. **WORKFLOW_DETERMINISM**: Workflows orchestrate only. All I/O, tool calls, and LLM calls happen in Activities (per TEMPORAL_PATTERNS.md).

5. **RUN_CONTEXT_REQUIRED**: Every run has explicit context: `tenantId`, `executionGrantRef`, `runKind`, `initiator`, and `correlationIds`.

6. **AUDITABLE_TRIGGER_PROVENANCE**: Each run stores trigger provenance (`triggerSource`, `triggerRef`, `requestedBy`).

---

## Implementation Checklist

### P0: MVP Critical — Unified Workflow Path

- [ ] Add `trigger_*` columns to existing `schedule_runs` table (or create `graph_runs` if P1 persistence lands first)
- [ ] Create `GraphRunWorkflow` in `services/scheduler-worker/` that calls `executeGraphActivity`
- [ ] Refactor `POST /api/v1/ai/chat` to start `GraphRunWorkflow` instead of inline execution
- [ ] Add `Idempotency-Key` header support to chat endpoint
- [ ] Ensure `executeGraphActivity` reuses existing internal API path (`/api/internal/graphs/{graphId}/runs`)

#### Chores

- [ ] Observability instrumentation [observability.md](../../.agent/workflows/observability.md)
- [ ] Documentation updates [document.md](../../.agent/workflows/document.md)

### P1: Run Persistence + Trigger Metadata

- [ ] Add `graph_runs` table (per GRAPH_EXECUTION.md P1 checklist)
- [ ] Add trigger provenance fields: `run_kind`, `trigger_source`, `trigger_ref`, `requested_by`
- [ ] Migrate `schedule_runs` correlation to use `graph_runs.id`
- [ ] Add attempt semantics (unfreeze `attempt` from 0)

### P2: Webhook Triggers (Conditional)

- [ ] **Evaluate**: Is there a high-value webhook trigger (CI failure, deploy failure)?
- [ ] If yes: Implement single webhook handler using same workflow path
- [ ] **Do NOT build generic webhook/event system preemptively**

---

## File Pointers (P0 Scope)

| File                                                                 | Change                                                   |
| -------------------------------------------------------------------- | -------------------------------------------------------- |
| `services/scheduler-worker/src/workflows/graph-run.workflow.ts`      | New: `GraphRunWorkflow` (unified execution path)         |
| `services/scheduler-worker/src/activities/execute-graph.activity.ts` | Extend: Support both scheduled and immediate runs        |
| `src/app/api/v1/ai/chat/route.ts`                                    | Refactor: Start workflow instead of inline execution     |
| `src/features/ai/services/ai_runtime.ts`                             | Refactor: Return workflow handle, not inline stream      |
| `packages/db-schema/src/scheduling.ts`                               | Add: `run_kind`, `trigger_source` columns (or new table) |

---

## Schema

**Option A: Extend `schedule_runs`** (if `graph_runs` not yet created)

| Column           | Type | Notes                                                      |
| ---------------- | ---- | ---------------------------------------------------------- |
| `run_kind`       | text | `user_immediate` \| `system_scheduled` \| `system_webhook` |
| `trigger_source` | text | `api` \| `temporal_schedule` \| `webhook:{type}`           |
| `trigger_ref`    | text | Upstream delivery ID / schedule ID                         |
| `requested_by`   | text | User ID or `cogni_system`                                  |

**Option B: New `graph_runs` table** (preferred if P1 persistence lands)

Fold trigger fields into the run persistence table per GRAPH_EXECUTION.md P1.

**Forbidden:**

- `run_requests` as separate table (adds indirection without value if `graph_runs` exists)
- Duplicating execution logic between scheduled and immediate paths

---

## Design Decisions

### 1. Execution Path Unification

| Trigger Type        | Current Path                                               | Unified Path                                           |
| ------------------- | ---------------------------------------------------------- | ------------------------------------------------------ |
| **API (immediate)** | HTTP → `AiRuntime` → `GraphExecutorPort` (inline)          | HTTP → `GraphRunWorkflow` → `executeGraphActivity`     |
| **Scheduled**       | Temporal → `GovernanceScheduledRunWorkflow` → internal API | Temporal → `GraphRunWorkflow` → `executeGraphActivity` |
| **Webhook**         | Not implemented                                            | HTTP → `GraphRunWorkflow` → `executeGraphActivity`     |

**Rule:** All paths converge at `GraphRunWorkflow`. HTTP handlers become workflow starters, not executors.

---

### 2. Workflow Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│ TRIGGER LAYER (decides when)                                        │
│ ─────────────────────────────                                       │
│ • POST /api/v1/ai/chat       → workflowClient.start(GraphRunWorkflow)
│ • Temporal Schedule fires    → starts GraphRunWorkflow              │
│ • Webhook handler (P2)       → workflowClient.start(GraphRunWorkflow)
│                                                                     │
│ All triggers:                                                       │
│   1. Validate auth/grant                                            │
│   2. Generate idempotencyKey (or use client-supplied)               │
│   3. Start workflow with workflowId = graph-run:{tenant}:{key}      │
│   4. Return { runId, workflowId } immediately                       │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ GraphRunWorkflow (Temporal)                                         │
│ ───────────────────────────                                         │
│ Input: { runId, graphId, input, grantRef, triggerContext }          │
│                                                                     │
│ 1. Activity: validateGrantActivity(grantRef)                        │
│ 2. Activity: createRunLedgerActivity(runId, triggerContext)         │
│ 3. Activity: executeGraphActivity(runId, graphId, input)            │
│    └─► POST /api/internal/graphs/{graphId}/runs (existing)          │
│ 4. Activity: finalizeRunActivity(runId, result)                     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ EXECUTION LAYER (how — unchanged)                                   │
│ ─────────────────────────────────                                   │
│ • Internal API validates grant (defense-in-depth)                   │
│ • Calls GraphExecutorPort.runGraph()                                │
│ • Billing via commitUsageFact() (existing)                          │
│ • Returns { runId, traceId, ok, errorCode? }                        │
└─────────────────────────────────────────────────────────────────────┘
```

**Why this approach?** Reuses existing internal API and billing infrastructure. No changes to `GraphExecutorPort` or billing paths.

---

### 3. Idempotency Key Strategy

| Trigger                    | Idempotency Key                                        |
| -------------------------- | ------------------------------------------------------ |
| **API (client-supplied)**  | `Idempotency-Key` header value                         |
| **API (server-generated)** | `api:{requestId}` (one-time execution)                 |
| **Scheduled**              | `schedule:{scheduleId}:{TemporalScheduledStartTime}`   |
| **Webhook**                | `webhook:{deliveryId}` or `webhook:{source}:{eventId}` |

**workflowId derivation:** `graph-run:{tenantId}:{idempotencyKey}`

**Never** use `Date.now()` or random values for scheduled/webhook keys.

---

### 4. Streaming Strategy

**Challenge:** Current API returns SSE stream directly. Temporal workflows are async.

**P0 Solution (Hybrid):**

- Workflow starts, creates run record, returns `runId` immediately
- Client polls `/api/v1/ai/runs/{runId}/events` for SSE stream
- Activity streams events to a durable buffer (Redis pub/sub or Temporal query)

**Alternative (simpler, less real-time):**

- Workflow runs to completion
- Client polls for final result
- UI shows "processing" spinner

**Decision:** Start with polling + final result. Add streaming in P1 if latency matters.

---

## Acceptance Tests (Non-Negotiable)

1. **API run is async and durable**
   - Request returns quickly with `{ runId, workflowId }`
   - Run continues after server restart

2. **Idempotency**
   - Same `Idempotency-Key` called twice → one workflow execution
   - Returns cached `runId` on duplicate

3. **Schedule parity**
   - Scheduled run uses same workflow
   - Produces same artifacts and billing records

4. **No inline execution**
   - Lint/grep test: API handler must not import `GraphExecutorPort`
   - Only workflow activities call execution layer

---

## Risks and Mitigations

| Risk                                                            | Mitigation                                        |
| --------------------------------------------------------------- | ------------------------------------------------- |
| Accidental bypass (someone calls executor directly "for speed") | Grep test + code review + dep-cruiser rule        |
| Streaming latency regression                                    | P0 accepts polling; streaming in P1               |
| Bad idempotency key derivation                                  | Strict key format validation; reject invalid keys |
| Workflow non-determinism                                        | Existing TEMPORAL_PATTERNS.md invariants apply    |

---

## Explicit Non-Scope

- **Event bus / rule engine** — Not building generic event routing
- **Auto-execution of actions** — Human review stays for governance
- **WorkItemPort** — MCP-only for Plane integration
- **Incident router integration** — Governance uses same workflow but separate trigger logic

---

## Related Documents

- [GRAPH_EXECUTION.md](../GRAPH_EXECUTION.md) — Execution invariants, billing, P1 run persistence
- [SCHEDULER_SPEC.md](../SCHEDULER_SPEC.md) — Temporal architecture, internal API
- [TEMPORAL_PATTERNS.md](../TEMPORAL_PATTERNS.md) — Workflow determinism, activity idempotency

---

**Last Updated**: 2026-02-03
**Status**: Draft
