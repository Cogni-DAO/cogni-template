---
id: langgraph-server-spec
type: spec
title: LangGraph Server Integration
status: draft
spec_state: draft
trust: draft
summary: Architecture and invariants for LangGraph Server integration — dev adapter, production adapter, billing, and thread management.
read_when: Working with LangGraph Server execution path, adapter contracts, or billing integration.
implements:
owner: derekg1729
created: 2026-02-07
verified:
tags: [ai-graphs, langgraph, infrastructure]
---

# LangGraph Server Integration

## Context

LangGraph graphs execute in an external LangGraph Server process. Next.js never imports graph modules. `LangGraphServerAdapter` implements `GraphExecutorPort`, translating server streams to `AiEvent` and emitting `UsageFact` for billing. LangGraph Server routes all LLM calls through LiteLLM proxy for unified billing/spend attribution.

## Goal

Define the adapter contracts, invariants, and infrastructure requirements for running LangGraph graphs via external server processes (dev, container, hosted) while maintaining unified billing and telemetry through `GraphExecutorPort`.

## Design

### Dev Adapter Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│ LANGGRAPH_DEV_URL not set (default)                                    │
│ ───────────────────────────────────                                    │
│ GraphExecutorPort → AggregatingGraphExecutor                           │
│   └─> LangGraphInProcProvider (providerId: "langgraph")                │
│                                                                        │
│ AgentCatalogPort → AggregatingAgentCatalog                             │
│   └─> LangGraphInProcAgentCatalogProvider (providerId: "langgraph")    │
├────────────────────────────────────────────────────────────────────────┤
│ LANGGRAPH_DEV_URL=http://localhost:2024                                │
│ ───────────────────────────────────────                                │
│ GraphExecutorPort → AggregatingGraphExecutor                           │
│   └─> LangGraphDevProvider (providerId: "langgraph")  ← SAME ID        │
│                                                                        │
│ AgentCatalogPort → AggregatingAgentCatalog                             │
│   └─> LangGraphDevAgentCatalogProvider (providerId: "langgraph")       │
└────────────────────────────────────────────────────────────────────────┘
```

**Key invariant:** `providerId = "langgraph"` for both InProc and Dev. GraphIds stay stable (`langgraph:poet`, `langgraph:ponderer`). Backend swaps via env, not graphId.

### Ports

| Port | Purpose                                        |
| ---- | ---------------------------------------------- |
| 2024 | `langgraph dev` (in-memory, local development) |
| 8123 | `langgraph up` / Docker (P1, production-like)  |

### Dev Environment Variables

| Variable            | Purpose                           | Default             |
| ------------------- | --------------------------------- | ------------------- |
| `LANGGRAPH_DEV_URL` | Enables dev server execution path | unset (uses InProc) |

### Dev Adapter Invariants

1. **STABLE_GRAPH_IDS**: GraphIds are `langgraph:{graphName}` regardless of backend (InProc or Dev)
2. **MUTUAL_EXCLUSION**: Register exactly one `langgraph` provider per aggregator (InProc XOR Dev)
3. **THREAD_KEY_REQUIRED**: `stateKey` is required; derive `threadId` deterministically from `(billingAccountId, stateKey)`. Always send only new user input; server owns thread state. Tools work per-run.
4. **SDK_CHUNK_SHAPE**: SDK stream uses `chunk.event` + `chunk.data` (not `event.type`)
5. **CATALOG_MANUAL_SYNC_P0**: `LANGGRAPH_CATALOG` and `langgraph.json` manually synced in MVP
6. **DUAL_RUN_IDS**: Our `runId` (billing/trace) is distinct from LangGraph `run_id` (reconnection/resume). Capture LangGraph `run_id` from the `metadata` stream event if `joinStream`/`lastEventId` reconnection is needed.

### Dev Adapter File Pointers

| File                                                             | Purpose                                           |
| ---------------------------------------------------------------- | ------------------------------------------------- |
| `src/adapters/server/ai/langgraph/dev/provider.ts`               | `LangGraphDevProvider` (execution)                |
| `src/adapters/server/ai/langgraph/dev/agent-catalog.provider.ts` | `LangGraphDevAgentCatalogProvider` (discovery)    |
| `src/adapters/server/ai/langgraph/dev/client.ts`                 | SDK client factory                                |
| `src/adapters/server/ai/langgraph/dev/thread.ts`                 | UUIDv5 thread derivation                          |
| `src/adapters/server/ai/langgraph/dev/stream-translator.ts`      | SDK → AiEvent translation                         |
| `src/adapters/server/ai/langgraph/dev/stream-accumulator.ts`     | Message accumulation by ID, tool event extraction |
| `packages/langgraph-graphs/langgraph.json`                       | Graph registration for dev server                 |
| `src/bootstrap/graph-executor.factory.ts`                        | Env-based provider selection                      |
| `src/bootstrap/agent-discovery.ts`                               | Env-based provider selection                      |

### Architecture Boundaries

One canonical way to run LangGraph graphs (dev, container, hosted) such that:

- Next.js talks to LangGraph via `LangGraphServerAdapter` (`GraphExecutorPort`)
- LangGraph talks to providers via LiteLLM using per-user credentials
- Streaming is translated into ai-core `AiEvent` consistently (no bespoke SSE parsing)

### Package Ownership

| Path                                                | Purpose                                                                              | Rule                           |
| --------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------ |
| `packages/langgraph-server/`                        | Node.js service code (HTTP API, tenant scoping, LiteLLM wiring, event normalization) | Dockerfile builds/runs this    |
| `packages/langgraph-graphs/`                        | Feature-sliced graph definitions + prompts                                           | Next.js must NEVER import this |
| `packages/ai-core/`                                 | Executor-agnostic primitives (AiEvent, UsageFact, tool schemas)                      | No graph definitions here      |
| `platform/infra/services/runtime/langgraph-server/` | Docker packaging (Dockerfile, compose config, env)                                   | No TS logic here               |

### Non-Goals (P0)

- No LangGraph-specific types leaking into ai-core
- No raw HTTP/SSE parsing in the app
- No hardcoded model or provider credentials inside graphs

---

## Core Invariants

### Execution + Transport

1. **OFFICIAL_SDK_ONLY**: Next.js → LangGraph Server must use `@langchain/langgraph-sdk` (`Client.runs.stream(...)`) and not parse SSE manually.

2. **UNIFIED_EXECUTION_PORT**: All graph execution flows through `GraphExecutorPort.runGraph()`. No "special" code paths for server graphs.

3. **STREAMING_IS_EVENT_LEVEL**: Route returns HTTP 200 immediately for SSE; failures mid-stream propagate as `AiEvent:error` + `final.ok=false`. (This is normal streaming behavior.)

4. **RUNTIME_IS_EXTERNAL**: Next.js does not import or execute LangGraph graph modules. It calls LangGraph Server via `LangGraphServerAdapter`. Graph definitions live in `packages/langgraph-graphs/`; service code in `packages/langgraph-server/`.

5. **UNIFIED_EXECUTOR_PRESERVED**: All AI execution still flows through `GraphExecutorPort`. The adapter choice (`LangGraphServerAdapter` vs `InProcAdapter` vs `ClaudeSdkAdapter`) is an implementation detail behind the unified interface.

### Threads + State

6. **THREAD_ID_TENANT_SCOPED**: For stateful runs, thread identity is derived server-side as UUIDv5:

   ```
   thread_id = uuidv5("${billingAccountId}:${stateKey}", COGNI_THREAD_NAMESPACE)
   ```

   Per LangGraph API: `thread_id` must be UUID format. Never accept raw `thread_id` from the client. LangGraph persistence is keyed on `thread_id`—this is the privacy boundary. See `src/adapters/server/ai/langgraph/dev/thread.ts`.

7. **THREAD_MUST_EXIST_IF_THREAD_ID_IS_STRING**: If you pass a string `threadId` to `runs.stream()`, you must ensure the thread exists first (idempotently). Use the SDK thread create with "do nothing if exists".

8. **P0_THREAD_POLICY**: P0 supports stateful threads (because your product needs multi-turn).
   - If `stateKey` is present → reuse thread
   - Else fallback to a deterministic key for "ephemeral" (not runId unless you explicitly want "each run is a new thread")
   - If you really want stateless P0: `runs.stream(null, ...)` exists. That's valid, but it deliberately drops conversation continuity.

9. **LANGGRAPH_IS_CANONICAL_STATE**: For `langgraph_server` executor, LangGraph Server owns canonical thread state/checkpoints. Any local `run_artifacts` are cache only—never reconstruct conversation from them. When `stateKey` provided, send only new user input (server has prior context).

### Billing + Per-User Credentials

10. **PER_USER_CREDENTIALS_REQUIRED**: LangGraph graphs must not use a global `LITELLM_API_KEY` that represents a "master" key. They must use the user's virtual key (or another per-tenant credential) provided at runtime.

11. **BILLING_METADATA_FORWARDING**: Every run forwards billing attribution to LiteLLM via runtime config (at minimum):
    - `billingAccountId`
    - `virtualKeyId` (or the virtual key token)
    - `runId`, `attempt`
    - `ingressRequestId`
    - `traceId`
      This metadata must be present for both in-proc and server execution paths.

12. **USAGE_IS_SUMMED_ACROSS_RUN**: Usage tokens/cost must be aggregated across all steps in a graph run (ReAct loops, tool calls). Never "last event wins".

13. **EXECUTOR_TYPE_REQUIRED**: `UsageFact.executorType` is required. All billing/history logic must be executor-agnostic.

14. **LLM_VIA_LITELLM**: LangGraph Server calls LiteLLM (not providers directly). Single service key (`LITELLM_API_KEY`). Spend attribution via metadata headers enables per-tenant/per-run analytics.

15. **MODEL_ALLOWLIST_SERVER_SIDE**: Model selection is server-side only. Next.js selects from allowlist; langgraph-server rejects unknown models.

16. **MODEL_ALLOWLIST_LITELLM_CANONICAL**: LiteLLM `/model/info` is the canonical model allowlist. Next.js caches via SWR; langgraph-server validates against same source. No split-brain.

17. **BILLING_VIA_END_USER_RECONCILIATION**: Billing uses async reconciliation via `end_user` correlation. Provider sets `configurable.user = ${runId}/${attempt}` server-side; reconciler queries `GET /spend/logs?end_user=...` and calls `commitUsageFact()` per entry. See [External Executor Billing spec](./external-executor-billing.md).

18. **CONFIGURABLE_USER_SERVER_SET**: `initChatModel` must include `"user"` in `configurableFields`. Provider overwrites any client-supplied value with `${runId}/${attempt}`. Never trust client configurable for billing.

19. **USAGE_REPORT_IS_UX_ONLY**: Stream `usage_report` events are telemetry hints for UI. Authoritative billing flows through reconciliation only. Never fail user response due to missing billing data.

**Billing via Reconciliation (Validated):**

| Step | Component   | Action                                               |
| ---- | ----------- | ---------------------------------------------------- |
| 1    | `server.ts` | `configurableFields: ["model", "user"]`              |
| 2    | Provider    | `configurable.user = ${runId}/${attempt}`            |
| 3    | LiteLLM     | Stores as `end_user` in spend_logs                   |
| 4    | Reconciler  | `GET /spend/logs?end_user=...` → `commitUsageFact()` |

### Type Translation

19. **AI_CORE_IS_CANONICAL_OUTPUT**: The adapter emits only ai-core events (P0):
    - `text_delta` (stream)
    - `usage_report`
    - `done`
    - `error`
      Nothing LangGraph-specific crosses the adapter boundary.

20. **NO_NEXT_IMPORT_GRAPHS**: Next.js (`src/**`) must never import from `packages/langgraph-graphs/`. Enforced by dependency-cruiser.

21. **PACKAGES_NO_SRC_IMPORTS**: `packages/**` must never import from `src/**`. Shared contracts flow from packages → src, not reverse. Enforced by dependency-cruiser.

22. **SINGLE_SOURCE_OF_TRUTH**: `AiEvent`, `UsageFact`, `ExecutorType`, `RunContext` are defined ONLY in `packages/ai-core/`. `src/types/` files re-export for convenience. Enforced by grep test.

### Current Scope Boundaries

23. **NO_GDPR_DELETE_YET**: Current implementation does not provide compliant user data deletion. LangGraph checkpoint deletion tracked in [ini.langgraph-server-production](../../work/initiatives/ini.langgraph-server-production.md).

24. **DEV_TOOL_EVENT_STREAMING**: Dev adapter emits `tool_call_start`/`tool_call_result` events with chunk buffering. Accumulates `tool_call_chunks` by `(messageId, index)` until parseable. Buffer caps: 64KB args, 100 pending results.

---

## Required Interfaces

### GraphRunRequest (minimum)

- `runId`, `attempt`, `ingressRequestId`, `caller` (billingAccountId, virtualKeyId, traceId)
- `messages[]`, `model`, `graphName?`
- `stateKey?` (server-derived; never client-supplied)

### GraphRunResult

```typescript
interface GraphRunResult {
  stream: AsyncIterable<AiEvent>;
  final: Promise<GraphFinal>;
}
```

---

## Adapter Contract (LangGraphServerAdapter)

### Must use SDK streaming (no fetch/SSE parsing)

Use `Client.runs.stream(...)` (supports `threadId` string or null).

### Thread lifecycle (stateful P0)

Before streaming a run with a string `threadId`:

```typescript
await client.threads.create({
  thread_id: ctx.threadId,
  if_exists: "do_nothing",
});
client.runs.stream(ctx.threadId, assistantId, payload);
```

This is not a "hacky fallback"; it's the correct lifecycle when you control deterministic thread IDs.

### Stream mode

Use a stream mode that yields incremental assistant output (you previously used "messages-tuple"; keep the choice consistent for in-proc + server).

### Translation rules (P0)

- Convert streamed assistant text → `AiEvent:text_delta`
- Capture/aggregate usage fields if present → sum
- On completion → emit `usage_report`, then `done`
- On any error → emit `error` and finalize with `ok:false`

---

## Graph Requirements (in packages/langgraph-graphs/)

**Absolute rule:** No module-level LLM instantiation with hardcoded auth/model

If the graph creates an LLM at module load time (top-level `new ChatOpenAI({ model: "...", Authorization: Bearer MASTER_KEY })`), you will:

- Ignore runtime model selection
- Break per-user virtual key routing
- Mis-attribute or fail billing

**Correct pattern:** Create the LLM per request using `runtime config.configurable` (or equivalent) so the adapter can pass:

- `model`
- Per-user virtual key credential
- `litellm_metadata`

In other words: graphs are parameterized by runtime config, not `.env` alone.

---

## Service API Contract

### Run endpoint: `POST /runs`

```typescript
// Request (Next.js → langgraph-service)
interface LangGraphRunRequest {
  accountId: string; // Tenant ID for thread_id derivation
  runId: string; // Unique run ID (Next.js generates)
  stateKey?: string; // Optional thread key for continuation
  model: string; // LiteLLM alias (from allowlist)
  messages: Array<{ role: string; content: string }>;
  requestId: string; // Correlation ID
  traceId: string; // Distributed trace ID
}

// Response: SSE stream
// event: text_delta
// data: {"delta": "Hello"}
//
// event: usage_report (emitted at completion per USAGE_EMIT_ON_FINAL_ONLY)
// data: {
//   "usageUnitId": "gen-abc123",      // from LiteLLM response.id (null if unavailable)
//   "model": "openrouter/anthropic/claude-3.5-sonnet",
//   "inputTokens": 150,
//   "outputTokens": 42,
//   "costUsd": 0.00123                // from x-litellm-response-cost (null → unbilled)
// }
//
// event: done
// data: {}
```

### Health endpoint: `GET /health` → `200 OK`

### Thread ID derivation (inside service)

```typescript
const threadId = `${request.accountId}:${request.stateKey ?? request.runId}`;
```

### Config Surface (Environment Variables)

### Next.js runtime

| Variable                   | Purpose                          |
| -------------------------- | -------------------------------- |
| `LANGGRAPH_SERVER_URL`     | Enables server executor          |
| `LANGGRAPH_SERVER_API_KEY` | Optional (if hosted requires it) |

(existing) LiteLLM routing config for in-proc executor

### LangGraph server runtime (container/hosted)

| Variable           | Purpose                                       |
| ------------------ | --------------------------------------------- |
| `REDIS_URL`        | Required by checkpointer for persistent state |
| `LITELLM_BASE_URL` | LiteLLM endpoint for LLM calls                |

(NO master key if you're doing per-user keys; if you still need one for fallback, lock it behind explicit "system tenant" rules)

---

## Docker Compose Requirements

**Service definition** (add to `docker-compose.dev.yml`):

```yaml
langgraph-server:
  build:
    context: ../../../..
    dockerfile: platform/infra/services/runtime/langgraph-server/Dockerfile
  container_name: langgraph-server
  restart: unless-stopped
  networks:
    - cogni-edge
  environment:
    - LITELLM_BASE_URL=http://litellm:4000
    - LITELLM_API_KEY=${LITELLM_MASTER_KEY}
    - LANGGRAPH_DATABASE_URL=postgresql://${POSTGRES_USER:-user}:${POSTGRES_PASSWORD:-password}@postgres:5432/langgraph_dev
  depends_on:
    postgres:
      condition: service_healthy
    litellm:
      condition: service_healthy
  healthcheck:
    test: ["CMD", "curl", "-f", "http://127.0.0.1:8000/health"]
    interval: 10s
    timeout: 3s
    retries: 3
    start_period: 30s
```

**Dockerfile location:** `platform/infra/services/runtime/langgraph-server/Dockerfile` builds `packages/langgraph-server/`.

**Networking:** Uses docker DNS names `litellm` and `postgres` directly.

### Schema

**Already implemented:**

- `UsageFact.executorType` required field (see `packages/ai-core/src/usage/usage.ts`)
- `ExecutorType = "langgraph_server" | "claude_sdk" | "inproc"`
- `langgraph_server` uses `source: "litellm"` (LLM calls route through LiteLLM); `executorType: "langgraph_server"` distinguishes the executor

---

## Design Decisions

### 1. Adapter Selection

| Executor Type      | Adapter                       | Use Case                         |
| ------------------ | ----------------------------- | -------------------------------- |
| `langgraph_server` | `LangGraphServerAdapter`      | LangGraph graphs (canonical)     |
| `claude_sdk`       | `ClaudeSdkAdapter`            | Claude Agents SDK (P2)           |
| `inproc`           | `InProcCompletionUnitAdapter` | Direct LLM completion (fallback) |

**Rule:** Config-driven selection in P0. `graphName` maps to adapter + assistant ID.

### 2. Thread ID Derivation

Per LangGraph API: `thread_id` must be `string<uuid>` format. Use UUIDv5 for deterministic derivation.

**Implementation:** `src/adapters/server/ai/langgraph/dev/thread.ts`

**Derivation:** `uuidv5("${billingAccountId}:${stateKey}", COGNI_THREAD_NAMESPACE)`

**Why UUIDv5?** LangGraph API requires UUID format. Deterministic derivation ensures same thread across restarts.

**Why tenant-prefixed input?** LangGraph checkpoints contain real state/PII. Thread ID is the isolation boundary. Without tenant prefix, a malicious client could access another tenant's thread.

### 3. What LangGraph Server Provides (Don't Rebuild)

| Capability               | LangGraph Server | Local Build?  |
| ------------------------ | ---------------- | ------------- |
| Thread state/checkpoints | ✓                | No            |
| Run persistence          | ✓                | No            |
| Tool call history        | ✓                | No (cache OK) |
| Resume/time-travel       | ✓                | No            |

**Rule:** Use LangGraph Server's native capabilities. `run_artifacts` is optional cache for activity feed only.

### 4. Graph Code Boundary

**Before (invalid):**

```
src/features/ai/graphs/chat.graph.ts  ← Next.js could import this
```

**After (valid):**

```
packages/langgraph-graphs/graphs/chat/chat.graph.ts  ← Isolated package
packages/langgraph-server/                           ← Service that imports graphs
```

**Why?** Prevents:

- Accidental Next.js imports (enforced by dependency-cruiser)
- Runtime coupling
- tsconfig/bundling conflicts
- Edge deployment incompatibilities

**Enforcement:** dependency-cruiser rule blocks `src/**` → `packages/langgraph-graphs/**` imports.

---

## Acceptance Checks

**Manual:**

1. `pnpm langgraph:dev` starts and `/assistants/.../schemas` resolves
2. Next.js with `LANGGRAPH_SERVER_URL` set can stream a response
3. Adapter emits `text_delta*` → `usage_report` → `done` in that order
4. Graph uses runtime config for model + per-user credential (no hardcode)
5. LiteLLM receives `litellm_metadata` and bills the correct tenant
6. Container mode (`langgraph:up`) persists state via Redis (multi-turn thread continuity)

---

## Anti-Patterns

1. **No graph imports in Next.js** — All graph code in `packages/langgraph-graphs/`; enforced by dependency-cruiser
2. **No raw thread_id from client** — Always derive server-side with tenant prefix
3. **No rebuild of LangGraph Server capabilities** — Use checkpoints/threads/runs as-is
4. **No executor-specific billing logic** — UsageFact is normalized; adapters translate
5. **No P0 deletion guarantees** — Document explicitly; implement in P1
6. **No TS logic in platform/** — `platform/infra/services/runtime/langgraph-server/` contains Docker packaging only
7. **No custom SSE event vocabulary** — Route maps AiEvents to Data Stream Protocol via official helper
8. **No protocol encoding in runtime** — Runtime emits AiEvents only; route handles wire protocol

---

## Non-Goals

- Graph patterns and package structure — see [LangGraph Patterns spec](./langgraph-patterns.md)
- Executor-agnostic billing and tracking — see [GRAPH_EXECUTION.md](../GRAPH_EXECUTION.md)
- Step-by-step setup instructions — see [LangGraph Server Setup guide](../guides/langgraph-server.md)

## Open Questions

_(none)_

## Related

- [LangGraph Patterns spec](./langgraph-patterns.md) — Package structure, InProc execution, anti-patterns
- [LangGraph Server Setup guide](../guides/langgraph-server.md) — Dev, container, and hosted setup steps
- [GRAPH_EXECUTION.md](../GRAPH_EXECUTION.md) — Billing idempotency, pump+fanout
- [Usage History spec](./usage-history.md) — Artifact caching (executor-agnostic)
- [AI Setup spec](./ai-setup.md) — Correlation IDs, telemetry
- [External Executor Billing spec](./external-executor-billing.md) — Reconciliation pattern
- [Initiative: LangGraph Server Production](../../work/initiatives/ini.langgraph-server-production.md) — Roadmap for production deployment + billing parity
