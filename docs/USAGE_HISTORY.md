# Usage History Design

> [!CRITICAL]
> Usage history persists message artifacts from AI runs (user input, assistant output). It is a parallel AiEvent stream consumer to billing—neither blocks the other. **For `langgraph_server` executor, LangGraph Server owns canonical thread state; `run_artifacts` is optional cache only.**

## Core Invariants

1. **RUN_SCOPED_HISTORY**: All history records reference `run_id`. A run may have 0..N message artifacts.

2. **PARALLEL_TO_BILLING**: HistoryWriterSubscriber consumes AiEvent stream alongside BillingSubscriber. Neither depends on the other. Both are idempotent. RunEventRelay fans out via per-subscriber queues (non-blocking); slow subscribers do not block UI streaming.

3. **IDEMPOTENT_WRITES**: `UNIQUE(account_id, run_id, artifact_key)` prevents duplicate inserts on in-process event duplication. Tenant-scoped uniqueness avoids cross-tenant collisions if run_id is ever mis-scoped. Adapter uses `ON CONFLICT DO NOTHING`, then SELECTs existing row to compare `content_hash`. If hash mismatch, emit error metric (runId + artifactKey only, never content/hashes). Same pattern as billing. **Note:** This handles same-process duplicate delivery, not crash recovery—there is no persistent event log in P0.

4. **USER_ARTIFACT_AT_START**: User input artifact persisted immediately on run start (before execution). Survives graph crash.

5. **ASSISTANT_FINAL_SINGLE_EMIT**: On success, executors emit exactly one `assistant_final` event with final content. On error, no event is emitted. HistoryWriter persists it directly—no delta parsing. Duplicate events are idempotent (logged, not stored twice).

6. **NO_DELTA_STORAGE**: P0 does NOT persist streaming deltas. Only user input + final assistant output. Delta storage is P2+ if needed for replay UX.

7. **RETRY_IS_NEW_RUN**: A retry creates a new `run_id`. No `attempt` field in P0—lineage/retry semantics are P1+ (requires `runs` table).

8. **ARTIFACTS_ARE_CACHE**: `run_artifacts` is a best-effort transcript cache for billing correlation and activity display—NOT the source of truth for thread state. **For `langgraph_server` executor:** LangGraph Server is canonical; never reconstruct conversation from `run_artifacts`. **For `inproc`/`claude_sdk` executors:** artifacts may be the only record. **Note:** Do not claim "audit" until durable event delivery exists.

9. **THREAD_ID_PROPAGATION**: For LangGraph runs, `thread_id` flows: `GraphRunRequest.threadId` → LangGraph config → relay context → `run_artifacts.thread_id`. Enables resume/time-travel correlation.

10. **RELAY_PROVIDES_CONTEXT**: RunEventRelay provides run context (`runId`, `threadId`, `accountId`) to subscribers. Events are pure payloads without these fields; subscribers receive context from relay. This prevents cross-run attribution bugs and ensures tenant scope is never omitted.

11. **LANGGRAPH_POSTGRES_SAVER**: LangGraph.js uses self-hosted `PostgresSaver` checkpointer (not LangSmith Threads API). Thread creation is implicit—`thread_id` is just the checkpointer key passed in config. Checkpoint metadata (`checkpointId`, `checkpointNs`) is LangGraph-only; UI must not depend on it in P0.

12. **TENANT_SCOPED**: All `run_artifacts` rows include `account_id` (NOT NULL). All queries MUST filter by tenant. Postgres RLS enforces isolation in-db with `FORCE ROW LEVEL SECURITY`. Missing tenant context = access denied.

13. **SOFT_DELETE_DEFAULT**: All reads filter `WHERE deleted_at IS NULL AND (retention_expires_at IS NULL OR retention_expires_at > now())`. Hard delete via scheduled job only (P1).

14. **REDACT_BEFORE_PERSIST**: HistoryWriterSubscriber applies masking before computing `content_hash` and before calling `persistArtifact()`. Same masking applies before any logs/traces. Single redaction boundary—no downstream masking. Regex masking is best-effort (secrets-first: API keys, tokens). **Stored content may still contain PII**—retention and deletion must treat all content as personal data.

15. **TENANT_SCOPED_THREAD_ID**: LangGraph `thread_id` MUST be tenant-scoped: `${accountId}:${stateKey}`. This ensures checkpoint isolation—checkpoints contain real state and may include PII. Isolating only artifacts is insufficient.

16. **EXECUTOR_TYPE_REQUIRED**: `UsageFact.executorType` is required (`langgraph_server` | `claude_sdk` | `inproc`). History/billing logic must be executor-agnostic. P0: Store in `run_artifacts.metadata.executorType`; defer column migration until indexing need.

17. **P0_NO_GDPR_DELETE**: P0 does NOT provide compliant user data deletion. Deleting `run_artifacts` without LangGraph checkpoints is insufficient for `langgraph_server` runs. Full deletion (artifacts + checkpoints by tenant-scoped thread_id) is a P1 requirement.

---

## Implementation Checklist

### P0: Minimal Message Persistence

Persist user input and assistant final output per run. No tool call/result storage yet.

#### Core Persistence

- [ ] Create `RunHistoryPort` interface in `src/ports/run-history.port.ts`
- [ ] Create `run_artifacts` table with tenant scope (see Schema below)
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
- [ ] Add RLS policy with `FORCE ROW LEVEL SECURITY` (see Schema)
- [ ] Add indexes `(account_id, run_id)` and `(account_id, thread_id)`
- [ ] Pass `accountId` via relay context (RELAY_PROVIDES_CONTEXT)
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

- [ ] Observability instrumentation [observability.md](../.agent/workflows/observability.md)
- [ ] Documentation updates [document.md](../.agent/workflows/document.md)

### P1: Tool Call Artifacts (Optional)

Enable for `inproc`/`claude_sdk` executors if tool-calling requires audit/replay. **Not needed for `langgraph_server`—LangGraph Server already persists tool calls in checkpoints.**

- [ ] Add `tool_call` artifact type: `{toolName, argsRedacted, resultSummary}`
- [ ] Persist tool artifacts via HistoryWriterSubscriber on `tool_call_result` events
- [ ] Stack test: graph with tool calls → tool artifacts persisted
- [ ] Gate persistence: only for non-langgraph_server executors (or make optional via config)

### P1: Enhanced Retention & Masking

- [ ] Scheduled job to hard-delete rows where `retention_expires_at < now() - grace_period`
- [ ] Evaluate pg_partman for partition-based retention at scale
- [ ] Evaluate Presidio integration for stronger PII detection
- [ ] Add per-workspace retention policy override

### P1: LangGraph Checkpoint Deletion (Compliance Blocker)

**Per P0_NO_GDPR_DELETE:** Deleting artifacts without checkpoints is NOT compliant user data deletion—checkpoints hold real conversation state including PII.

- [ ] Implement deletion API for LangGraph PostgresSaver checkpoint tables
- [ ] Delete by tenant-scoped thread_id prefix (`${accountId}:%`) for full account deletion
- [ ] Delete by specific thread_id for conversation deletion
- [ ] Coordinate artifact + checkpoint deletion for GDPR/user-initiated delete requests
- [ ] Stack test: delete user data → both artifacts AND checkpoints removed

### P1+: Run Lineage (Future)

Add `graph_runs` table for retry/resume semantics if needed.

- [ ] Evaluate need after P0
- [ ] Add `graph_runs` table: `{run_id PK, parent_run_id?, status, executor_type, graph_name?, timestamps}`
- [ ] Attempt = computed from lineage chain depth
- [ ] **Do NOT build preemptively**

### P2: Thread Linking (Future)

Thread = LangGraph thread_id scope (multi-run accumulation). For non-LangGraph, thread groups related runs.

- [ ] Evaluate need after P1
- [ ] Index on `thread_id` for thread-level queries
- [ ] Add `previous_run_id` column if explicit chaining needed
- [ ] **Do NOT build preemptively**

---

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

---

## Schema

**New table: `run_artifacts`**

| Column                 | Type        | Notes                                            |
| ---------------------- | ----------- | ------------------------------------------------ |
| `id`                   | uuid        | PK                                               |
| `account_id`           | text        | NOT NULL (tenant scope)                          |
| `run_id`               | text        | NOT NULL                                         |
| `thread_id`            | text        | Nullable (must be tenant-prefixed per invariant) |
| `artifact_key`         | text        | NOT NULL, e.g. `input`, `output`, `tool/{id}`    |
| `role`                 | text        | NOT NULL, `user` \| `assistant` \| `tool`        |
| `content`              | text        | Nullable (masked before storage)                 |
| `content_hash`         | text        | Nullable (sha256 hex, computed AFTER masking)    |
| `content_json`         | jsonb       | Nullable (reserved; unused in P0)                |
| `content_ref`          | text        | Nullable (blob storage ref for large content)    |
| `metadata`             | jsonb       | Nullable (model, finishReason, etc.)             |
| `created_at`           | timestamptz |                                                  |
| `deleted_at`           | timestamptz | Nullable (soft delete)                           |
| `retention_expires_at` | timestamptz | Nullable (default = created_at + retention days) |

**Constraints:**

- `UNIQUE(account_id, run_id, artifact_key)` — idempotency scoped to tenant (avoids assumption that run_id is globally unique)
- Adapter uses `ON CONFLICT DO NOTHING` for idempotent writes

**Indexes:**

- `(account_id, run_id)` — tenant-scoped run queries
- `(account_id, thread_id)` partial where thread_id not null — tenant-scoped thread queries
- `(retention_expires_at)` partial where not deleted — retention job queries

**RLS (per TENANT_SCOPED invariant):**

- Enable + force RLS on table
- Policy requires BOTH `USING` (reads/updates/deletes) AND `WITH CHECK` (inserts/update-to) clauses
- Both clauses check `account_id = current_setting('app.current_account_id', true)`
- Missing setting returns NULL → denies all access (reads and writes)
- **Transaction scope required:** All adapter calls must run in explicit DB transaction. `SET LOCAL` only works inside transactions; outside, it silently does nothing. Adapter executes `SET LOCAL app.current_account_id = $1` at transaction start before any queries.

**Hashing rule:** Masking applied FIRST (per REDACT_BEFORE_PERSIST). Then hash stable JSON or utf8 content. Mismatch on conflict = error metric (no content logged).

**Idempotency key format:**

| Role        | artifact_key        | When persisted                           |
| ----------- | ------------------- | ---------------------------------------- |
| `user`      | `input`             | Run start (before graph execution)       |
| `assistant` | `output`            | On `assistant_final` event               |
| `tool`      | `tool/{toolCallId}` | P1: On `tool_call_result` (if persisted) |

**Why no `conversation_id`?** Conversations are a UI concept. The underlying primitive is runs. Session/conversation grouping is P2 if needed.

**Why `content` + `content_ref`?** Small messages inline; large messages (images, docs) go to blob storage with a ref. P0: inline only.

**Metadata fields (P0 minimum):** Since no `runs` table exists in P0, artifact metadata carries run-level info for debugging:

- `output` metadata: `{model, finishReason, executorType, graphName?}`
- `input` metadata: `{selectedModel, executorType}`
- LangGraph runs: executor may add `{checkpointId?, checkpointNs?}` to metadata for time-travel correlation (optional, UI must not depend on it)

---

## Design Decisions

### 1. Run vs Thread vs Conversation Terminology

| Term             | Meaning                                         | When to use      |
| ---------------- | ----------------------------------------------- | ---------------- |
| **Run**          | Single graph execution (runId)                  | Always           |
| **Thread**       | LangGraph thread scope (multi-run accumulation) | LangGraph runs   |
| **Conversation** | UI concept over thread/runs                     | Never in backend |

**Rule:** Backend uses `run` and `thread`. Frontend may present as "conversation" but never passes that term to API.

---

### 2. Stream Consumer Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│ AiRuntimeService.runGraph(request)                                  │
│ ─────────────────────────────                                       │
│ 1. Generate run_id; persist USER artifact (idempotent)              │
│ 2. Call executor → get stream                                       │
│ 3. Start RunEventRelay.pump() → fanout to subscribers               │
└─────────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┬───────────────┐
              ▼               ▼               ▼               ▼
┌─────────────────┐ ┌─────────────────┐ ┌───────────────────┐ ┌─────────────┐
│ UI Subscriber   │ │ Billing Sub     │ │ History Sub       │ │ (Future)    │
│ ──────────────  │ │ ───────────     │ │ ───────────       │ │             │
│ May disconnect  │ │ commitUsageFact │ │ persistArtifact   │ │             │
│                 │ │ on usage_report │ │ on assistant_final│ │             │
└─────────────────┘ └─────────────────┘ └───────────────────┘ └─────────────┘
```

**Key point:** HistoryWriterSubscriber is parallel to BillingSubscriber. Both consume the same AiEvent stream. Neither blocks the other.

**Content strategy:** All executors emit `assistant_final` event with content. HistoryWriter persists directly—no delta parsing required.

```typescript
// New AiEvent type (add to @/types/ai-events.ts)
export interface AssistantFinalEvent {
  readonly type: "assistant_final";
  readonly content: string;
  // No runId/threadId here - relay provides context per RELAY_PROVIDES_CONTEXT
}
```

**Why `assistant_final` instead of buffering?** Decouples HistoryWriter from executor internals. LangGraph extracts final message from state; direct LLM assembles from deltas. Both emit the same event type. Relay provides `runId`/`threadId` context to subscribers.

---

### 3. Idempotency Key Strategy

| artifact_key    | Uniqueness scope         |
| --------------- | ------------------------ |
| `input`         | One user input per run   |
| `output`        | One final output per run |
| `tool/{callId}` | One per tool invocation  |

**Why `input`/`output` not `user`/`assistant`?** Avoids collision with `role` enum. `role` = speaker (user/assistant/tool); `artifact_key` = artifact type.

---

### 4. ONE_HISTORY_WRITER Enforcement

Only `history-writer.ts` may call `runHistoryPort.persistArtifact()`.

**Depcruise rule** (add to `.dependency-cruiser.cjs`):

```javascript
{
  name: "one-history-writer",
  severity: "error",
  from: {
    path: "^src/features/",
    pathNot: "^src/features/ai/services/history-writer\\.ts$"
  },
  to: {
    path: "^src/ports/run-history\\.port"
  }
}
```

---

### 5. What We're NOT Building in P0

**Explicitly deferred:**

- Streaming delta persistence (full message replay)
- Thread-level queries/indexes
- Content blob storage (large messages)
- Tool call/result persistence
- Message threading/branching
- Edit/regenerate lineage
- LangGraph checkpointer integration (runs use checkpointer directly; artifacts are cache)

**Why:** Start minimal. Validate run-scoped artifacts work before adding complexity.

---

## Port Interface

```typescript
// src/ports/run-history.port.ts

export interface RunArtifact {
  readonly accountId: string; // tenant scope (required, per TENANT_SCOPED)
  readonly runId: string;
  readonly threadId?: string; // must be tenant-prefixed per TENANT_SCOPED_THREAD_ID
  readonly artifactKey: string;
  readonly role: "user" | "assistant" | "tool";
  readonly content?: string; // masked before storage per REDACT_BEFORE_PERSIST
  readonly contentHash?: string; // sha256 hex (computed AFTER masking)
  readonly contentRef?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface RunHistoryPort {
  /** Idempotent persist. Hash mismatch on conflict = error metric. */
  persistArtifact(artifact: RunArtifact): Promise<void>;

  /** Tenant-scoped read. Filters deleted/expired. ORDER BY created_at ASC, id ASC. */
  getArtifacts(
    accountId: string,
    runId: string
  ): Promise<readonly RunArtifact[]>;

  /** Soft delete all artifacts for a run. */
  softDelete(accountId: string, runId: string): Promise<void>;
}
```

---

## Integration Points

**GraphRunRequest change:** Add `threadId?: string` to `src/ports/graph-executor.port.ts`:

```typescript
export interface GraphRunRequest {
  readonly runId: string;
  readonly threadId?: string; // LangGraph thread scope (optional)
  // ... existing fields
}
```

---

## Related Documents

- [LANGGRAPH_SERVER.md](LANGGRAPH_SERVER.md) — External runtime, checkpoint ownership
- [ACCOUNTS_DESIGN.md](ACCOUNTS_DESIGN.md) — Owner vs Actor tenancy rules (canonical source for `account_id` semantics)
- [GRAPH_EXECUTION.md](GRAPH_EXECUTION.md) — Run-centric billing, RunEventRelay, pump+fanout
- [AI_SETUP_SPEC.md](AI_SETUP_SPEC.md) — AiEvent types, stream architecture
- [ARCHITECTURE.md](ARCHITECTURE.md) — Hexagonal layers, port patterns
- [LANGGRAPH_AI.md](LANGGRAPH_AI.md) — Graph patterns, thread_id tenant-scoping

---

**Last Updated**: 2025-12-22
**Status**: Draft (P0 Design - Executor-Agnostic)
