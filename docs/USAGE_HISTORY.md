# Usage History Design

> [!CRITICAL]
> Usage history persists message artifacts from AI runs (user input, assistant output). It is a parallel AiEvent stream consumer to billing—neither blocks the other. Not all runs are "conversations."

## Core Invariants

1. **RUN_SCOPED_HISTORY**: All history records reference `run_id`. A run may have 0..N message artifacts.

2. **PARALLEL_TO_BILLING**: HistoryWriterSubscriber consumes AiEvent stream alongside BillingSubscriber. Neither depends on the other. Both are idempotent.

3. **IDEMPOTENT_WRITES**: `UNIQUE(run_id, artifact_key)` prevents duplicate inserts on replay. Same pattern as billing.

4. **USER_ARTIFACT_AT_START**: User input artifact persisted immediately on run start (before execution). Survives graph crash.

5. **ASSISTANT_ARTIFACT_ON_FINAL**: Assistant output artifact persisted on `done` event—NOT on deltas. One assistant artifact per run. HistoryWriterSubscriber buffers text_deltas in-memory and persists accumulated content on `done`.

6. **NO_DELTA_STORAGE**: P0 does NOT persist streaming deltas. Only user input + final assistant output. Delta storage is P2+ if needed for replay UX.

7. **RETRY_IS_NEW_RUN**: A retry creates a new `run_id`. No `attempt` field in P0—lineage/retry semantics are P1 (requires `runs` table).

---

## Implementation Checklist

### P0: Minimal Message Persistence

Persist user input and assistant final output per run. No tool call/result storage yet.

- [ ] Create `RunHistoryPort` interface in `src/ports/run-history.port.ts`
- [ ] Create `run_artifacts` table (see Schema below)
- [ ] Create `DrizzleRunHistoryAdapter` in `src/adapters/server/ai/`
- [ ] Wire `HistoryWriterSubscriber` into `RunEventRelay` fanout (parallel to billing)
- [ ] Persist user artifact at run start in `AiRuntimeService.runGraph()`
- [ ] Persist assistant artifact on `done` event in `HistoryWriterSubscriber`
- [ ] Add idempotency test: replay `done` twice → 1 assistant artifact row
- [ ] Add buffering test: 3 text_deltas + done → 1 artifact with concatenated content

#### Chores

- [ ] Observability instrumentation [observability.md](../.agent/workflows/observability.md)
- [ ] Documentation updates [document.md](../.agent/workflows/document.md)

### P1: Tool Call Artifacts (Optional)

Enable if graph tool-calling requires audit/replay.

- [ ] Add `tool_call` artifact type: `{toolName, argsRedacted, resultSummary}`
- [ ] Persist tool artifacts via HistoryWriterSubscriber on `tool_call_result` events
- [ ] Stack test: graph with tool calls → tool artifacts persisted

### P2: Session Lineage (Future)

Session = sequence of related runs (multi-turn chat, iterative workflows).

- [ ] Evaluate need after P1
- [ ] Add `sessions` table linking runs
- [ ] Add `previous_run_id` column for explicit chaining
- [ ] **Do NOT build preemptively**

---

## File Pointers (P0 Scope)

| File                                            | Change                                         |
| ----------------------------------------------- | ---------------------------------------------- |
| `src/ports/run-history.port.ts`                 | New: `RunHistoryPort` interface                |
| `src/ports/index.ts`                            | Re-export `RunHistoryPort`                     |
| `src/shared/db/schema.history.ts`               | New: `run_artifacts` table                     |
| `src/adapters/server/ai/run-history.adapter.ts` | New: `DrizzleRunHistoryAdapter`                |
| `src/features/ai/services/ai_runtime.ts`        | Persist user artifact at run start             |
| `src/features/ai/services/history-writer.ts`    | New: HistoryWriterSubscriber consumes AiEvents |
| `src/bootstrap/container.ts`                    | Wire RunHistoryPort                            |
| `tests/stack/ai/history-idempotency.test.ts`    | New: replay done twice → 1 row                 |
| `tests/stack/ai/history-buffering.test.ts`      | New: text_deltas + done → concatenated content |
| `tests/ports/run-history.port.spec.ts`          | New: port contract test                        |

---

## Schema

**New table: `run_artifacts`**

| Column         | Type        | Notes                                         |
| -------------- | ----------- | --------------------------------------------- |
| `id`           | uuid        | PK                                            |
| `run_id`       | text        | NOT NULL                                      |
| `artifact_key` | text        | NOT NULL, e.g. `user/0`, `assistant/final`    |
| `role`         | text        | NOT NULL, `user` \| `assistant` \| `tool`     |
| `content`      | text        | Nullable (content may be in content_ref)      |
| `content_ref`  | text        | Nullable (blob storage ref for large content) |
| `metadata`     | jsonb       | Nullable (model, finishReason, etc.)          |
| `created_at`   | timestamptz |                                               |

**Constraints:**

- `UNIQUE(run_id, artifact_key)` — idempotency (one artifact per key per run)
- Index on `run_id` for run-level queries
- Adapter uses `INSERT ... ON CONFLICT DO NOTHING` for idempotent writes

**Idempotency key format:**

| Role        | artifact_key        | When persisted                           |
| ----------- | ------------------- | ---------------------------------------- |
| `user`      | `user/0`            | Run start (before graph execution)       |
| `assistant` | `assistant/final`   | On `done` event                          |
| `tool`      | `tool/{toolCallId}` | P1: On `tool_call_result` (if persisted) |

**Why no `conversation_id`?** Conversations are a UI concept. The underlying primitive is runs. Session/conversation grouping is P2 if needed.

**Why `content` + `content_ref`?** Small messages inline; large messages (images, docs) go to blob storage with a ref. P0: inline only.

**Metadata fields (P0 minimum):** Since no `runs` table exists in P0, artifact metadata carries run-level info for debugging:

- `assistant/final` metadata: `{model, finishReason, executorType, graphName?}`
- `user/0` metadata: `{selectedModel, executorType}`

---

## Design Decisions

### 1. Run vs Conversation Terminology

| Term             | Meaning                               | When to use      |
| ---------------- | ------------------------------------- | ---------------- |
| **Run**          | Single graph execution (runId)        | Always           |
| **Session**      | Sequence of related runs (multi-turn) | P2 if needed     |
| **Conversation** | UI concept over session               | Never in backend |

**Rule:** Backend uses `run`. Frontend may present as "conversation" but never passes that term to API.

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
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────┐
│ UI Subscriber   │ │ Billing Sub     │ │ History Sub     │ │ (Future)    │
│ ──────────────  │ │ ───────────     │ │ ───────────     │ │             │
│ May disconnect  │ │ commitUsageFact │ │ persistArtifact │ │             │
│                 │ │ on usage_report │ │ on done event   │ │             │
└─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────┘
```

**Key point:** HistoryWriterSubscriber is parallel to BillingSubscriber. Both consume the same AiEvent stream. Neither blocks the other.

**Content buffering:** HistoryWriterSubscriber maintains per-run buffer state:

1. On `text_delta` → append delta to in-memory buffer (transient, NOT persisted)
2. On `done` → persist assembled buffer as assistant artifact content, clear buffer

**Explicit:** Deltas are buffered transiently in-memory only. The `run_artifacts` table stores only the final assembled content, not individual deltas. This matches how UI clients accumulate streaming content. No changes needed to AiEvent types—`DoneEvent` remains a signal; content comes from buffered deltas.

---

### 3. Idempotency Key Strategy

**Format:** `${role}/${qualifier}`

| artifact_key      | Uniqueness scope         |
| ----------------- | ------------------------ |
| `user/0`          | One user input per run   |
| `assistant/final` | One final output per run |
| `tool/{callId}`   | One per tool invocation  |

**Why this format?** Simple, explicit, and self-documenting. No attempt field in P0—retries create new runs.

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
- Session/conversation linking
- Content blob storage (large messages)
- Tool call/result persistence
- Message threading/branching
- Edit/regenerate lineage

**Why:** Start minimal. Validate run-scoped artifacts work before adding complexity.

---

## Port Interface

```typescript
// src/ports/run-history.port.ts

export interface RunArtifact {
  readonly runId: string;
  readonly artifactKey: string;
  readonly role: "user" | "assistant" | "tool";
  readonly content?: string;
  readonly contentRef?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface RunHistoryPort {
  /**
   * Persist a run artifact.
   * Idempotent: duplicate (runId, artifactKey) is no-op via ON CONFLICT DO NOTHING.
   */
  persistArtifact(artifact: RunArtifact): Promise<void>;

  /**
   * Retrieve artifacts for a run.
   */
  getArtifacts(runId: string): Promise<readonly RunArtifact[]>;
}
```

---

## Related Documents

- [GRAPH_EXECUTION.md](GRAPH_EXECUTION.md) — Run-centric billing, RunEventRelay, pump+fanout
- [AI_SETUP_SPEC.md](AI_SETUP_SPEC.md) — AiEvent types, stream architecture
- [ARCHITECTURE.md](ARCHITECTURE.md) — Hexagonal layers, port patterns

---

**Last Updated**: 2025-12-22
**Status**: Draft (P0 Design)
