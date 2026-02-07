---
work_item_id: ini.usage-history-persistence
work_item_type: initiative
title: Usage History & Run Artifact Persistence
state: Active
priority: 1
estimate: 5
summary: Persist user input and assistant output artifacts from AI runs with tenant isolation, soft delete, PII masking, and LangGraph checkpoint integration for GDPR compliance.
outcome: Run artifacts (user input + assistant final output) persisted in `run_artifacts` table with RLS-enforced tenant scope, idempotent writes, soft delete, and coordinated LangGraph checkpoint deletion for compliant user data deletion.
assignees:
  - cogni-dev
created: 2026-02-07
updated: 2026-02-07
labels:
  - ai-graphs
  - data
  - compliance
  - tenant-isolation
---

# Usage History & Run Artifact Persistence

> Source: docs/USAGE_HISTORY.md

## Goal

Build a tenant-scoped artifact persistence layer for AI runs that stores user input and assistant final output, with idempotent writes parallel to billing, PII masking before storage, soft delete with retention policies, and LangGraph checkpoint deletion for GDPR-compliant user data deletion.

## Roadmap

### Crawl (P0): Minimal Message Persistence

**Goal:** Persist user input and assistant final output per run with tenant isolation, soft delete, and PII masking. No tool call/result storage yet.

| Deliverable                                                             | Status      | Est | Work Item |
| ----------------------------------------------------------------------- | ----------- | --- | --------- |
| Core Persistence: RunHistoryPort + run_artifacts table + DrizzleAdapter | Not Started | 3   | —         |
| Tenant Isolation: RLS policies + account_id enforcement + stack tests   | Not Started | 2   | —         |
| Retention & Soft Delete: columns + filters + default retention config   | Not Started | 2   | —         |
| Masking: regex-based PII masking before persist + hash computation      | Not Started | 2   | —         |
| Thread ID Scoping: enforce `${accountId}:${stateKey}` format            | Not Started | 1   | —         |

#### Core Persistence

- [ ] Create `RunHistoryPort` interface in `src/ports/run-history.port.ts`
- [ ] Create `run_artifacts` table with tenant scope (see Schema in spec)
- [ ] Create `DrizzleRunHistoryAdapter` in `src/adapters/server/ai/`
- [ ] Wire `HistoryWriterSubscriber` into `RunEventRelay` fanout (parallel to billing)
- [ ] Persist user artifact at run start in `AiRuntimeService.runGraph()`
- [ ] Add `AssistantFinalEvent` to AiEvent union in `@/types/ai-events.ts`
- [ ] Executors emit `assistant_final` event (LangGraph: from state; direct LLM: assembled from deltas)
- [ ] Persist assistant artifact on `assistant_final` event in `HistoryWriterSubscriber`
- [ ] Add idempotency test: replay `assistant_final` twice → 1 assistant artifact row
- [ ] Add ordering test: `getArtifacts()` returns deterministic order (created_at ASC, id ASC)

#### Tenant Isolation (P0 blocker)

- [ ] Add `account_id` NOT NULL column to `run_artifacts` schema
- [ ] Add RLS policy with `FORCE ROW LEVEL SECURITY` (see Schema in spec)
- [ ] Add indexes `(account_id, run_id)` and `(account_id, thread_id)`
- [ ] Pass `accountId` via relay context (RELAY_PROVIDES_CONTEXT invariant)
- [ ] Update `getArtifacts()` to require `accountId` parameter
- [ ] Add stack test: query without `SET LOCAL app.current_account_id` → access denied
- [ ] Add stack test: cannot read artifacts with mismatched `account_id`

#### Retention & Soft Delete

- [ ] Add `deleted_at` and `retention_expires_at` columns to schema
- [ ] Add retention index on `retention_expires_at`
- [ ] Filter deleted/expired rows in all read queries by default
- [ ] Add `softDelete(accountId, runId)` to port interface
- [ ] Document default retention window in config (e.g., `ARTIFACT_RETENTION_DAYS=90`)

#### Masking (REDACT_BEFORE_PERSIST)

- [ ] Create `src/features/ai/services/masking.ts` with regex-based PII masking
- [ ] Implement patterns: email, phone, credit card, API keys (sk-\*, Bearer, key patterns)
- [ ] Apply masking in HistoryWriterSubscriber BEFORE `content_hash` computation
- [ ] Apply same masking BEFORE any content logging/tracing

#### Thread ID Scoping (TENANT_SCOPED_THREAD_ID)

- [ ] Enforce `thread_id = ${accountId}:${stateKey}` format in `AiRuntimeService`
- [ ] Add contract test: LangGraph runs require tenant-scoped thread_id

#### Chores

- [ ] Observability instrumentation
- [ ] Documentation updates

### Walk (P1): Tool Call Artifacts + Enhanced Retention

**Goal:** Optionally persist tool calls for non-LangGraph executors, add scheduled hard-delete job, evaluate stronger PII detection.

| Deliverable                                                                              | Status      | Est | Work Item |
| ---------------------------------------------------------------------------------------- | ----------- | --- | --------- |
| Tool Call Artifacts: persist tool_call artifacts for inproc/claude_sdk executors         | Not Started | 2   | —         |
| Enhanced Retention: scheduled hard-delete job + evaluate pg_partman + Presidio           | Not Started | 3   | —         |
| LangGraph Checkpoint Deletion: coordinated artifact + checkpoint deletion (GDPR blocker) | Not Started | 3   | —         |

#### Tool Call Artifacts (Optional)

Enable for `inproc`/`claude_sdk` executors if tool-calling requires audit/replay. **Not needed for `langgraph_server`—LangGraph Server already persists tool calls in checkpoints.**

- [ ] Add `tool_call` artifact type: `{toolName, argsRedacted, resultSummary}`
- [ ] Persist tool artifacts via HistoryWriterSubscriber on `tool_call_result` events
- [ ] Stack test: graph with tool calls → tool artifacts persisted
- [ ] Gate persistence: only for non-langgraph_server executors (or make optional via config)

#### Enhanced Retention & Masking

- [ ] Scheduled job to hard-delete rows where `retention_expires_at < now() - grace_period`
- [ ] Evaluate pg_partman for partition-based retention at scale
- [ ] Evaluate Presidio integration for stronger PII detection
- [ ] Add per-workspace retention policy override

#### LangGraph Checkpoint Deletion (Compliance Blocker)

**Per P0_NO_GDPR_DELETE invariant:** Deleting artifacts without checkpoints is NOT compliant user data deletion—checkpoints hold real conversation state including PII.

- [ ] Implement deletion API for LangGraph PostgresSaver checkpoint tables
- [ ] Delete by tenant-scoped thread_id prefix (`${accountId}:%`) for full account deletion
- [ ] Delete by specific thread_id for conversation deletion
- [ ] Coordinate artifact + checkpoint deletion for GDPR/user-initiated delete requests
- [ ] Stack test: delete user data → both artifacts AND checkpoints removed

### Run (P2+): Run Lineage + Thread Linking

**Goal:** Add run lineage tracking and thread-level queries for retry/resume semantics and conversation grouping.

| Deliverable                                                    | Status      | Est | Work Item |
| -------------------------------------------------------------- | ----------- | --- | --------- |
| Run Lineage: `graph_runs` table for retry/resume semantics     | Not Started | 3   | —         |
| Thread Linking: thread-level queries/indexes + previous_run_id | Not Started | 2   | —         |

#### Run Lineage (Future)

Add `graph_runs` table for retry/resume semantics if needed.

- [ ] Evaluate need after P0
- [ ] Add `graph_runs` table: `{run_id PK, parent_run_id?, status, executor_type, graph_name?, timestamps}`
- [ ] Attempt = computed from lineage chain depth
- [ ] **Do NOT build preemptively**

#### Thread Linking (Future)

Thread = LangGraph thread_id scope (multi-run accumulation). For non-LangGraph, thread groups related runs.

- [ ] Evaluate need after P1
- [ ] Index on `thread_id` for thread-level queries
- [ ] Add `previous_run_id` column if explicit chaining needed
- [ ] **Do NOT build preemptively**

## Constraints

- Usage history is parallel to billing — neither blocks the other
- `run_artifacts` is a best-effort transcript cache, NOT source of truth for thread state (LangGraph Server is canonical for `langgraph_server` executor)
- All reads/writes MUST be tenant-scoped (`account_id` NOT NULL, RLS enforced)
- PII masking applied BEFORE `content_hash` computation and BEFORE any logging/tracing (single redaction boundary)
- Thread IDs MUST be tenant-scoped: `${accountId}:${stateKey}` (checkpoint isolation requirement)
- P0 does NOT provide GDPR-compliant deletion (artifacts without checkpoints is insufficient)
- No streaming delta persistence in P0 (only user input + final assistant output)

## Dependencies

- [ ] RunEventRelay fanout (GRAPH_EXECUTION.md)
- [ ] AiEvent stream architecture (AI_SETUP_SPEC.md)
- [ ] Tenant isolation patterns (ACCOUNTS_DESIGN.md)
- [ ] LangGraph PostgresSaver checkpointer (LANGGRAPH_SERVER.md)

## As-Built Specs

- [Usage History](../../docs/spec/usage-history.md) — Core invariants, schema, port interface, stream consumer architecture

## File Pointers (P0 Scope)

| File                                              | Change                                                      |
| ------------------------------------------------- | ----------------------------------------------------------- |
| `src/ports/graph-executor.port.ts`                | Add `threadId?: string` to `GraphRunRequest`                |
| `src/ports/run-history.port.ts`                   | New: `RunHistoryPort` interface with tenant scope           |
| `src/ports/index.ts`                              | Re-export `RunHistoryPort`                                  |
| `src/shared/db/schema.history.ts`                 | New: `run_artifacts` table with RLS + retention columns     |
| `src/adapters/server/ai/run-history.adapter.ts`   | New: `DrizzleRunHistoryAdapter` with RLS context setting    |
| `src/features/ai/services/ai_runtime.ts`          | Persist user artifact; enforce tenant-scoped thread_id      |
| `src/features/ai/services/history-writer.ts`      | New: HistoryWriterSubscriber with masking before persist    |
| `src/features/ai/services/masking.ts`             | New: regex-based PII masking utility                        |
| `src/bootstrap/container.ts`                      | Wire RunHistoryPort                                         |
| `src/types/ai-events.ts`                          | Add `AssistantFinalEvent` to AiEvent union                  |
| `tests/stack/ai/history-idempotency.test.ts`      | New: replay assistant_final twice → 1 row                   |
| `tests/stack/ai/history-tenant-isolation.test.ts` | New: cross-tenant access denied; missing RLS setting denied |
| `tests/ports/run-history.port.spec.ts`            | New: port contract test with accountId requirement          |

## Design Notes

### Run vs Thread vs Conversation Terminology

| Term             | Meaning                                         | When to use      |
| ---------------- | ----------------------------------------------- | ---------------- |
| **Run**          | Single graph execution (runId)                  | Always           |
| **Thread**       | LangGraph thread scope (multi-run accumulation) | LangGraph runs   |
| **Conversation** | UI concept over thread/runs                     | Never in backend |

**Rule:** Backend uses `run` and `thread`. Frontend may present as "conversation" but never passes that term to API.

### Idempotency Key Strategy

| artifact_key    | Uniqueness scope         |
| --------------- | ------------------------ |
| `input`         | One user input per run   |
| `output`        | One final output per run |
| `tool/{callId}` | One per tool invocation  |

**Why `input`/`output` not `user`/`assistant`?** Avoids collision with `role` enum. `role` = speaker (user/assistant/tool); `artifact_key` = artifact type.

### What We're NOT Building in P0

**Explicitly deferred:**

- Streaming delta persistence (full message replay)
- Thread-level queries/indexes
- Content blob storage (large messages)
- Tool call/result persistence
- Message threading/branching
- Edit/regenerate lineage
- LangGraph checkpointer integration (runs use checkpointer directly; artifacts are cache)

**Why:** Start minimal. Validate run-scoped artifacts work before adding complexity.
