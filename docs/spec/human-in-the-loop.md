---
id: human-in-the-loop-spec
type: spec
title: Human-in-the-Loop (HIL) Design
status: draft
spec_state: draft
trust: draft
summary: Provider-agnostic pause/resume contract for graph execution — interrupt envelope, execution state routing, atomic lock, discriminated union outcomes.
read_when: Working on HIL flows, interrupt/resume, execution state, or graph provider contracts.
implements:
owner: derekg1729
created: 2026-02-07
verified:
tags: [ai-graphs, langgraph]
---

# Human-in-the-Loop (HIL) Design

## Context

HIL enables graph execution to pause mid-flow for human decisions, then resume from persisted state. The design is provider-agnostic — each provider implements pause/resume via its native mechanism (LangGraph interrupt, Claude session resume, etc.). HTTP never blocks waiting for human input.

> HIL = pause/resume contract. Graph execution halts mid-flow; resume uses same `stateKey`. Providers map to native mechanism. Never poll or block HTTP requests.

## Goal

Define a provider-agnostic pause/resume contract where graph execution can yield control to a human, persist state via the provider's native mechanism, and resume from a separate HTTP request using only a public `stateKey` handle.

## Non-Goals

- UI-specific payload schemas in ai-core (graphs own their types)
- Time-travel/forking via checkpoint selection
- WebSocket push for interrupt notifications
- Branded types (`StateKey`, `InterruptKind`) — use plain strings initially

## Core Invariants

1. **PAUSE_RESUME_CONTRACT**: HIL is a provider-agnostic pause/resume pattern. Graph yields control; later resumes from persisted state. Provider implements via native mechanism:
   - LangGraph: `interrupt()` + checkpointer
   - Claude Agent SDK: session ID + `options.resume`
   - Future providers: equivalent pause/resume primitives

2. **STATELESS_HTTP_REQUIRED**: HTTP request starts graph → returns `needs_input` status + `stateKey` + interrupt envelope. Human decision arrives via separate resume request. Graph state lives in provider's persistence, not in HTTP connection.

3. **STATEKEY_IS_PUBLIC_HANDLE**: `stateKey` is the only resumable identifier exposed to UI/API. Providers own the mapping `stateKey` → internal reference (threadId, sessionId, etc.). Internal references NEVER leak to UI, logs, or API responses.

4. **NO_SIDE_EFFECTS_BEFORE_APPROVAL**: Publishing, posting, sending — all external effects MUST occur AFTER human approves. Draft content may be generated and shown; effects are gated.

5. **RESUME_VIA_PORT**: All providers resume via `GraphExecutorPort.runGraph({ stateKey, resumeDecision, ... })`. Provider translates `stateKey` to its internal reference. No provider-specific resume endpoints.

6. **INTERRUPT_ENVELOPE_MINIMAL**: On interrupt, graph returns envelope: `{ kind: string; data: unknown }`. Graph packages define typed payloads per `kind`. UI switches on `kind` to render. ai-core does NOT define UI payload schemas.

7. **PROVIDER_OWNS_STATE**: Each provider owns its checkpoint/session persistence. LangGraph uses checkpointer (Postgres). Claude SDK uses session storage. `execution_state_handles` is our routing index — not provider state.

8. **RESULT_IS_DISCRIMINATED_UNION**: `GraphRunResult.final` is a discriminated union on `status`. Each variant has exactly its required fields — no optional fields that could create inconsistent states.

9. **RESUME_VALUE_JSON_ONLY**: `resumeValue` must be JSON-serializable. Max 64KB. Validated at HTTP boundary before passing to provider. Rejects non-JSON or oversized payloads with 400.

10. **ENVELOPE_DATA_JSON_ONLY**: `interrupt.data` must be JSON-serializable. Max 256KB (larger than resume to allow rich draft content). Adapters validate before returning to API layer.

11. **ONE_ACTIVE_RUN_PER_STATEKEY**: At most one resume in-flight per `stateKey`. Enforced via atomic row lock:
    - Resume attempts `UPDATE ... SET resume_lock_id=?, resume_lock_at=now() WHERE status='active' AND (resume_lock_at IS NULL OR resume_lock_at < now()-interval '30s') RETURNING provider_ref`
    - 0 rows → 409 Conflict (another resume in-flight)
    - Lock released in `finally` block on completion/error/interrupt
    - Duplicate `resumeId` (same as `last_resume_id`) returns cached outcome without re-executing
    - **LangGraph Server:** Pass `multitask_strategy: 'reject'` to align server behavior with lock policy

12. **PROVIDER_REF_NEVER_PUBLIC**: `provider_ref` (threadId, sessionId) is stored in `execution_state_handles` but NEVER returned in API responses, logged, or exposed to UI. It's internal routing data only.

## Schema

### execution_state_handles Table

This is our routing index — not shared provider state. Required for unified provider contract.

| Column           | Type        | Notes                                                      |
| ---------------- | ----------- | ---------------------------------------------------------- |
| `id`             | uuid        | PK                                                         |
| `account_id`     | text        | NOT NULL (tenant scope)                                    |
| `state_key`      | text        | NOT NULL (Cogni-owned stable key)                          |
| `provider`       | text        | NOT NULL (`langgraph_inproc`, `langgraph_server`, etc.)    |
| `provider_ref`   | text        | NOT NULL (threadId, sessionId — encrypted, NEVER returned) |
| `status`         | text        | `active`, `completed`, `expired`                           |
| `resume_lock_id` | text        | Nullable (current lock holder's resumeId)                  |
| `resume_lock_at` | timestamptz | Nullable (when lock was acquired — expires after 30s)      |
| `last_resume_id` | text        | Nullable (last successfully processed resumeId)            |
| `cached_outcome` | jsonb       | Nullable (cached outcome for idempotent replay)            |
| `created_at`     | timestamptz |                                                            |
| `updated_at`     | timestamptz |                                                            |
| `expires_at`     | timestamptz | Nullable (for cleanup)                                     |

**Constraints:**

- `UNIQUE(account_id, state_key)` — one active state per tenant/key
- `provider_ref` encrypted at rest (standard column encryption)

**Atomic lock pattern (ONE_ACTIVE_RUN_PER_STATEKEY):**

```sql
-- Claim lock (atomic compare-and-swap)
UPDATE execution_state_handles
SET resume_lock_id = $resumeId,
    resume_lock_at = now(),
    updated_at = now()
WHERE account_id = $accountId
  AND state_key = $stateKey
  AND status = 'active'
  AND (resume_lock_at IS NULL OR resume_lock_at < now() - interval '30 seconds')
RETURNING provider, provider_ref;

-- 0 rows returned → 409 Conflict (another resume in-flight or state not active)

-- Release lock (in finally block)
UPDATE execution_state_handles
SET resume_lock_id = NULL,
    resume_lock_at = NULL,
    last_resume_id = $resumeId,
    cached_outcome = $outcome,
    status = CASE WHEN $completed THEN 'completed' ELSE status END,
    updated_at = now()
WHERE account_id = $accountId
  AND state_key = $stateKey
  AND resume_lock_id = $resumeId;
```

**Why 30s lock timeout?** Covers slow graph execution. If process crashes, lock auto-expires. Adjust based on observed P99 resume latency.

**Why store provider_ref?**

- LangGraph Server issues its own thread IDs (not deterministic from stateKey)
- Claude Agent SDK issues session IDs
- Deterministic UUIDv5 only works for controlled environments
- Storing enables unified resume contract across all providers

**Security:** `provider_ref` is NEVER returned in API responses, NEVER logged, NEVER exposed to UI. It's internal routing data only per PROVIDER_REF_NEVER_PUBLIC.

### Checkpointer Tables (auto-created by PostgresSaver)

- `checkpoints` — serialized graph state
- `checkpoint_writes` — pending writes
- `checkpoint_migrations` — schema version

## Design

### Key Decisions

#### 1. Pause/Resume Approaches

| Approach                  | Pros                            | Cons                             | Verdict            |
| ------------------------- | ------------------------------- | -------------------------------- | ------------------ |
| **Provider-native pause** | Native, checkpointed, resumable | Requires per-provider impl       | **Use this**       |
| Long-poll HTTP            | Simple                          | Blocks connection, doesn't scale | Reject             |
| WebSocket wait            | Real-time                       | Complex, no checkpointing        | Reject             |
| Queue + worker            | Durable                         | Overkill for P0                  | P2 if scale needed |

**Rule:** Each provider implements pause/resume via its native mechanism. Graph pauses at boundary; state saved to provider's persistence; HTTP returns immediately with interrupt status + `stateKey`.

#### 2. HIL Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ API: POST /api/v1/ai/chat                                           │
│ ─────────────────────────                                           │
│ 1. Parse request, generate runId                                    │
│ 2. Call graphExecutor.runGraph({ stateKey, ... })                   │
│ 3. Provider stores stateKey → provider_ref in execution_state_handles│
│ 4. Stream events to client                                          │
│ 5. On interrupt → return { status: 'needs_input', stateKey, interrupt }
│    (interrupt = { kind: string, data: unknown })                    │
│ 6. On completion → return { status: 'completed', ... }              │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (if needs_input)
┌─────────────────────────────────────────────────────────────────────┐
│ UI: Render by interrupt.kind                                         │
│ ─────────────────────────────                                        │
│ - Switch on kind to select renderer                                  │
│ - Cast data to graph-specific type                                   │
│ - Collect user response as resumeValue                               │
│ - Generate resumeId (UUID) for idempotency                           │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ API: POST /api/v1/ai/chat (with resume)                             │
│ ─────────────────────────────────────────                           │
│ 1. Validate resumeValue (JSON, max 64KB)                            │
│ 2. Check idempotency: if resumeId == last_resume_id → cached_outcome│
│ 3. Atomic lock claim (UPDATE...WHERE lock expired RETURNING ref)    │
│    └─ 0 rows → 409 Conflict (concurrent resume in-flight)           │
│ 4. graphExecutor.runGraph({ stateKey, resumeValue, ... })           │
│ 5. Provider resumes from persisted state with resumeValue           │
│ 6. finally: release lock, update last_resume_id, cache outcome      │
│ 7. Repeat until completed or rejected                               │
└─────────────────────────────────────────────────────────────────────┘
```

**Why stateKey?** Provider-internal references (threadId, sessionId) are never exposed. `stateKey` is Cogni-owned, human-friendly, and stable across provider swaps.

**Why resumeId?** Prevents duplicate actions on double-click/retry. Same `resumeId` returns cached outcome without re-executing.

#### 3. Interrupt Envelope (Minimal)

**ai-core defines only the envelope — graph packages own typed payloads:**

```typescript
// packages/ai-core/src/context/interrupt.ts

/**
 * Minimal interrupt envelope.
 * Graph packages define typed payloads; UI switches on `kind`.
 * ai-core does NOT define payload schemas (avoids UI coupling).
 */
export interface InterruptEnvelope {
  /** Interrupt type — UI switches on this to select renderer */
  readonly kind: string;
  /** Graph-defined payload — UI casts based on kind */
  readonly data: unknown;
}
```

**Graph packages define their own payload types:**

```typescript
// packages/langgraph-graphs/src/graphs/content-review/types.ts

/** Interrupt payload for content-review graph */
export interface ContentReviewInterrupt {
  readonly reason: string;
  readonly draft: {
    readonly id: string;
    readonly content: string;
  };
  readonly warnings: readonly string[];
  readonly suggestedActions: readonly {
    readonly id: string;
    readonly label: string;
    readonly action: "approve" | "revise" | "reject";
    readonly isPrimary?: boolean;
  }[];
}

/** Resume value expected by content-review graph */
export interface ContentReviewResume {
  readonly action: "approve" | "revise" | "reject";
  readonly feedback?: string;
  readonly editedContent?: string;
}
```

**UI renders by switching on `kind`:**

```typescript
// Example UI component
function InterruptRenderer({ interrupt }: { interrupt: InterruptEnvelope }) {
  switch (interrupt.kind) {
    case "content-review":
      return <ContentReviewUI data={interrupt.data as ContentReviewInterrupt} />;
    case "approval-gate":
      return <ApprovalGateUI data={interrupt.data as ApprovalGateInterrupt} />;
    default:
      return <GenericInterruptUI data={interrupt.data} />;
  }
}
```

**Why minimal envelope?**

- Prevents ai-core churn when adding new graph types
- Avoids coupling ai-core to UI concerns
- Each graph owns its payload contract
- UI remains graph-agnostic (switch on kind)

#### 4. Graph Structure (First HIL Graph)

```typescript
// packages/langgraph-graphs/src/graphs/content-review/graph.ts

import { StateGraph, interrupt, START, END } from "@langchain/langgraph";

const workflow = new StateGraph(ContentReviewState)
  .addNode("draft", draftNode) // Generate initial content
  .addNode("auto_check", autoCheckNode) // Automated validation
  .addNode("human_review", humanReviewNode) // interrupt() here
  .addNode("revise", reviseNode) // Apply feedback
  .addNode("finalize", finalizeNode) // Execute approved action

  .addEdge(START, "draft")
  .addEdge("draft", "auto_check")
  .addConditionalEdges("auto_check", routeAfterCheck, {
    pass: "human_review",
    fail: END, // Auto-reject on policy violation
  })
  .addConditionalEdges("human_review", routeAfterReview, {
    approve: "finalize",
    revise: "revise",
    reject: END,
  })
  .addEdge("revise", "auto_check") // Loop back for re-check
  .addEdge("finalize", END);

export const contentReviewGraph = workflow.compile();
```

**Key points:**

- `human_review` node calls `interrupt(payload)` to halt execution
- Decision arrives via state update on resume
- Revise loops back to auto_check (prevents infinite loops via max iteration check)
- Finalize only runs after explicit approval

#### 5. LangGraph Interrupt Mechanics

```typescript
// In human_review node
async function humanReviewNode(
  state: ContentReviewState,
  config: RunnableConfig
) {
  const payload: ContentReviewInterrupt = {
    reason: "Content ready for review",
    draft: { id: "draft-1", content: state.draftContent },
    warnings: state.autoCheckWarnings,
    suggestedActions: [
      {
        id: "approve",
        label: "Approve & Publish",
        action: "approve",
        isPrimary: true,
      },
      { id: "revise", label: "Request Changes", action: "revise" },
      { id: "reject", label: "Reject", action: "reject" },
    ],
  };

  // This halts execution and saves state to checkpointer
  const resumeValue = interrupt(payload);

  // Execution resumes here with resumeValue
  return { humanDecision: resumeValue };
}
```

**Adapter wraps as envelope:**

```typescript
// In LangGraphInProcProvider
if (interruptPayload) {
  const envelope: InterruptEnvelope = {
    kind: graphId.split(":")[1], // e.g., "content-review"
    data: interruptPayload,
  };
  // Return needs_input outcome with envelope
}
```

**Resume call:**

```typescript
await graph.invoke(new Command({ resume: resumeValue }), {
  configurable: { thread_id: threadId },
});
```

**LangGraph Server alignment:** When using LangGraph Server, pass `multitask_strategy: 'reject'` to ensure both layers (Cogni DB lock + LangGraph Server) reject concurrent runs on the same thread.

#### 6. Provider Resume Contract (Discriminated Union)

All providers implement resume via `GraphExecutorPort.runGraph()`. Result is a discriminated union — no optional fields that could become inconsistent.

```typescript
// src/ports/graph-executor.port.ts changes

export interface GraphRunRequest {
  // ... existing fields ...
  readonly resumeValue?: unknown;
  readonly resumeId?: string;
}

export type GraphRunOutcome =
  | GraphOutcomeCompleted
  | GraphOutcomeNeedsInput
  | GraphOutcomeError;

export interface GraphOutcomeCompleted {
  readonly status: "completed";
  readonly runId: string;
  readonly content?: string;
  readonly usage?: { promptTokens: number; completionTokens: number };
  readonly finishReason?: string;
}

export interface GraphOutcomeNeedsInput {
  readonly status: "needs_input";
  readonly runId: string;
  readonly stateKey: string;
  readonly interrupt: InterruptEnvelope;
}

export interface GraphOutcomeError {
  readonly status: "error";
  readonly runId: string;
  readonly error: AiExecutionErrorCode;
  readonly message?: string;
}
```

**Why discriminated union?**

- `status` as literal type enables exhaustive switch/match
- Each variant has exactly its fields — no `interruptPayload` on completed
- TypeScript compiler catches missing case handling

**Rule:** Providers translate `resumeValue` to native mechanism:

- LangGraph: `Command({ resume: resumeValue })`
- Claude Agent SDK: `options.resume = sessionId` with value in messages

#### 7. Checkpointer Configuration

```typescript
// src/adapters/server/ai/langgraph/checkpointer.ts

import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

let checkpointerInstance: PostgresSaver | null = null;

export async function getCheckpointer(): Promise<PostgresSaver> {
  if (!checkpointerInstance) {
    checkpointerInstance = PostgresSaver.fromConnString(
      env.LANGGRAPH_DATABASE_URL ?? env.DATABASE_URL
    );
    await checkpointerInstance.setup(); // Creates tables if needed
  }
  return checkpointerInstance;
}
```

**Why reuse DATABASE_URL?** P0 simplicity. May split to dedicated LangGraph DB if isolation needed.

### File Pointers

| File                                        | Purpose                                         |
| ------------------------------------------- | ----------------------------------------------- |
| `packages/ai-core/src/context/interrupt.ts` | `InterruptEnvelope` type (planned)              |
| `src/ports/graph-executor.port.ts`          | `GraphRunOutcome` discriminated union (planned) |
| `src/ports/execution-state.port.ts`         | `ExecutionStatePort` interface (planned)        |
| `src/shared/db/schema.execution-state.ts`   | `execution_state_handles` table (planned)       |

## Acceptance Checks

**Automated (planned):**

- Integration test: start → interrupt → resume(revise) → interrupt → resume(approve) → final
- Test: duplicate resumeId returns cached outcome (idempotency)
- Test: concurrent resume with different resumeId returns 409 (atomic lock)
- Test: stale lock (>30s) allows new resume to claim (lock expiry)

## Open Questions

(none)

## Related

- [Graph Execution](../../docs/GRAPH_EXECUTION.md) — GraphExecutorPort, billing, pump+fanout
- [LangGraph Server](./langgraph-server.md) — Thread ID derivation, stateKey semantics
- [LangGraph Patterns](./langgraph-patterns.md) — Graph patterns, compiled exports
- [Tool Use](./tool-use.md) — Tool execution (may be used in HIL graphs)
- [Usage History](./usage-history.md) — Artifact persistence (parallel to HIL state)
- [HIL Graphs Initiative](../../work/initiatives/ini.hil-graphs.md)
