# LangGraph Server Integration

> [!CRITICAL]
> LangGraph graphs execute in an external LangGraph Server process. Next.js never imports graph modules. `LangGraphServerAdapter` implements `GraphExecutorPort`, translating server streams to `AiEvent` and emitting `UsageFact` for billing.

## Core Invariants

1. **RUNTIME_IS_EXTERNAL**: Next.js does not import or execute LangGraph graph modules. It calls LangGraph Server via `LangGraphServerAdapter`. Graph code lives in `apps/langgraph-service/`.

2. **UNIFIED_EXECUTOR_PRESERVED**: All AI execution still flows through `GraphExecutorPort`. The adapter choice (`LangGraphServerAdapter` vs `InProcAdapter` vs `ClaudeSdkAdapter`) is an implementation detail behind the unified interface.

3. **THREAD_ID_TENANT_SCOPED**: `thread_id` is always derived server-side as `${accountId}:${threadKey}` (or `${accountId}:${runId}` fallback). Never accept raw `thread_id` from client. LangGraph persistence is keyed on `thread_id`—this is the privacy boundary.

4. **EXECUTOR_TYPE_REQUIRED**: `UsageFact.executorType` is required. All billing/history logic must be executor-agnostic.

5. **LANGGRAPH_IS_CANONICAL_STATE**: For `langgraph_server` executor, LangGraph Server owns canonical thread state/checkpoints. Any local `run_artifacts` are cache only—never reconstruct conversation from them.

6. **P0_NO_GDPR_DELETE**: P0 does NOT provide compliant user data deletion. LangGraph checkpoint deletion is a P1 requirement. Document this explicitly.

7. **P0_NO_TOOL_EVENT_STREAMING**: For `langgraph_server` in P0, tool execution happens entirely within LangGraph Server. Adapter emits `text_delta`, `assistant_final`, `usage_report`, `done` only—no `tool_call_start`/`tool_call_result` events. Tool event streaming is `inproc` executor only until P1.

---

## Implementation Checklist

### P0: LangGraph Server MVP

Deploy LangGraph Server; implement adapter; preserve unified billing.

#### Service Setup

- [ ] Create `apps/langgraph-service/` directory structure
- [ ] Configure LangGraph Server with Postgres checkpointer
- [ ] Add `LANGGRAPH_SERVICE_URL` to env config
- [ ] Add `AI_LANGGRAPH_ASSISTANT_ID_CHAT` for hardcoded graph selection
- [ ] Create Dockerfile for langgraph-service

#### Adapter Implementation

- [ ] Create `LangGraphServerAdapter` implementing `GraphExecutorPort`
- [ ] Implement `thread_id` derivation: `${accountId}:${threadKey || runId}`
- [ ] Translate LangGraph Server stream → `AiEvent` (text_delta, done)
- [ ] Emit `assistant_final` event from server's final message
- [ ] Emit `usage_report` with `executorType: 'langgraph_server'`
- [ ] Handle connection errors gracefully (emit `ErrorEvent`)

#### Graph Definition Migration

- [ ] Move graph definitions from `src/features/ai/graphs/` to `apps/langgraph-service/src/graphs/`
- [ ] Preserve feature-slice organization within langgraph-service
- [ ] Remove graph imports from Next.js codebase

#### Billing Integration

- [ ] Add `executorType` to `UsageFact` interface (required field)
- [ ] Update `commitUsageFact()` to handle langgraph_server source
- [ ] Add `'langgraph_server'` to `SOURCE_SYSTEMS` enum
- [ ] Stack test: LangGraph run emits usage_report, billing records charge

#### Chores

- [ ] Observability instrumentation [observability.md](../.agent/workflows/observability.md)
- [ ] Documentation updates [document.md](../.agent/workflows/document.md)

### P1: Checkpoint Deletion (Compliance)

- [ ] Implement deletion for LangGraph checkpoint tables by tenant-scoped thread_id prefix
- [ ] Coordinate artifact + checkpoint deletion for user data requests
- [ ] Add stack test: delete user data → checkpoints removed

### P2: Claude Agents SDK Adapter

- [ ] Create `ClaudeSdkAdapter` implementing `GraphExecutorPort`
- [ ] Translate Claude SDK events → AiEvents
- [ ] Emit `usage_report` with `executorType: 'claude_sdk'`
- [ ] **Do NOT build preemptively**

---

## File Pointers (P0 Scope)

| File                                                 | Change                                                       |
| ---------------------------------------------------- | ------------------------------------------------------------ |
| `apps/langgraph-service/`                            | New: LangGraph Server deployment directory                   |
| `apps/langgraph-service/src/graphs/chat.graph.ts`    | Move from src/features/ai/graphs/                            |
| `src/adapters/server/ai/langgraph-server.adapter.ts` | New: `LangGraphServerAdapter` implementing GraphExecutorPort |
| `src/types/usage.ts`                                 | Add `executorType` required field to `UsageFact`             |
| `src/types/billing.ts`                               | Add `'langgraph_server'` to `SOURCE_SYSTEMS`                 |
| `src/bootstrap/graph-executor.factory.ts`            | Add LangGraphServerAdapter selection logic                   |
| `src/features/ai/services/ai_runtime.ts`             | Add thread_id derivation (tenant-scoped)                     |
| `src/ports/graph-executor.port.ts`                   | Add `threadId?: string` to `GraphRunRequest`                 |

---

## Schema

No new tables in P0. Changes to existing types only:

**UsageFact type** (src/types/usage.ts):

```typescript
export interface UsageFact {
  // ... existing fields ...

  /** Executor type for cross-executor billing (required) */
  readonly executorType: ExecutorType;
}

export type ExecutorType = "langgraph_server" | "claude_sdk" | "inproc";
```

**Optional metadata storage** (run_artifacts.metadata):

```typescript
// P0: Store executorType in metadata, defer column migration
{
  executorType: 'langgraph_server',
  // ... other metadata
}
```

---

## Design Decisions

### 1. Adapter Selection

| Executor Type      | Adapter                      | Use Case                         |
| ------------------ | ---------------------------- | -------------------------------- |
| `langgraph_server` | `LangGraphServerAdapter`     | LangGraph graphs (canonical)     |
| `claude_sdk`       | `ClaudeSdkAdapter`           | Claude Agents SDK (P2)           |
| `inproc`           | `InProcGraphExecutorAdapter` | Direct LLM completion (fallback) |

**Rule:** Config-driven selection in P0. `graphName` maps to adapter + assistant ID.

---

### 2. Thread ID Derivation

```typescript
// In ai_runtime.ts
function deriveThreadId(
  accountId: string,
  threadKey?: string,
  runId?: string
): string {
  const key = threadKey ?? runId;
  if (!key) throw new Error("threadKey or runId required");
  return `${accountId}:${key}`;
}
```

**Why tenant-prefixed?** LangGraph checkpoints contain real state/PII. Thread ID is the isolation boundary. Without prefix, a malicious client could access another tenant's thread.

---

### 3. Execution Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ ROUTE (src/app/api/v1/ai/chat/route.ts)                             │
│ - Calls ai_runtime.runChatStream()                                  │
│ - Receives AiEvents, maps to Data Stream Protocol                   │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ AI RUNTIME (src/features/ai/services/ai_runtime.ts)                 │
│ - Generates runId                                                   │
│ - Derives tenant-scoped thread_id                                   │
│ - Selects adapter via GraphExecutorPort                             │
│ - RunEventRelay: pump+fanout (billing independent of client)        │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ GRAPH EXECUTOR PORT (unified interface)                             │
│ - runGraph() returns { stream, final }                              │
│ - Adapter selected by config/registry                               │
└─────────────────────────────────────────────────────────────────────┘
                              │
            ┌─────────────────┼─────────────────┐
            ▼                 ▼                 ▼
┌───────────────────┐ ┌───────────────┐ ┌───────────────────┐
│ LangGraphServer   │ │ InProc        │ │ ClaudeSdk         │
│ Adapter           │ │ Adapter       │ │ Adapter (P2)      │
│ ─────────────     │ │ ─────         │ │ ───────           │
│ Calls external    │ │ Wraps         │ │ Calls Anthropic   │
│ LangGraph Server  │ │ completion.ts │ │ SDK directly      │
│ via HTTP/WS       │ │               │ │                   │
└───────────────────┘ └───────────────┘ └───────────────────┘
            │                 │                 │
            └─────────────────┼─────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ ALL ADAPTERS EMIT:                                                  │
│ - AiEvents (text_delta, assistant_final, done, error)               │
│ - usage_report with UsageFact (executorType required)               │
└─────────────────────────────────────────────────────────────────────┘
```

---

### 4. What LangGraph Server Provides (Don't Rebuild)

| Capability               | LangGraph Server | Local Build?  |
| ------------------------ | ---------------- | ------------- |
| Thread state/checkpoints | ✓                | No            |
| Run persistence          | ✓                | No            |
| Tool call history        | ✓                | No (cache OK) |
| Resume/time-travel       | ✓                | No            |

**Rule:** Use LangGraph Server's native capabilities. `run_artifacts` is optional cache for activity feed only.

---

### 5. Graph Code Boundary

**Before (invalid):**

```
src/features/ai/graphs/chat.graph.ts  ← Next.js could import this
```

**After (valid):**

```
apps/langgraph-service/src/graphs/chat.graph.ts  ← Isolated process
```

**Why?** Prevents:

- Accidental Next.js imports
- Runtime coupling
- tsconfig/bundling conflicts
- Edge deployment incompatibilities

---

## Anti-Patterns

1. **No graph imports in Next.js** — All graph code in apps/langgraph-service/
2. **No raw thread_id from client** — Always derive server-side with tenant prefix
3. **No rebuild of LangGraph Server capabilities** — Use checkpoints/threads/runs as-is
4. **No executor-specific billing logic** — UsageFact is normalized; adapters translate
5. **No P0 deletion guarantees** — Document explicitly; implement in P1

---

## Related Docs

- [LANGGRAPH_AI.md](LANGGRAPH_AI.md) — Graph patterns (to be updated for external runtime)
- [GRAPH_EXECUTION.md](GRAPH_EXECUTION.md) — Billing idempotency, pump+fanout
- [USAGE_HISTORY.md](USAGE_HISTORY.md) — Artifact caching (executor-agnostic)
- [AI_SETUP_SPEC.md](AI_SETUP_SPEC.md) — Correlation IDs, telemetry

---

**Last Updated**: 2025-12-22
**Status**: Draft (P0 Design)
