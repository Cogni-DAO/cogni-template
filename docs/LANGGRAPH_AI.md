# LangGraph AI Guide

> How to create and execute LangGraph agentic workflows (InProc and Server paths).

> [!IMPORTANT]
> All LangChain code lives in `packages/langgraph-graphs/`. Next.js (`src/`) never imports `@langchain/*`. Both InProc and Server executors implement `GraphExecutorPort` for unified billing/telemetry.

## Architecture Contract

| Category                | Status         | Notes                                                                |
| ----------------------- | -------------- | -------------------------------------------------------------------- |
| **Package structure**   | ✅ Implemented | ai-core, ai-tools, langgraph-graphs                                  |
| **Compiled exports**    | 📋 Contract    | Graphs export `compile()` with no args                               |
| **TOOL_CATALOG**        | 📋 Contract    | Canonical registry in `ai-tools`; wrapper checks `toolIds` allowlist |
| **ALS runtime context** | 📋 Contract    | `getCogniExecContext()` per-run isolation                            |

> See [GRAPH_EXECUTION.md](GRAPH_EXECUTION.md) for authoritative invariants and implementation status.

---

## Overview

LangGraph graphs can execute via two paths:

| Path       | Adapter                       | Use Case                                             |
| ---------- | ----------------------------- | ---------------------------------------------------- |
| **InProc** | `InProcCompletionUnitAdapter` | Next.js process; billing via executeCompletionUnit() |
| **Server** | `LangGraphServerAdapter`      | External LangGraph Server container                  |

**Key Principle:** All AI execution flows through `GraphExecutorPort`. The executor choice is an implementation detail behind the unified interface. See [GRAPH_EXECUTION.md](GRAPH_EXECUTION.md) for billing/tracking patterns.

---

## Package Structure

```
packages/
├── ai-core/                          # Executor-agnostic primitives (NO LangChain)
│   └── src/
│       ├── events/ai-events.ts       # AiEvent union
│       ├── usage/usage.ts            # UsageFact, ExecutorType
│       ├── configurable/             # GraphRunConfig schema
│       └── tooling/                  # Tool execution types + runtime
│           ├── types.ts              # ToolExecFn, BoundToolRuntime, EmitAiEvent
│           ├── tool-runner.ts        # createToolRunner (canonical pipeline)
│           ├── ai-span.ts            # AiSpanPort (observability interface)
│           └── runtime/tool-policy.ts # ToolPolicy, createToolAllowlistPolicy
│
├── ai-tools/                         # Pure tool definitions (NO LangChain)
│   └── src/
│       ├── types.ts                  # ToolContract, BoundTool, ToolResult
│       ├── catalog.ts                # TOOL_CATALOG: Record<string, BoundTool>
│       └── tools/*.ts                # Pure implementations
│
└── langgraph-graphs/                 # ALL LangChain code lives here
    └── src/
        ├── catalog.ts                # LANGGRAPH_CATALOG (graph metadata)
        ├── graphs/                   # Graph definitions
        │   ├── index.ts              # Barrel: inproc entrypoints
        │   ├── poet/
        │   │   ├── graph.ts          # Pure factory: createPoetGraph({ llm, tools })
        │   │   ├── server.ts         # langgraph dev entrypoint (initChatModel)
        │   │   ├── cogni-exec.ts     # Cogni executor entrypoint (ALS-based)
        │   │   └── prompts.ts        # System prompts
        │   └── <agent>/
        │       ├── graph.ts          # Pure factory
        │       ├── server.ts         # langgraph dev entrypoint
        │       ├── cogni-exec.ts     # Cogni executor entrypoint
        │       └── prompts.ts        # System prompts
        └── runtime/                  # Runtime utilities
            ├── core/                 # Generic (no ALS)
            │   ├── async-queue.ts
            │   ├── message-converters.ts
            │   ├── langchain-tools.ts   # makeLangChainTools, toLangChainToolsCaptured
            │   └── server-entrypoint.ts
            └── cogni/                # Cogni executor (uses ALS)
                ├── exec-context.ts      # CogniExecContext, runWithCogniExecContext
                ├── completion-adapter.ts # CogniCompletionAdapter (Runnable-based)
                ├── tools.ts             # toLangChainToolsFromContext
                └── entrypoint.ts        # createCogniEntrypoint
```

**Supported import surface:**

```typescript
// Compiled graph exports
import { poetGraph, pondererGraph } from "@cogni/langgraph-graphs/graphs";

// Runtime utilities
import {
  CogniCompletionAdapter,
  toBaseMessage,
} from "@cogni/langgraph-graphs/runtime";
```

---

## Core Invariants

> See [GRAPH_EXECUTION.md](GRAPH_EXECUTION.md) for authoritative invariants on billing, execution, and compiled graph architecture.

**LangGraph-specific invariants:**

1. **NO_LANGCHAIN_IN_SRC**: `src/**` cannot import `@langchain/*`. Enforced by Biome `noRestrictedImports`.
2. **PACKAGES_NO_SRC_IMPORTS**: `packages/**` cannot import from `src/**`. Enforced by dependency-cruiser.
3. **ENV_FREE_EXPORTS**: Package exports never read `env.ts` or instantiate provider SDKs directly.
4. **SINGLE_AIEVENT_CONTRACT**: Common subset: `text_delta`, `usage_report`, `assistant_final`, `done`. Tool events are InProc-only for P0.
5. **NO_AWAIT_IN_TOKEN_PATH**: Token emission → AiEvent yield must not await I/O. Use synchronous queue push.
6. **SINGLE_QUEUE_PER_RUN**: Each graph run owns exactly one AsyncQueue. Tool events and LLM events flow to the same queue.
7. **ASSISTANT_FINAL_REQUIRED**: On success, emit exactly one `assistant_final` event with complete response.

---

## Type Boundaries

| Type                                | Defined In             | Used By                              |
| ----------------------------------- | ---------------------- | ------------------------------------ |
| `GraphRunRequest`, `GraphRunResult` | `@/ports`              | `GraphExecutorPort`, `GraphProvider` |
| `GraphRunConfig`                    | `@cogni/ai-core`       | All adapters, graphs                 |
| `LangGraphCatalogEntry`             | `langgraph/catalog.ts` | `LangGraphInProcProvider`            |

**Key Rules:**

1. **CATALOG_SINGLE_SOURCE_OF_TRUTH**: Catalog exported by `@cogni/langgraph-graphs`, references compiled graphs.
2. **NO_PARALLEL_REQUEST_TYPES**: Providers use `GraphRunRequest`/`GraphRunResult` from `@/ports`.

---

## P0 Persistence Integration

> **Principle:** Prove runner correctness (AiEvent sequence) before persistence infrastructure.

Persistence is handled by parallel stream subscribers—runner owns event emission, not storage:

| Subscriber            | Event              | Action                                      |
| --------------------- | ------------------ | ------------------------------------------- |
| **BillingSubscriber** | `usage_report`     | `commitUsageFact()` → charge_receipts       |
| **HistorySubscriber** | `assistant_final`  | `persistArtifact()` → run_artifacts (cache) |
| **UI Subscriber**     | `text_delta`, etc. | Forward to client (may disconnect)          |

**Key contracts from [USAGE_HISTORY.md](USAGE_HISTORY.md):**

- **NO_DELTA_STORAGE**: P0 persists only user input + assistant final output. No streaming deltas.
- **ARTIFACTS_ARE_CACHE**: `run_artifacts` is best-effort transcript cache, not source of truth. For `langgraph_server`, LangGraph owns canonical thread state.
- **REDACT_BEFORE_PERSIST**: Masking applied before `content_hash` computation and storage. Single redaction boundary.
- **TENANT_SCOPED**: All artifacts include `account_id`. RLS enforces isolation. `UNIQUE(account_id, run_id, artifact_key)` for idempotency.

**Runner responsibility:** Emit `assistant_final` with complete content. HistoryWriter persists directly—no delta assembly required.

---

## InProc Execution Path

InProc executes LangGraph within the Next.js server runtime with billing through the adapter layer.

> **Scaling limitation:** InProc runs inside the Next.js Node.js process. Long-running graphs consume server resources. P2+ moves execution to a worker service.

### Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ AiRuntimeService.runGraph(request)                                  │
│ - Routes via AggregatingGraphExecutor by graphId                    │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ LangGraphInProcProvider                                             │
│ - Looks up compiled graph from catalog                              │
│ - Sets up AsyncLocalStorage context (completionFn, tokenSink)       │
│ - Invokes: graph.invoke(messages, { configurable })                 │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Compiled Graph (packages/langgraph-graphs/src/graphs/*)             │
│ - Accesses runtime via getCogniExecContext()                        │
│ - LLM calls route through CogniCompletionAdapter                    │
│ - Tools resolved by toolIds via ToolRegistry                        │
└─────────────────────────────────────────────────────────────────────┘
```

### CogniCompletionAdapter

`CogniCompletionAdapter` (`runtime/cogni/completion-adapter.ts`) is a `Runnable`-based wrapper that routes LLM calls through the ALS-provided `CompletionFn` for billing/streaming integration.

**Key design:**

- Extends `Runnable` (not `BaseChatModel`) so `configurable` is available in `invoke()`
- Model read from `config.configurable.model` per invariants #35/#37
- Non-serializable deps (`completionFn`, `tokenSink`) from ALS
- Includes `_modelType()` for LangGraph duck-typing compatibility
- Fails fast if ALS context or model missing

### Runtime Context

The provider sets up ALS context before graph invocation. Per #35 NO_MODEL_IN_ALS, the runtime holds only non-serializable dependencies (`completionFn`, `tokenSink`, `toolExecFn`). Model travels via `configurable`.

**Files:**

- `runtime/cogni/exec-context.ts` — `CogniExecContext` interface, `runWithCogniExecContext()`, `getCogniExecContext()`
- `runtime/cogni/completion-adapter.ts` — `CogniCompletionAdapter` implementation

---

## Server Execution Path (P1 — Deferred)

Server path is deferred until InProc proves correctness. See [LANGGRAPH_SERVER.md](LANGGRAPH_SERVER.md) for infrastructure details.

**Summary:** LangGraphServerAdapter calls external LangGraph Server via SDK. Server owns thread state/checkpoints and routes LLM through LiteLLM proxy. `stateKey` is required; send only new user input; server owns thread state. Tools work per-run. InProc path ignores `stateKey` (no thread persistence).

**P0 blocker:** Server lacks billing-grade `UsageFact` fields (`usageUnitId`, `costUsd`, resolved `model`). Cannot be customer-billable path until resolved.

---

## Creating a New Graph

### Graph Structure

```
packages/langgraph-graphs/src/graphs/my-agent/
├── graph.ts        # Pure factory: createMyAgentGraph({ llm, tools })
├── server.ts       # langgraph dev entrypoint (uses shared helper)
├── cogni-exec.ts   # Cogni executor entrypoint (uses shared helper)
└── prompts.ts      # System prompt constant(s)
```

### 1. Create Pure Graph Factory

```typescript
// packages/langgraph-graphs/src/graphs/my-agent/graph.ts
import { MessagesAnnotation } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { SYSTEM_PROMPT } from "./prompts";
import type { CreateReactAgentGraphOptions } from "../types";

export const MY_AGENT_GRAPH_NAME = "my-agent" as const;

export function createMyAgentGraph(opts: CreateReactAgentGraphOptions) {
  const { llm, tools } = opts;
  return createReactAgent({
    llm,
    tools: [...tools],
    messageModifier: SYSTEM_PROMPT,
    stateSchema: MessagesAnnotation,
  });
}
```

**Key:** Pure factory with no env reads. LLM/tools injected by entrypoints.

### 2. Create Entrypoints (Use Shared Helpers)

```typescript
// packages/langgraph-graphs/src/graphs/my-agent/server.ts
import { initChatModel } from "langchain/chat_models/universal";
import { createServerEntrypoint } from "../../runtime/server-entrypoint";
import { createMyAgentGraph, MY_AGENT_GRAPH_NAME } from "./graph";

// Top-level await: LLM built at module load (not inside helper)
const llm = await initChatModel(undefined, {
  configurableFields: ["model"],
  modelProvider: "openai",
  configuration: { baseURL: process.env.LITELLM_BASE_URL },
  apiKey: process.env.LITELLM_MASTER_KEY,
});

// createServerEntrypoint is SYNC — receives pre-built LLM
export const myAgent = createServerEntrypoint(
  MY_AGENT_GRAPH_NAME,
  createMyAgentGraph,
  { llm }
);
```

```typescript
// packages/langgraph-graphs/src/graphs/my-agent/cogni-exec.ts
import { createCogniEntrypoint } from "../../runtime/cogni/entrypoint";
import { createMyAgentGraph, MY_AGENT_GRAPH_NAME } from "./graph";

// createCogniEntrypoint is SYNC — creates no-arg CogniCompletionAdapter (reads ALS at invoke time)
export const myAgentGraph = createCogniEntrypoint(
  MY_AGENT_GRAPH_NAME,
  createMyAgentGraph
);
```

### 3. Export Cogni Entrypoint from Barrel

```typescript
// packages/langgraph-graphs/src/graphs/index.ts
export { myAgentGraph } from "./my-agent/cogni-exec";
```

### 3. Add Catalog Entry

```typescript
// packages/langgraph-graphs/src/catalog.ts
[MY_AGENT_GRAPH_NAME]: {
  displayName: "My Agent",
  description: "What this agent does",
  toolIds: ["get_current_time"],
  compiledGraph: myAgentGraph,
},
```

### 4. Add to langgraph.json (Server/Dev)

```json
// packages/langgraph-graphs/langgraph.json
{
  "graphs": {
    "my-agent": "./src/graphs/my-agent/server.ts:myAgent"
  }
}
```

**Two Entrypoints, One Factory:**

Both paths use the same factory (`graph.ts`) and invoke signature (`{ configurable }`). Entrypoints differ by LLM wiring:

- `server.ts` — For `langgraph dev`: top-level await builds LLM via `initChatModel`; helper is sync
- `cogni-exec.ts` — For Cogni executor (Next.js): no-arg `CogniCompletionAdapter` (reads `model` from `configurable`, deps from ALS at invoke time)

Entrypoint logic is centralized in shared helpers. See [GRAPH_EXECUTION.md](GRAPH_EXECUTION.md) invariants #33-34.

---

## Tool Structure

### Tool Allowlist Pattern

Tool schemas are bound at graph compile time. `configurable.toolIds` is a **runtime allowlist** checked at execution:

```typescript
// @cogni/ai-tools/catalog.ts - canonical registry
export const TOOL_CATALOG = {
  core__get_current_time: getCurrentTimeBoundTool,
  core__web_search: webSearchBoundTool,
};

// toLangChainTool wrapper checks allowlist at execution
func: async (args, runManager?, config?) => {
  const allowed = config?.configurable?.toolIds ?? [];
  if (!allowed.includes(toolName)) {
    return { ok: false, errorCode: "policy_denied", safeMessage: "..." };
  }
  return exec(toolName, args, config?.configurable);
};
```

### Package Responsibilities

| Package                   | Owns                                  | Dependencies                         |
| ------------------------- | ------------------------------------- | ------------------------------------ |
| `@cogni/ai-tools`         | `TOOL_CATALOG`, contracts, schemas    | `zod` only                           |
| `@cogni/langgraph-graphs` | `toLangChainTool` (wraps + allowlist) | `@cogni/ai-tools`, `@langchain/core` |

---

## langgraph.json Configuration

For Server path, graphs are registered in `packages/langgraph-server/langgraph.json`:

```json
{
  "node_version": "20",
  "graphs": {
    "chat": "./src/index.ts:chatGraph",
    "my-agent": "./src/index.ts:myAgentGraph"
  },
  "env": ".env"
}
```

The `langgraph-server` package re-exports graphs from `@cogni/langgraph-graphs/graphs`.

---

## Implementation Checklist

See [GRAPH_EXECUTION.md § P1: Compiled Graph Execution](GRAPH_EXECUTION.md#p1-compiled-graph-execution) for the canonical checklist.

### P1: Server Path

Server path deferred until InProc proves correctness. See [LANGGRAPH_SERVER.md](LANGGRAPH_SERVER.md).

**Known billing gap:** Server lacks `usageUnitId` and `costUsd` from LiteLLM headers.

---

## Anti-Patterns

1. **No `@langchain` imports in `src/`** — All LangChain code in `packages/langgraph-graphs/`
2. **No hardcoded models in graphs** — Model comes from ALS (provider sets from `configurable.model`)
3. **No direct `ChatOpenAI` in InProc** — Use `CogniCompletionAdapter` wrapper for billing
4. **No tool instances in configurable** — Pass `toolIds`, resolve via registry
5. **No constructor args on graph exports** — Graphs compile with no args; runtime config via `configurable`
6. **No env reads in package exports** — Use `AsyncLocalStorage` context
7. **No `await` in token sink** — `tokenSink.push()` must be synchronous
8. **No `streamEvents()` for InProc** — Use `invoke()` + AsyncQueue
9. **No forked tool wrapper logic** — Single `makeLangChainTools` impl; thin wrappers resolve `toolExecFn` differently
10. **No constructor args on `CogniCompletionAdapter`** — No-arg constructor; reads model from `configurable` and deps from ALS at invoke time

---

## Known Issues

- [ ] **Stream controller "already closed" error** — Non-blocking; stream completes despite error on client disconnect.
- [ ] **Tool call ID architecture** — P0 workaround generates UUID; P1 should propagate model's `tool_call_id`.

---

## Related Documents

- [AGENT_DEVELOPMENT_GUIDE.md](AGENT_DEVELOPMENT_GUIDE.md) — Quick start for adding new agent graphs
- [GRAPH_EXECUTION.md](GRAPH_EXECUTION.md) — Executor-agnostic billing, tracking, UI/UX patterns
- [LANGGRAPH_SERVER.md](LANGGRAPH_SERVER.md) — Infrastructure: Docker, Redis, container deployment
- [LANGGRAPH_TESTING.md](LANGGRAPH_TESTING.md) — Testing strategy for both executors
- [AI_SETUP_SPEC.md](AI_SETUP_SPEC.md) — Correlation IDs, telemetry
- [TOOL_USE_SPEC.md](TOOL_USE_SPEC.md) — Tool execution invariants
- [USAGE_HISTORY.md](USAGE_HISTORY.md) — Run artifacts, assistant_final persistence

---

**Last Updated**: 2026-01-29
**Status**: Draft (Rev 18 - Two-entrypoint architecture; shared helpers; NO_PER_GRAPH_ENTRYPOINT_WIRING)
