---
work_item_id: ini.unified-graph-launch
work_item_type: initiative
title: Unified Graph Launch — Temporal Execution Path
state: Paused
priority: 2
estimate: 5
summary: Unify all graph execution (API, scheduled, webhook) through GraphRunWorkflow in Temporal
outcome: All graph runs flow through GraphRunWorkflow; no inline execution in HTTP handlers; idempotent run starts
assignees:
  - cogni-dev
created: 2026-02-07
updated: 2026-02-07
labels:
  - ai-graphs
  - scheduler
---

# Unified Graph Launch — Temporal Execution Path

> Source: docs/UNIFIED_GRAPH_LAUNCH_SPEC.md

## Goal

Unify all graph execution triggers (API immediate, Temporal scheduled, webhook) through a single `GraphRunWorkflow` in Temporal. HTTP handlers become workflow starters, never executors. Idempotent run starts via deterministic workflow IDs.

## Roadmap

### Crawl (P0): MVP Critical — Unified Workflow Path

**Goal:** All graph runs go through `GraphRunWorkflow`. API handler stops calling `GraphExecutorPort` directly.

| Deliverable                                                                                             | Status      | Est | Work Item |
| ------------------------------------------------------------------------------------------------------- | ----------- | --- | --------- |
| Add `trigger_*` columns to existing `schedule_runs` table (or create `graph_runs` if P1 lands)          | Not Started | 1   | —         |
| Create `GraphRunWorkflow` in `services/scheduler-worker/`                                               | Not Started | 2   | —         |
| Refactor `POST /api/v1/ai/chat` to start `GraphRunWorkflow` instead of inline execution                 | Not Started | 2   | —         |
| Add `Idempotency-Key` header support to chat endpoint                                                   | Not Started | 1   | —         |
| Ensure `executeGraphActivity` reuses existing internal API path (`/api/internal/graphs/{graphId}/runs`) | Not Started | 1   | —         |
| Observability instrumentation                                                                           | Not Started | 1   | —         |
| Documentation updates                                                                                   | Not Started | 1   | —         |

#### File Pointers (P0 Scope)

| File                                                                 | Change                                                   |
| -------------------------------------------------------------------- | -------------------------------------------------------- |
| `services/scheduler-worker/src/workflows/graph-run.workflow.ts`      | New: `GraphRunWorkflow` (unified execution path)         |
| `services/scheduler-worker/src/activities/execute-graph.activity.ts` | Extend: Support both scheduled and immediate runs        |
| `src/app/api/v1/ai/chat/route.ts`                                    | Refactor: Start workflow instead of inline execution     |
| `src/features/ai/services/ai_runtime.ts`                             | Refactor: Return workflow handle, not inline stream      |
| `packages/db-schema/src/scheduling.ts`                               | Add: `run_kind`, `trigger_source` columns (or new table) |

### Walk (P1): Run Persistence + Trigger Metadata

**Goal:** Durable run records with trigger provenance.

| Deliverable                                                                                | Status      | Est | Work Item |
| ------------------------------------------------------------------------------------------ | ----------- | --- | --------- |
| Add `graph_runs` table (per GRAPH_EXECUTION.md P1 checklist)                               | Not Started | 2   | —         |
| Add trigger provenance fields: `run_kind`, `trigger_source`, `trigger_ref`, `requested_by` | Not Started | 1   | —         |
| Migrate `schedule_runs` correlation to use `graph_runs.id`                                 | Not Started | 1   | —         |
| Add attempt semantics (unfreeze `attempt` from 0)                                          | Not Started | 1   | —         |

### Run (P2): Webhook Triggers (Conditional)

**Goal:** Webhook-triggered graph runs via same unified path.

| Deliverable                                                                   | Status      | Est | Work Item |
| ----------------------------------------------------------------------------- | ----------- | --- | --------- |
| Evaluate: Is there a high-value webhook trigger (CI failure, deploy failure)? | Not Started | 1   | —         |
| If yes: Implement single webhook handler using same workflow path             | Not Started | 2   | —         |
| Do NOT build generic webhook/event system preemptively                        | Not Started | 0   | —         |

## Constraints

- **ONE_RUN_EXECUTION_PATH**: All graph execution via `GraphRunWorkflow` — no inline execution in HTTP handlers
- **IDEMPOTENT_RUN_START**: `workflowId = graph-run:{tenantId}:{idempotencyKey}` — duplicate starts are no-ops
- P0 accepts polling for results; streaming deferred to P1
- No generic event bus or rule engine — scope is graph execution only

## Dependencies

- [ ] Temporal infrastructure operational (existing)
- [ ] GRAPH_EXECUTION.md P1 run persistence (for P1 of this initiative)

## As-Built Specs

- [unified-graph-launch.md](../../docs/spec/unified-graph-launch.md) — Core invariants, schema, design decisions
- [scheduler.md](../../docs/spec/scheduler.md) — Temporal architecture, internal API
- [temporal-patterns.md](../../docs/spec/temporal-patterns.md) — Workflow determinism, activity idempotency

## Design Notes

_(none yet)_
