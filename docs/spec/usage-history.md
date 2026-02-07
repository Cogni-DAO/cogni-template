---
id: spec.usage-history
type: spec
title: Usage History Design
status: draft
spec_state: draft
trust: draft
summary: Tenant-scoped run artifact persistence for user input and assistant output, parallel to billing, with RLS enforcement, soft delete, PII masking, and LangGraph checkpoint coordination.
read_when: Implementing message history, run artifact persistence, or user data deletion
implements: []
owner: cogni-dev
created: 2025-12-22
verified: null
tags:
  - ai-graphs
  - data
  - tenant-isolation
  - compliance
---

# Usage History Design

## Context

AI runs need to persist message artifacts (user input, assistant output) for:

- Activity display in UI (conversation history)
- Billing correlation (match usage to artifacts)
- Debugging and support (what did the user ask, what did the model respond)

Without artifact persistence:

- Users cannot see their conversation history
- Billing records lack context (usage without the actual messages)
- Debugging requires log archaeology (no structured message retrieval)

This spec defines `run_artifacts` as a tenant-scoped cache for message transcripts, parallel to billing, with soft delete, PII masking, and coordination with LangGraph checkpoints for GDPR-compliant deletion.

## Goal

Enable message artifact persistence with:

- Tenant-scoped storage (`account_id` NOT NULL, RLS enforced)
- Parallel to billing (HistoryWriterSubscriber alongside BillingSubscriber, neither blocks the other)
- Idempotent writes (`UNIQUE(account_id, run_id, artifact_key)`)
- User artifact persisted at run start (survives graph crash)
- Assistant final artifact persisted on success (no delta storage in P0)
- Soft delete with retention policies (default 90 days, hard delete via scheduled job)
- PII masking before storage (regex-based, applied before hash computation)
- LangGraph checkpoint coordination for GDPR deletion (P1 requirement)

## Non-Goals

- **Not in scope (P0):** Streaming delta persistence (full message replay)
- **Not in scope (P0):** Thread-level queries/indexes
- **Not in scope (P0):** Content blob storage (large messages go to blob storage)
- **Not in scope (P0):** Tool call/result persistence (P1 for non-LangGraph executors)
- **Not in scope (P0):** Message threading/branching, edit/regenerate lineage
- **Not in scope (P0):** GDPR-compliant deletion (requires LangGraph checkpoint deletion, P1)
- **Not canonical:** LangGraph Server owns thread state for `langgraph_server` executor; `run_artifacts` is cache only

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

## Design

### Key Decisions

#### 1. Run vs Thread vs Conversation Terminology

| Term             | Meaning                                         | When to use      |
| ---------------- | ----------------------------------------------- | ---------------- |
| **Run**          | Single graph execution (runId)                  | Always           |
| **Thread**       | LangGraph thread scope (multi-run accumulation) | LangGraph runs   |
| **Conversation** | UI concept over thread/runs                     | Never in backend |

**Rule:** Backend uses `run` and `thread`. Frontend may present as "conversation" but never passes that term to API.

---

#### 2. Stream Consumer Architecture

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

#### 3. Idempotency Key Strategy

| artifact_key    | Uniqueness scope         |
| --------------- | ------------------------ |
| `input`         | One user input per run   |
| `output`        | One final output per run |
| `tool/{callId}` | One per tool invocation  |

**Why `input`/`output` not `user`/`assistant`?** Avoids collision with `role` enum. `role` = speaker (user/assistant/tool); `artifact_key` = artifact type.

---

#### 4. ONE_HISTORY_WRITER Enforcement

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

#### 5. What We're NOT Building in P0

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

### Port Interface

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

### Integration Points

**GraphRunRequest change:** Add `threadId?: string` to `src/ports/graph-executor.port.ts`:

```typescript
export interface GraphRunRequest {
  readonly runId: string;
  readonly threadId?: string; // LangGraph thread scope (optional)
  // ... existing fields
}
```

---

## Acceptance Checks

**Automated:**

- `pnpm test src/adapters/server/ai/run-history.adapter.test.ts` — DrizzleRunHistoryAdapter with RLS
- `pnpm test tests/stack/ai/history-idempotency.test.ts` — Replay assistant_final twice → 1 row
- `pnpm test tests/stack/ai/history-tenant-isolation.test.ts` — Cross-tenant access denied, missing RLS denied
- `pnpm test tests/ports/run-history.port.spec.ts` — Port contract with accountId requirement
- `pnpm test src/features/ai/services/masking.test.ts` — PII masking patterns (email, phone, API keys)

**Manual (until automated):**

1. Verify user artifact persisted at run start (query `run_artifacts WHERE role='user'`)
2. Verify assistant artifact persisted on success (query `run_artifacts WHERE role='assistant'`)
3. Verify soft delete filters deleted/expired rows (set `deleted_at`, query should exclude)
4. Verify tenant-scoped thread_id format (`${accountId}:${stateKey}`)
5. Verify LangGraph checkpoint isolation (no cross-tenant checkpoint access)

## Open Questions

- [ ] What should the default retention window be? (90 days proposed)
- [ ] Should tool call artifacts be persisted in P0 or deferred to P1?
- [ ] Should we use Presidio for stronger PII detection in P1, or stick with regex?
- [ ] What's the hard-delete grace period after retention_expires_at? (7 days?)

## Rollout / Migration

1. Add `run_artifacts` table with RLS policies via migration
2. Create `RunHistoryPort` + `DrizzleRunHistoryAdapter`
3. Wire `HistoryWriterSubscriber` into `RunEventRelay` fanout (parallel to billing)
4. Update executors to emit `assistant_final` event (breaking change for direct LLM executors)
5. Add `threadId` to `GraphRunRequest` (optional field, backward compatible)
6. Add masking utility and apply before persistence
7. Add retention config (`ARTIFACT_RETENTION_DAYS=90`)

**Breaking changes:**

- Executors must emit `assistant_final` event (LangGraph: extract from state; direct LLM: assemble from deltas)
- All `getArtifacts()` calls must provide `accountId` parameter (tenant scope required)

**Data migration:**

- None (new table, no existing data to migrate)

## Related

- [LangGraph Server](../LANGGRAPH_SERVER.md) — External runtime, checkpoint ownership (pending migration)
- [Accounts Design](../ACCOUNTS_DESIGN.md) — Owner vs Actor tenancy rules (pending migration)
- [Graph Execution](../GRAPH_EXECUTION.md) — Run-centric billing, RunEventRelay, pump+fanout (pending migration)
- [AI Setup](./ai-setup.md) — AiEvent types, stream architecture
- [Architecture](./architecture.md) — Hexagonal layers, port patterns
- [LangGraph Patterns](../LANGGRAPH_AI.md) — Graph patterns, thread_id tenant-scoping (pending migration)
- [Usage History Initiative](../../work/initiatives/ini.usage-history-persistence.md) — Implementation roadmap
