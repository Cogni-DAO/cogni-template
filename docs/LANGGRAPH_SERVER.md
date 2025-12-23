# LangGraph Server Integration

> [!CRITICAL]
> LangGraph graphs execute in an external LangGraph Server process. Next.js never imports graph modules. `LangGraphServerAdapter` implements `GraphExecutorPort`, translating server streams to `AiEvent` and emitting `UsageFact` for billing. **LangGraph Server routes ALL LLM calls through LiteLLM proxy for unified billing/spend attribution.**

## Package Structure

| Path                                                | Purpose                                                                              | Rule                           |
| --------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------ |
| `packages/langgraph-server/`                        | Node.js service code (HTTP API, tenant scoping, LiteLLM wiring, event normalization) | Dockerfile builds/runs this    |
| `packages/langgraph-graphs/`                        | Feature-sliced graph definitions + prompts                                           | Next.js must NEVER import this |
| `packages/ai-core/`                                 | Executor-agnostic primitives (AiEvent, UsageFact, tool schemas)                      | No graph definitions here      |
| `platform/infra/services/runtime/langgraph-server/` | Docker packaging (Dockerfile, compose config, env)                                   | No TS logic here               |

## Core Invariants

1. **RUNTIME_IS_EXTERNAL**: Next.js does not import or execute LangGraph graph modules. It calls LangGraph Server via `LangGraphServerAdapter`. Graph definitions live in `packages/langgraph-graphs/`; service code in `packages/langgraph-server/`.

2. **UNIFIED_EXECUTOR_PRESERVED**: All AI execution still flows through `GraphExecutorPort`. The adapter choice (`LangGraphServerAdapter` vs `InProcAdapter` vs `ClaudeSdkAdapter`) is an implementation detail behind the unified interface.

3. **THREAD_ID_TENANT_SCOPED**: `thread_id` is always derived server-side as `${accountId}:${threadKey}` (or `${accountId}:${runId}` fallback). Never accept raw `thread_id` from client. LangGraph persistence is keyed on `thread_id`—this is the privacy boundary.

4. **EXECUTOR_TYPE_REQUIRED**: `UsageFact.executorType` is required. All billing/history logic must be executor-agnostic.

5. **LANGGRAPH_IS_CANONICAL_STATE**: For `langgraph_server` executor, LangGraph Server owns canonical thread state/checkpoints. Any local `run_artifacts` are cache only—never reconstruct conversation from them.

6. **P0_NO_GDPR_DELETE**: P0 does NOT provide compliant user data deletion. LangGraph checkpoint deletion is a P1 requirement. Document this explicitly.

7. **P0_NO_TOOL_EVENT_STREAMING**: For `langgraph_server` in P0, tool execution happens entirely within LangGraph Server. Adapter emits `text_delta`, `assistant_final`, `usage_report`, `done` only—no `tool_call_start`/`tool_call_result` events. Tool event streaming is `inproc` executor only until P1.

8. **LLM_VIA_LITELLM**: LangGraph Server calls LiteLLM (not providers directly). Single service key (`LITELLM_API_KEY`). Spend attribution via metadata headers enables per-tenant/per-run analytics.

9. **MODEL_ALLOWLIST_SERVER_SIDE**: Model selection is server-side only. Next.js selects from allowlist; langgraph-server rejects unknown models.

10. **NO_NEXT_IMPORT_GRAPHS**: Next.js (`src/**`) must never import from `packages/langgraph-graphs/`. Enforced by dependency-cruiser.

11. **PACKAGES_NO_SRC_IMPORTS**: `packages/**` must never import from `src/**`. Shared contracts flow from packages → src, not reverse. Enforced by dependency-cruiser.

12. **SINGLE_SOURCE_OF_TRUTH**: `AiEvent`, `UsageFact`, `ExecutorType`, `RunContext` are defined ONLY in `packages/ai-core/`. `src/types/` files re-export for convenience. Enforced by grep test.

13. **USAGE_SOURCE_RESPONSE_HEADERS**: P0 usage data comes from LiteLLM response headers (`x-litellm-response-cost`) and body (`id`, `usage`), NOT spend_logs polling. Spend logs are for activity dashboard only.

14. **MODEL_ALLOWLIST_LITELLM_CANONICAL**: LiteLLM `/model/info` is the canonical model allowlist. Next.js caches via SWR; langgraph-server validates against same source. No split-brain.

15. **USAGE_EMIT_ON_FINAL_ONLY**: For `langgraph_server`, emit `usage_report` only at completion (after final LLM response). If usage/cost unavailable, complete UI response but emit `billing_failed` metric and mark run unbilled for reconciliation. Never fail user-visible response due to missing billing data.

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

## Service API Contract

**Run endpoint:** `POST /runs`

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

**Health endpoint:** `GET /health` → `200 OK`

**Thread ID derivation (inside service):**

```typescript
const threadId = `${request.accountId}:${request.threadKey ?? request.runId}`;
```

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

## Anti-Patterns

1. **No graph imports in Next.js** — All graph code in `packages/langgraph-graphs/`; enforced by dependency-cruiser
2. **No raw thread_id from client** — Always derive server-side with tenant prefix
3. **No rebuild of LangGraph Server capabilities** — Use checkpoints/threads/runs as-is
4. **No executor-specific billing logic** — UsageFact is normalized; adapters translate
5. **No P0 deletion guarantees** — Document explicitly; implement in P1
6. **No TS logic in platform/** — `platform/infra/services/runtime/langgraph-server/` contains Docker packaging only

---

## Related Docs

- [LANGGRAPH_AI.md](LANGGRAPH_AI.md) — Graph patterns (to be updated for external runtime)
- [GRAPH_EXECUTION.md](GRAPH_EXECUTION.md) — Billing idempotency, pump+fanout
- [USAGE_HISTORY.md](USAGE_HISTORY.md) — Artifact caching (executor-agnostic)
- [AI_SETUP_SPEC.md](AI_SETUP_SPEC.md) — Correlation IDs, telemetry

---

**Last Updated**: 2025-12-23
**Status**: Draft (P0 Design) — Rev 4: Added Step 1 (Shared Contracts Extraction), invariants 11-12, ai-core package structure
