# LangGraph Server Integration

> [!CRITICAL]
> LangGraph graphs execute in an external LangGraph Server process. Next.js never imports graph modules. `LangGraphServerAdapter` implements `GraphExecutorPort`, translating server streams to `AiEvent` and emitting `UsageFact` for billing. **LangGraph Server routes ALL LLM calls through LiteLLM proxy for unified billing/spend attribution.**

## Architecture Boundaries

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

6. **THREAD_ID_TENANT_SCOPED**: For stateful runs, thread identity is derived server-side:

   ```
   thread_id = uuidv5("${billingAccountId}:${threadKey}", COGNI_THREAD_NAMESPACE)
   ```

   Never accept raw `thread_id` from the client. LangGraph persistence is keyed on `thread_id`—this is the privacy boundary.

7. **THREAD_MUST_EXIST_IF_THREAD_ID_IS_STRING**: If you pass a string `threadId` to `runs.stream()`, you must ensure the thread exists first (idempotently). Use the SDK thread create with "do nothing if exists".

8. **P0_THREAD_POLICY**: P0 supports stateful threads (because your product needs multi-turn).
   - If `threadKey` is present → reuse thread
   - Else fallback to a deterministic key for "ephemeral" (not runId unless you explicitly want "each run is a new thread")
   - If you really want stateless P0: `runs.stream(null, ...)` exists. That's valid, but it deliberately drops conversation continuity.

9. **LANGGRAPH_IS_CANONICAL_STATE**: For `langgraph_server` executor, LangGraph Server owns canonical thread state/checkpoints. Any local `run_artifacts` are cache only—never reconstruct conversation from them.

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

17. **USAGE_SOURCE_RESPONSE_HEADERS**: P0 usage data comes from LiteLLM response headers (`x-litellm-response-cost`) and body (`id`, `usage`), NOT spend_logs polling. Spend logs are for activity dashboard only.

18. **USAGE_EMIT_ON_FINAL_ONLY**: For `langgraph_server`, emit `usage_report` only at completion (after final LLM response). If usage/cost unavailable, complete UI response but emit `billing_failed` metric and mark run unbilled for reconciliation. Never fail user-visible response due to missing billing data.

**Billing Contract Divergence (P0 Known Issue):**

| Field                       | InProc | Server | Notes                              |
| --------------------------- | ------ | ------ | ---------------------------------- |
| usageUnitId (litellmCallId) | Yes    | No     | Requires `x-litellm-call-id`       |
| costUsd                     | Yes    | No     | Requires `x-litellm-response-cost` |
| model (resolved)            | Yes    | No     | Requires resolved model from proxy |
| inputTokens / outputTokens  | Yes    | Yes    | Available from response body       |

**P0 decision:** Server path is internal/experimental only. Cannot be customer-billable until billing parity achieved.

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

### P0 Explicit Non-Goals

23. **P0_NO_GDPR_DELETE**: P0 does NOT provide compliant user data deletion. LangGraph checkpoint deletion is a P1 requirement. Document this explicitly.

24. **P0_NO_TOOL_EVENT_STREAMING**: For `langgraph_server` in P0, tool execution happens entirely within LangGraph Server. Adapter emits `text_delta`, `assistant_final`, `usage_report`, `done` only—no `tool_call_start`/`tool_call_result` events. Tool event streaming is `inproc` executor only until P1.

---

## Required Interfaces

### GraphRunRequest (minimum)

- `runId`, `attempt`, `ingressRequestId`, `caller` (billingAccountId, virtualKeyId, traceId)
- `messages[]`, `model`, `graphName?`
- `threadKey?` (server-derived; never client-supplied)

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
  threadKey?: string; // Optional thread key for continuation
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
const threadId = `${request.accountId}:${request.threadKey ?? request.runId}`;
```

---

## Environment + Scripts

### A) Local dev (fast iteration)

**Command:** `pnpm langgraph:dev`

**Behavior:** Runs LangGraph server in dev mode for local graph iteration. Dev mode may be in-memory for checkpoints; do not rely on that behavior in production tests.

### B) Container build + run (production-like)

**Commands:**

- `pnpm langgraph:build` (build image or dist)
- `pnpm langgraph:up` (bring up langgraph-server + redis via compose)

**Requirement:** `docker compose up` must start:

- `langgraph-server` container
- `redis` (required for persistent checkpointer/state in container mode)

### C) Hosted LangGraph (LangSmith / managed)

**Requirement:** Set `LANGGRAPH_SERVER_URL=<hosted endpoint>` in Next.js runtime.
**Optional:** `LANGGRAPH_SERVER_API_KEY` (if hosted requires it) passed into SDK `Client(...)`.

---

## Config Surface (Environment Variables)

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

**Not in MVP:** per-user virtual keys, mTLS/JWT service auth, tool-call streaming.

---

## Implementation Checklist

### P0: LangGraph Server MVP

Deploy LangGraph Server; wire to LiteLLM; implement adapter; preserve unified billing.

**Dependency order:** Shared Contracts → Package Scaffold → Container → Postgres → LiteLLM → Graph → Adapter → Tests

#### Step 1: Shared Contracts Extraction (CRITICAL)

Extract cross-process types to `packages/ai-core/` so `packages/langgraph-server/` can import them.

**Extraction order** (reverse dependency): `SourceSystem` → `UsageFact`/`ExecutorType` → `AiEvent` → `RunContext`

- [ ] Create `packages/ai-core/` with pnpm workspace config
- [ ] Move `SOURCE_SYSTEMS` + `SourceSystem` → `packages/ai-core/src/billing/source-system.ts`
- [ ] Move `UsageFact`, `ExecutorType` → `packages/ai-core/src/usage/usage.ts`
- [ ] Move `AiEvent` types → `packages/ai-core/src/events/ai-events.ts`
- [ ] Move `RunContext` → `packages/ai-core/src/context/run-context.ts`
- [ ] Create `packages/ai-core/src/index.ts` barrel export
- [ ] Update `src/types/` files to re-export from `@cogni/ai-core` (shim pattern)
- [ ] Add dependency-cruiser rule: `packages/**` cannot import from `src/**`
- [ ] Add grep test: AiEvent/UsageFact defined only in `packages/ai-core/`

**Files to migrate:**

| From                                                       | To                                              |
| ---------------------------------------------------------- | ----------------------------------------------- |
| `src/types/ai-events.ts`                                   | `packages/ai-core/src/events/ai-events.ts`      |
| `src/types/usage.ts`                                       | `packages/ai-core/src/usage/usage.ts`           |
| `src/types/run-context.ts`                                 | `packages/ai-core/src/context/run-context.ts`   |
| `src/types/billing.ts` (`SOURCE_SYSTEMS` + `SourceSystem`) | `packages/ai-core/src/billing/source-system.ts` |

#### Step 2: Package Scaffold

- [ ] Create `packages/langgraph-server/` with minimal health endpoint
- [ ] Create `packages/langgraph-graphs/` with feature-sliced structure
- [ ] Configure both packages to depend on `@cogni/ai-core`
- [ ] Add dependency-cruiser rule: no `src/**` → `packages/langgraph-graphs/**` imports

#### Step 3: Container Scaffold

- [ ] Create `platform/infra/services/runtime/langgraph-server/Dockerfile`
- [ ] Add langgraph-server to `docker-compose.dev.yml` with networks/healthcheck
- [ ] Verify container builds and starts with health endpoint

#### Step 4: Postgres Provisioning

- [ ] Add langgraph schema/DB to existing Postgres (reuse instance)
- [ ] Add `LANGGRAPH_DATABASE_URL` env var to langgraph-server
- [ ] Configure LangGraph.js with Postgres checkpointer

#### Step 5: LiteLLM Wiring

- [ ] Add env vars: `LITELLM_BASE_URL`, `LITELLM_API_KEY`
- [ ] Configure LangGraph.js LLM client to use LiteLLM as base_url
- [ ] Verify langgraph-server can make test completion through litellm

#### Step 6: Spend Attribution Headers

- [ ] Define canonical metadata payload: `{ accountId, runId, threadId, requestId, traceId, executorType }`
- [ ] Attach metadata to LiteLLM calls via `x-litellm-spend-logs-metadata` header
- [ ] Verify litellm spend logs contain metadata for test runs

#### Step 7: Minimal Graph + Endpoint

- [ ] Create chat graph in `packages/langgraph-graphs/graphs/chat/`
- [ ] Expose run endpoint accepting: `{ accountId, runId, threadKey?, model, messages[], requestId, traceId }`
- [ ] Derive `thread_id` server-side as `${accountId}:${threadKey || runId}`
- [ ] Return SSE stream with text deltas + final message + done

#### Step 8: LangGraphServerAdapter

- [ ] Create `src/adapters/server/ai/langgraph-server.adapter.ts`
- [ ] Implement `GraphExecutorPort` interface
- [ ] Build request payload with server-derived identity context
- [ ] Translate server stream → AiEvents (text_delta, assistant_final, done)
- [ ] Emit `usage_report` with `executorType: 'langgraph_server'`

#### Step 9: Model Allowlist

- [ ] Define model allowlist in Next.js (maps to LiteLLM aliases)
- [ ] Select model server-side (not from client)
- [ ] Pass selectedModel to langgraph-server in request

#### Step 10: Billing + Stack Tests

- [ ] Add `'langgraph_server'` to `SOURCE_SYSTEMS` enum
- [ ] Stack test: docker compose up → chat request → HTTP 200 + done
- [ ] Stack test: langgraph_server path creates charge_receipt row
- [ ] Verify traceId/requestId flow: Next.js → langgraph-server → LiteLLM

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

| File                                                   | Change                                                                               |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `packages/ai-core/`                                    | New: Shared cross-process types (AiEvent, UsageFact, etc.)                           |
| `packages/ai-core/src/events/ai-events.ts`             | Move from `src/types/ai-events.ts`                                                   |
| `packages/ai-core/src/usage/usage.ts`                  | Move from `src/types/usage.ts`                                                       |
| `packages/ai-core/src/context/run-context.ts`          | Move from `src/types/run-context.ts`                                                 |
| `packages/ai-core/src/billing/source-system.ts`        | Extract SourceSystem from `src/types/billing.ts`                                     |
| `packages/langgraph-server/`                           | New: LangGraph Server service code (Node.js/LangGraph.js)                            |
| `packages/langgraph-graphs/`                           | New: Feature-sliced graph definitions                                                |
| `packages/langgraph-graphs/graphs/chat/`               | New: Chat graph definition                                                           |
| `platform/infra/services/runtime/langgraph-server/`    | New: Dockerfile + compose config                                                     |
| `platform/infra/services/runtime/docker-compose.*.yml` | Add langgraph-server service with networks/healthcheck                               |
| `src/adapters/server/ai/langgraph-server.adapter.ts`   | New: `LangGraphServerAdapter` implementing GraphExecutorPort                         |
| `src/types/ai-events.ts`                               | Convert to re-export shim from `@cogni/ai-core`                                      |
| `src/types/usage.ts`                                   | Convert to re-export shim from `@cogni/ai-core`                                      |
| `src/types/billing.ts`                                 | Add `'langgraph_server'` to `SOURCE_SYSTEMS`                                         |
| `src/bootstrap/graph-executor.factory.ts`              | Add LangGraphServerAdapter selection logic                                           |
| `src/features/ai/services/ai_runtime.ts`               | Add thread_id derivation (tenant-scoped)                                             |
| `.dependency-cruiser.cjs`                              | Add rules: no `packages/**` → `src/**`, no `src/**` → `packages/langgraph-graphs/**` |

---

## Schema

**Already implemented:**

- `UsageFact.executorType` required field (see `src/types/usage.ts`)
- `ExecutorType = "langgraph_server" | "claude_sdk" | "inproc"`

**P0 changes:**

- Move `SOURCE_SYSTEMS` + `SourceSystem` to `packages/ai-core/` (Step 1)
- Note: `langgraph_server` uses `source: "litellm"` (LLM calls route through LiteLLM); `executorType: "langgraph_server"` distinguishes the executor
- Postgres: create `langgraph_dev` database (reuse existing Postgres instance)

---

## Design Decisions

### 1. Adapter Selection

| Executor Type      | Adapter                      | Use Case                         |
| ------------------ | ---------------------------- | -------------------------------- |
| `langgraph_server` | `LangGraphServerAdapter`     | LangGraph graphs (canonical)     |
| `claude_sdk`       | `ClaudeSdkAdapter`           | Claude Agents SDK (P2)           |
| `inproc`           | `InProcGraphExecutorAdapter` | Direct LLM completion (fallback) |

**Rule:** Config-driven selection in P0. `graphName` maps to adapter + assistant ID.

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

## "Works in all scenarios" Validation Checklist

When this spec is implemented, you can validate quickly:

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

## Related Docs

- [LANGGRAPH_AI.md](LANGGRAPH_AI.md) — Graph patterns (both InProc and Server)
- [GRAPH_EXECUTION.md](GRAPH_EXECUTION.md) — Billing idempotency, pump+fanout
- [USAGE_HISTORY.md](USAGE_HISTORY.md) — Artifact caching (executor-agnostic)
- [AI_SETUP_SPEC.md](AI_SETUP_SPEC.md) — Correlation IDs, telemetry
- [LANGGRAPH_TESTING.md](LANGGRAPH_TESTING.md) — Testing strategy for server executor

---

**Last Updated**: 2026-01-05
**Status**: Draft (P0 Design) — External Runtime + SDK-based streaming; billing parity gap documented
