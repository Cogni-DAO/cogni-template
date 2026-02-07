---
work_item_id: ini.hil-graphs
work_item_type: initiative
title: Human-in-the-Loop Graph Execution
state: Active
priority: 2
estimate: 5
summary: Implement pause/resume HIL contract — interrupt envelope, execution state routing table, first HIL graph, multi-provider resume
outcome: Production HIL pipeline with provider-agnostic pause/resume, atomic lock enforcement, idempotent resume, and content-review graph
assignees: derekg1729
created: 2026-02-07
updated: 2026-02-07
labels: [ai-graphs, langgraph]
---

# Human-in-the-Loop Graph Execution

> Source: docs/HUMAN_IN_THE_LOOP.md

## Goal

Implement the provider-agnostic pause/resume contract for human-in-the-loop (HIL) graph execution. Graph yields control via interrupt; human decision arrives via separate resume request; graph resumes from persisted state.

## Roadmap

### Crawl (P0) — First HIL Graph

**Goal:** Minimal end-to-end HIL flow with LangGraph provider.

| Deliverable                                                                                 | Status      | Est | Work Item |
| ------------------------------------------------------------------------------------------- | ----------- | --- | --------- |
| Add `InterruptEnvelope` to `@cogni/ai-core`: `{ kind: string; data: unknown }`              | Not Started | 1   | —         |
| Refactor `GraphFinal` → discriminated union `GraphRunOutcome` (completed/needs_input/error) | Not Started | 2   | —         |
| Update `GraphRunRequest` with optional `resumeValue?: unknown` and `resumeId?: string`      | Not Started | 1   | —         |
| Create `execution_state_handles` table (see spec Schema section)                            | Not Started | 2   | —         |
| Create `ExecutionStatePort` interface with `upsert`, `getByStateKey`, `markCompleted`       | Not Started | 1   | —         |
| Create `DrizzleExecutionStateAdapter` with tenant-scoped queries                            | Not Started | 2   | —         |
| Create first HIL graph in `packages/langgraph-graphs/src/graphs/content-review/`            | Not Started | 3   | —         |
| Define graph-specific interrupt payload type in graph package (NOT ai-core)                 | Not Started | 1   | —         |
| Configure PostgresSaver checkpointer for InProc provider                                    | Not Started | 1   | —         |
| Update `LangGraphInProcProvider` to handle interrupt + resume flow                          | Not Started | 3   | —         |
| Provider stores `provider_ref` (threadId) via `ExecutionStatePort` on interrupt             | Not Started | 1   | —         |
| LangGraph Server adapter: pass `multitask_strategy: 'reject'` to align with lock policy     | Not Started | 1   | —         |
| Extend `/api/v1/ai/chat` route to handle resume (detect via `stateKey` + `resumeValue`)     | Not Started | 2   | —         |
| Validate `resumeValue` is JSON, max 64KB (RESUME_VALUE_JSON_ONLY)                           | Not Started | 1   | —         |
| Validate `interrupt.data` is JSON, max 256KB (ENVELOPE_DATA_JSON_ONLY)                      | Not Started | 1   | —         |
| Implement atomic lock claim (UPDATE...WHERE lock expired RETURNING ref)                     | Not Started | 2   | —         |
| Implement lock release in `finally` block (completion/error/interrupt)                      | Not Started | 1   | —         |
| Implement idempotency: if `resumeId == last_resume_id` → return `cached_outcome`            | Not Started | 1   | —         |
| Return 409 if lock claim fails (concurrent resume in-flight)                                | Not Started | 1   | —         |
| Return only `stateKey` in `needs_input` response (no provider internals)                    | Not Started | 1   | —         |
| Integration test: start → interrupt → resume(revise) → interrupt → resume(approve) → final  | Not Started | 2   | —         |
| Test: duplicate resumeId returns cached outcome (idempotency)                               | Not Started | 1   | —         |
| Test: concurrent resume with different resumeId returns 409 (atomic lock)                   | Not Started | 1   | —         |
| Test: stale lock (>30s) allows new resume to claim (lock expiry)                            | Not Started | 1   | —         |
| Observability instrumentation                                                               | Not Started | 1   | —         |
| Documentation updates                                                                       | Not Started | 1   | —         |

#### File Pointers (P0 planned changes)

| File                                                             | Change                                                          |
| ---------------------------------------------------------------- | --------------------------------------------------------------- |
| `packages/ai-core/src/context/interrupt.ts`                      | New: `InterruptEnvelope` (minimal: `{ kind, data }`)            |
| `packages/ai-core/src/index.ts`                                  | Export `InterruptEnvelope`                                      |
| `src/ports/graph-executor.port.ts`                               | Refactor `GraphFinal` → `GraphRunOutcome` discriminated union   |
| `src/ports/execution-state.port.ts`                              | New: `ExecutionStatePort` interface                             |
| `src/shared/db/schema.execution-state.ts`                        | New: `execution_state_handles` table                            |
| `src/adapters/server/ai/execution-state.adapter.ts`              | New: `DrizzleExecutionStateAdapter`                             |
| `packages/langgraph-graphs/src/graphs/content-review/graph.ts`   | New: first HIL graph with `interrupt()`                         |
| `packages/langgraph-graphs/src/graphs/content-review/types.ts`   | New: graph-specific interrupt payload (NOT in ai-core)          |
| `packages/langgraph-graphs/src/graphs/content-review/prompts.ts` | System prompts for content generation                           |
| `packages/langgraph-graphs/src/catalog.ts`                       | Add content-review entry                                        |
| `src/adapters/server/ai/langgraph/inproc.provider.ts`            | Add checkpointer; handle interrupt/resume; store via port       |
| `src/adapters/server/ai/langgraph/checkpointer.ts`               | New: PostgresSaver factory                                      |
| `src/app/api/v1/ai/chat/route.ts`                                | Handle resume; validate JSON+size; idempotency; return stateKey |
| `tests/stack/ai/hil-flow.stack.test.ts`                          | New: full HIL cycle + idempotency + concurrency tests           |

### Walk (P1) — HIL Polish

**Goal:** Timeout handling, multi-step revision loops, UI components.

| Deliverable                                                               | Status      | Est | Work Item            |
| ------------------------------------------------------------------------- | ----------- | --- | -------------------- |
| Add timeout handling for stale interrupted runs (expire via `expires_at`) | Not Started | 2   | (create at P1 start) |
| Support multi-step revise loops (N iterations before auto-reject)         | Not Started | 2   | (create at P1 start) |
| Add UI components per interrupt `kind` (graph packages may provide)       | Not Started | 2   | (create at P1 start) |

### Run (P2+) — Multi-Provider Resume

**Goal:** Validate provider-agnostic contract across 2+ providers.

| Deliverable                                                   | Status      | Est | Work Item            |
| ------------------------------------------------------------- | ----------- | --- | -------------------- |
| Claude Agent SDK resume via `options.resume=sessionId`        | Not Started | 3   | (create at P2 start) |
| Validate provider-agnostic contract works across 2+ providers | Not Started | 2   | (create at P2 start) |
| **Do NOT build preemptively**                                 | —           | —   | —                    |

## Constraints

- HIL = pause/resume contract — graph yields control; resume uses same `stateKey`
- HTTP request starts graph → returns `needs_input` + `stateKey` + interrupt envelope; resume via separate request
- `stateKey` is the ONLY resumable identifier exposed to UI/API — internal provider refs NEVER leak
- No side effects before human approval (publishing, posting, sending gated)
- All providers resume via `GraphExecutorPort.runGraph({ stateKey, resumeDecision, ... })`
- `interrupt.data` is JSON only, max 256KB; `resumeValue` is JSON only, max 64KB
- At most one resume in-flight per `stateKey` (atomic row lock, 30s expiry)
- `provider_ref` NEVER returned in API responses, logged, or exposed to UI
- ai-core defines only the envelope — graph packages own typed payloads
- `GraphRunOutcome` is a discriminated union — no optional fields creating inconsistent states

## Dependencies

- [ ] PostgresSaver checkpointer (`@langchain/langgraph-checkpoint-postgres`)
- [ ] LangGraph interrupt/Command API stability
- [ ] Claude Agent SDK session resume (for P2)

## As-Built Specs

- [human-in-the-loop.md](../../docs/spec/human-in-the-loop.md) — HIL design invariants, schema, interrupt envelope, resume contract

## Design Notes

### Explicitly Deferred from P0

- UI-specific payload schemas in ai-core (graphs own their types)
- Claude Agent SDK provider (validate LangGraph first)
- Time-travel/forking via checkpoint selection
- Interrupt timeout auto-cleanup job (table has `expires_at`; cleanup job is P1)
- WebSocket push for interrupt notifications
- Branded types (`StateKey`, `InterruptKind`) — use plain strings for P0

**Why:** P0 validates pause/resume contract works with one provider (LangGraph) using the unified routing table. Multi-provider validation in P1+.
