# LangGraph AI Guide

> How to create and execute LangGraph agentic workflows (InProc and Server paths).

> [!IMPORTANT]
> All LangChain code lives in `packages/langgraph-graphs/`. Next.js (`src/`) never imports `@langchain/*`. Both InProc and Server executors implement `GraphExecutorPort` for unified billing/telemetry.

## Overview

LangGraph graphs can execute via two paths:

| Path       | Adapter                      | Use Case                                             |
| ---------- | ---------------------------- | ---------------------------------------------------- |
| **InProc** | `InProcGraphExecutorAdapter` | Next.js process; billing via executeCompletionUnit() |
| **Server** | `LangGraphServerAdapter`     | External LangGraph Server container                  |

**Key Principle:** All AI execution flows through `GraphExecutorPort`. The executor choice is an implementation detail behind the unified interface. See [GRAPH_EXECUTION.md](GRAPH_EXECUTION.md) for billing/tracking patterns.

---

## Package Structure

```
packages/
├── ai-core/                          # Executor-agnostic primitives (NO LangChain) ✓
│   └── src/
│       ├── events/ai-events.ts       # AiEvent union ✓
│       ├── usage/usage.ts            # UsageFact, ExecutorType ✓
│       ├── completion/types.ts       # CompletionFn, CompletionResult (planned)
│       └── messages/message.ts       # Message, MessageToolCall (planned)
│
├── ai-tools/                         # Pure tool definitions (NO LangChain) ✓
│   └── src/
│       ├── index.ts                  # Barrel export
│       ├── types.ts                  # ToolContract, BoundTool, ToolResult
│       └── tools/
│           └── get-current-time.ts   # Pure impl: () => { currentTime }
│
└── langgraph-graphs/                 # ALL LangChain code lives here
    └── src/
        ├── graphs/                   # Graph definitions (stable import surface for runners)
        │   ├── index.ts              # Barrel export: all graphs
        │   └── chat/                 # Chat graph
        │       ├── graph.ts          # createChatGraph(llm, tools) factory
        │       ├── llm.ts            # LLM config for this graph
        │       ├── tools.ts          # Tool selection (imports from @cogni/ai-tools, wraps)
        │       ├── prompts.ts        # System prompts
        │       └── index.ts          # Barrel export for this graph
        ├── runtime/                  # Shared LangChain utilities
        │   ├── completion-unit-llm.ts # CompletionUnitLLM, toBaseMessage, fromBaseMessage
        │   ├── langchain-tools.ts    # toLangChainTool(), toLangChainTools()
        │   └── subgraph-tool.ts      # createSubgraphTool()
        └── inproc/                   # InProc execution
            └── runner.ts             # createInProcChatRunner() — generic runner
```

### Subpath Exports

```typescript
// Graph definitions (Server path imports)
import { chatGraph } from "@cogni/langgraph-graphs/graphs";

// Runtime utilities (converters, LLM wrapper)
import {
  CompletionUnitLLM,
  toBaseMessage,
  fromBaseMessage,
} from "@cogni/langgraph-graphs/runtime";

// InProc execution (Next.js adapter imports)
import {
  createInProcChatRunner,
  createChatGraph,
} from "@cogni/langgraph-graphs/inproc";
```

---

## Core Invariants

1. **NO_LANGCHAIN_IN_SRC**: `src/**` cannot import `@langchain/*`. Enforced by Biome `noRestrictedImports`.
2. **PACKAGES_NO_SRC_IMPORTS**: `packages/**` cannot import from `src/**`. Enforced by dependency-cruiser.
3. **SINGLE_COMPLETIONFN**: Only `@cogni/ai-core` exports `CompletionFn`. All executors use this signature.
4. **FINAL_GATES_COMPLETION**: `final` must not resolve until the graph run completes and the token queue is closed; runner must finalize correctly even if the consumer stops early.
5. **RESULT_REFLECTS_OUTCOME**: `runner.final.ok` must match stream success/failure (deferred promise pattern).
6. **CANCEL_PROPAGATION**: If the consumer stops/cancels the stream, runner must abort underlying completion/graph execution (via AbortSignal or equivalent) and close the queue to avoid leaked work.
7. **ENV_FREE_EXPORTS**: Package exports never read `env.ts` or instantiate provider SDKs directly.
8. **SINGLE_AIEVENT_CONTRACT**: P0 common subset: `text_delta`, `usage_report`, `assistant_final`, `done`. Tool events (`tool_call_start`, `tool_call_result`) are InProc-only for P0; Server tool streaming is P1. Conformance tests verify common subset sequences.
9. **NO_AWAIT_IN_TOKEN_PATH**: The path from LLM token emission to AiEvent yield must not await I/O or slow operations. Use synchronous queue push to prevent backpressure-induced stream aborts.
10. **NO_DIRECT_MODEL_CALLS_IN_INPROC_GRAPH_CODE**: In InProc execution, all model calls must go through `CompletionUnitLLM` (via injected `CompletionFn`). No direct `ChatOpenAI`/`initChatModel`/provider SDK calls in graph or tool code. This ensures billing/streaming/telemetry are never bypassed.
11. **INTERNAL_DRAIN_BEFORE_RESOLVE**: CompletionUnitLLM must drain provider stream before resolving its internal promise. This is an implementation detail; consumers may cancel early per CANCEL_PROPAGATION.
12. **SINGLE_QUEUE_PER_RUN**: Each graph run owns exactly one AsyncQueue. Tool events and LLM events flow to the same queue. The runner creates the queue and binds emit callbacks; adapters (`InProcGraphExecutorAdapter`, `LangGraphServerAdapter`) do not create queues.
13. **CORRELATION_ID_PROPAGATION**: Adapters must use `req.caller.traceId` and `req.ingressRequestId` from GraphRunRequest. Never generate new trace/request IDs in adapters or runners.
14. **ASSISTANT_FINAL_REQUIRED**: On success, all executors must emit exactly one `assistant_final` event with the complete assistant response. On error, no `assistant_final` is emitted (there is no complete response to persist). InProc extracts from graph state; Server extracts from final SDK message.

15. **SUBSCRIBER_FANOUT_NON_BLOCKING**: RunEventRelay fans out via per-subscriber bounded queues. Slow subscribers (History, Billing) never block UI streaming. Each subscriber runs to completion independently.

---

## Type Boundaries (Phase 3+)

When implementing GraphProvider and catalog infrastructure, respect these boundaries:

| Type                                              | Defined In                       | Used By                                   |
| ------------------------------------------------- | -------------------------------- | ----------------------------------------- |
| `GraphRunRequest`, `GraphRunResult`               | `@/ports`                        | `GraphExecutorPort`, `GraphProvider`      |
| `GraphDescriptor`, `GraphCapabilities`            | `graph-provider.ts`              | All providers, aggregator                 |
| `LangGraphCatalogEntry<T>`, `LangGraphCatalog<T>` | `langgraph/catalog.ts`           | `LangGraphInProcProvider` only            |
| `CreateGraphFn`                                   | `@cogni/langgraph-graphs/inproc` | `LangGraphInProcProvider` only (internal) |

**Key Rules:**

1. **NO_PARALLEL_REQUEST_TYPES**: `GraphProvider.runGraph()` uses `GraphRunRequest`/`GraphRunResult` from `@/ports`. Do not create provider-specific request/result types.

2. **CATALOG_DECOUPLED_FROM_EXECUTION_MODE**: `langgraph/catalog.ts` does NOT import from `@cogni/langgraph-graphs/inproc`. Catalog uses generic `TFactory` type; provider binds concrete type internally.

3. **CATALOG_VS_REGISTRY**: Use "Catalog" for static collections built at bootstrap. Reserve "Registry" for systems supporting runtime registration/discovery lifecycle.

4. **PROVIDER_SPECIFIC_CATALOG**: `LangGraphCatalog` is specific to LangGraph providers. `LangGraphServerProvider` (P2) discovers graphs remotely and does NOT use catalog types — only shares `GraphDescriptor` shapes.

5. **CATALOG_SINGLE_SOURCE_OF_TRUTH**: The catalog is exported by `@cogni/langgraph-graphs`, not constructed in `bootstrap/container.ts`. Bootstrap imports and injects; it does not build per-graph entries. Adding a graph means adding to the package export.

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

> **Scaling limitation:** InProc runs inside the Next.js Node.js process. Long-running graph executions consume server resources and block the event loop during LLM calls. P0 accepts this tradeoff for simplicity. P2+ moves execution to a worker service for horizontal scaling.

### Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ Facade / AI Runtime                                                  │
│ - Creates GraphRunRequest with messages, model, caller               │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Bootstrap Factory (graph-executor.factory.ts)                        │
│ - createInProcGraphExecutor() wires GraphResolverFn                  │
│ - Routes "chat" → createLangGraphRunner(adapter)                     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ InProcGraphExecutorAdapter                                           │
│ - Wraps executeCompletionUnit → ai-core CompletionFn                 │
│ - Calls createInProcChatRunner() from package                        │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ @cogni/langgraph-graphs/inproc                                       │
│ - runner.ts: createInProcChatRunner(completionFn, req)               │
│ - Creates CompletionUnitLLM with injected CompletionFn + tokenSink   │
│ - Creates graph with createChatGraph(llm)                            │
│ - Executes via graph.invoke() (NOT stream/streamEvents)              │
│ - Tokens emitted via tokenSink.push() (sync)                         │
└─────────────────────────────────────────────────────────────────────┘
```

### CompletionUnitLLM

`CompletionUnitLLM` (`runtime/completion-unit-llm.ts`) is a LangChain `BaseChatModel` wrapper that routes LLM calls through injected `CompletionFn`.

> **Canonical location:** `CompletionFn`, `CompletionResult`, `Message`, and `MessageToolCall` are currently defined in `@cogni/langgraph-graphs/runtime/completion-unit-llm.ts`. This is tech debt—ideally these types belong in `@cogni/ai-core` per package structure. P0 accepts current location; migration tracked in checklist.

```typescript
export class CompletionUnitLLM extends BaseChatModel {
  constructor(
    completionFn: CompletionFn,
    modelId: string,
    tokenSink?: { push: (event: AiEvent) => void } // Sync push for streaming
  ) {}

  async _generate(messages: BaseMessage[]): Promise<ChatResult> {
    // Convert BaseMessage → ai-core Message via fromBaseMessage()
    // Call completionFn, drain stream, push tokens to tokenSink (sync)
    // Collect results for billing aggregation
  }

  getCollectedResults(): CompletionUnitGenerateResult[] {
    // Returns all LLM call results for usage_report emission
  }

  // NOTE: _streamResponseChunks() exists but is NOT called when using
  // createReactAgent (which uses invoke() internally). Token streaming
  // is achieved via tokenSink injection in _generate().
}
```

### Canonical Converters

```typescript
// ai-core Message → LangChain BaseMessage
export function toBaseMessage(msg: Message): BaseMessage;

// LangChain BaseMessage → ai-core Message
export function fromBaseMessage(msg: BaseMessage): Message;
```

### createInProcChatRunner (inproc/runner.ts)

Main entry point for InProc execution:

```typescript
export function createInProcChatRunner(opts: {
  completionFn: CompletionFn;
  createToolExecFn: (emit: (e: AiEvent) => void) => ToolExecFn;
  toolContracts: ToolContract[];
  req: InProcGraphRequest;
}): { stream: AsyncIterable<AiEvent>; final: Promise<GraphResult> };
```

**Factory Pattern:** Runner creates the queue and passes `emit` to `createToolExecFn`. This ensures tool events and LLM events flow to the same queue (per SINGLE_QUEUE_PER_RUN).

**Deferred Promise Pattern:** Uses shared deferred promise so `final` reflects actual execution outcome even if stream is not fully consumed.

---

## Server Execution Path (P1 — Deferred)

Server path is deferred until InProc proves correctness. See [LANGGRAPH_SERVER.md](LANGGRAPH_SERVER.md) for infrastructure details.

**Summary:** LangGraphServerAdapter calls external LangGraph Server via SDK. Server owns thread state/checkpoints and routes LLM through LiteLLM proxy.

**P0 blocker:** Server lacks billing-grade `UsageFact` fields (`usageUnitId`, `costUsd`, resolved `model`). Cannot be customer-billable path until resolved.

---

## Creating a New Graph

> **Quick Start:** See [AGENT_DEVELOPMENT_GUIDE.md](AGENT_DEVELOPMENT_GUIDE.md) for step-by-step Tier 1 instructions.

### Tier 1: Single-Node Agent (Default)

For simple agents with one ReAct loop, use minimal structure:

```
packages/langgraph-graphs/src/graphs/my-agent/
├── graph.ts      # createMyAgentGraph(llm, tools) factory
└── prompts.ts    # System prompt constant(s)
```

**Template:** Copy from `ponderer/`. Graph imports prompt from `prompts.ts` and uses it directly (no override mechanism).

### Tier 2: Composed Graphs (Future)

For multi-node graphs with custom routing, per-node models, or subgraph composition:

```
packages/langgraph-graphs/src/graphs/my-agent/
├── graph.ts    # createMyAgentGraph(llm, tools) factory — wiring only
├── llm.ts      # LLM config / model provider for this graph
├── tools.ts    # Tool selection (imports from @cogni/ai-tools, wraps via toLangChainTools)
├── prompts.ts  # System prompts
└── index.ts    # Barrel export
```

**Note:** `tools.ts` imports contracts from `@cogni/ai-tools` and wraps them for this graph. It does NOT define tool contracts.

### Deprecation Warning

> **`createReactAgent` from `@langchain/langgraph/prebuilt` is deprecated/migrated.**
> LangGraph v1 moves this to `langchain` package. Pin versions in `package.json`.
> Future migration to `createAgent` from `langchain` is expected.

### 1. Export from Graphs Barrel

```typescript
// packages/langgraph-graphs/src/graphs/index.ts
export { myAgentGraph } from "./my-agent";
```

Runners import only from `@cogni/langgraph-graphs/graphs` (never internals).

### 2. Add Catalog Entry (InProc)

```typescript
// packages/langgraph-graphs/src/catalog.ts
[MY_AGENT_GRAPH_NAME]: {
  displayName: "My Agent",
  description: "What this agent does",
  boundTools: { [GET_CURRENT_TIME_NAME]: getCurrentTimeBoundTool },
  graphFactory: createMyAgentGraph,
},
```

### 3. (If Server) Add to langgraph.json

```json
// packages/langgraph-server/langgraph.json
{
  "graphs": {
    "my-agent": "./src/index.ts:myAgentGraph"
  }
}
```

---

## Tool Structure

### Definition Location

| Executor   | Tool Contract Location       | Tool Wrapping Location                             |
| ---------- | ---------------------------- | -------------------------------------------------- |
| **InProc** | `@cogni/ai-tools/tools/*.ts` | `graphs/<agent>/tools.ts` via `toLangChainTools()` |
| **Server** | `@cogni/ai-tools/tools/*.ts` | `graphs/<agent>/tools.ts` via `toLangChainTools()` |

### Tool Contract Pattern

Tool contracts are defined in `@cogni/ai-tools` (pure, no LangChain). LangGraph wraps them via `toLangChainTools()`:

```typescript
// @cogni/ai-tools defines the contract (no LangChain dependency)
import { defineToolContract } from "@cogni/ai-tools";

export const webSearchContract = defineToolContract({
  name: "web_search",
  description: "Search the web for information",
  inputSchema: z.object({ query: z.string() }),
  outputSchema: z.object({ results: z.array(z.string()) }),
  redaction: { allowlist: ["results"] },
});

// @cogni/langgraph-graphs wraps contracts for LangGraph execution
import { toLangChainTools } from "@cogni/langgraph-graphs/runtime";

const tools = toLangChainTools({
  contracts: [webSearchContract],
  exec: toolExecFn,
});
```

**Note:** No `tool()` definitions in `graphs/`. All tool contracts live in `@cogni/ai-tools`.

### Tool Separation of Concerns

| Package                   | Owns                                       | Dependencies                         |
| ------------------------- | ------------------------------------------ | ------------------------------------ |
| `@cogni/ai-tools`         | Pure tool logic, schemas (Zod), allowlists | `zod` only                           |
| `@cogni/langgraph-graphs` | LangChain `tool()` wrappers                | `@cogni/ai-tools`, `@langchain/core` |

### LangChain Tool Wrapping

`toLangChainTool()` wraps contracts for LangGraph execution. The exec function routes through `toolRunner.exec()` for validation, redaction, and event emission.

**toolCallId handling:**

- **P0**: `toolRunner.exec()` generates UUID if model's `tool_call_id` not provided
- **Invariant**: `TOOLCALLID_STABLE` — same ID across `tool_call_start` → `tool_call_result`
- **Deferred**: Model `tool_call_id` propagation from LangChain callback context (not impossible, just not P0)

**Event emission:** No `eventSink` in wrapper — toolRunner owns event emission via the `emit` callback bound at runner level.

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

> **Principle:** Prove correctness (runner emits right AiEvents) before infra (worker/queue/persistence).

### P0: Package Foundation (Phase 1 — ✅ Complete)

**@cogni/ai-core canonical types:**

- [x] `AiEvent` union type (events/ai-events.ts)
- [x] `UsageFact`, `ExecutorType` (usage/usage.ts)
- [ ] `CompletionFn`, `CompletionResult` — **tech debt: defined in langgraph-graphs**
- [ ] `Message`, `MessageToolCall` — **tech debt: defined in langgraph-graphs**

**@cogni/langgraph-graphs package structure:**

- [x] Package scaffolding (package.json, tsconfig.json, tsup.config.ts, vitest.config.ts)
- [x] Biome rule: NO_LANGCHAIN_IN_SRC (via noRestrictedImports)
- [x] Dependency-cruiser rule: PACKAGES_NO_SRC_IMPORTS

**Runtime utilities (`/runtime` subpath) — ✅ Complete:**

- [x] `CompletionUnitLLM` — BaseChatModel wrapper with injected CompletionFn
- [x] `toBaseMessage()` / `fromBaseMessage()` — Message format converters
- [x] `toLangChainTool()` / `toLangChainTools()` — Tool contract → StructuredTool wrappers
- [x] `AsyncQueue` — Sync-push async-iterate queue (5 unit tests passing)

**Graph factories (`/graphs` subpath) — ✅ Complete:**

- [x] `createChatGraph(llm, tools)` — React agent factory using createReactAgent
- [x] `CHAT_GRAPH_NAME` constant

### P0: InProc Runner (Phase 2 — ✅ Complete)

**Implementation sequence:**

1. **Phase 2a: Package smoke test** — ✅ Complete
   - [x] Create `/inproc` subpath export in package.json
   - [x] Implement `createInProcChatRunner()` in `packages/langgraph-graphs/src/inproc/runner.ts`
   - [x] Add `AssistantFinalEvent` to `@cogni/ai-core` AiEvent union
   - [x] Add conformance test: verify AiEvent sequence (`text_delta`\*, `usage_report`, `assistant_final`, `done`)
   - [x] Verify exactly one `assistant_final` event per run

2. **Phase 2b: Route wiring** — ✅ Complete
   - [x] Wire via `graphResolver` in bootstrap factory
   - [x] Route stays pure translator (AiEvent → assistant-stream)
   - [x] Add grep test: `@langchain` only in `packages/langgraph-graphs/`
   - [x] Delete deprecated `executeChatGraph()` — removed with `src/features/ai/graphs/` directory

3. **Phase 2c: Tool events** — ✅ Complete
   - [x] Wire `toolExec` via `createToolExecFn` factory pattern
   - [x] Add integration test: `tool_call_start`/`tool_call_result` events emitted (package seam test)
   - [ ] TODO: Add stack test with catalog mock + stateful CompletionUnitAdapter (validates full provider path)

### P0: Architecture Refactor (Phase 3 — ✅ Complete)

> See [GRAPH_EXECUTION.md](GRAPH_EXECUTION.md) for full checklist with file tree map.

Refactor to GraphProvider + AggregatingGraphExecutor pattern per feedback. This phase is REQUIRED before adding Graph #2.

**Phase 3a: Boundary Types**

- [x] Add `ToolExecFn`, `ToolExecResult`, `EmitAiEvent` to `@cogni/ai-core/tooling/types.ts`
- [x] Add `ToolEffect` type to `@cogni/ai-core/tooling/types.ts`
- [x] Add `effect: ToolEffect` field to `ToolContract` in `@cogni/ai-tools`
- [x] Add `policy_denied` to `ToolErrorCode` union
- [x] Export from `@cogni/ai-core` barrel
- [x] Create `src/ports/tool-exec.port.ts` re-exporting from `@cogni/ai-core`
- [ ] Define/retain exactly one `CompletionFinalResult` union — delete duplicates

**Phase 3b: Move LangGraph Wiring to Adapters**

- [x] Create `src/adapters/server/ai/langgraph/` directory
- [x] Move `tool-runner.ts` → `src/shared/ai/tool-runner.ts`
- [x] Delete `src/features/ai/runners/` (logic absorbed by provider)
- [x] Verify dep-cruiser: no adapters→features imports
- NOTE: NO per-graph adapter files — graphs remain in `packages/langgraph-graphs/`
- NOTE: NO tool-registry — graphs import ToolContracts directly; policy enforced in tool-runner

**Phase 3c: Provider + Aggregator (P0 Scope)**

- [x] Create internal `GraphProvider` interface in `src/adapters/server/ai/graph-provider.ts`
- [x] Create `AggregatingGraphExecutor` implementing aggregation
- [x] Implement `LangGraphInProcProvider` with injected catalog
- [x] Provider uses `LangGraphCatalog<CreateGraphFn>` imported from `@cogni/langgraph-graphs`
- NOTE: Thread/run-shaped API (`createThread()`, `createRun()`, `streamRun()`) deferred to P1

**Phase 3d: Composition Root Wiring**

- [x] Import catalog from `@cogni/langgraph-graphs` (provider imports internally, not bootstrap)
- [x] Remove `graphResolver` param — renamed to `createGraphExecutor()` (facade is graph-agnostic)
- [x] Update `completion.server.ts` to delete all graph selection logic

**Non-Regression:**

- Do NOT change `toolCallId` behavior or tool schema shapes
- Relocate + rewire imports only; no runtime logic changes

**Deferred (P1+):**

- [ ] Thread/run-shaped port API (requires run persistence)
- [ ] DB persistence (`ai_runs` + `ai_run_events` tables)
- [ ] Worker service (move execution off Next.js)

### P1: Server Path (Deferred)

Server path is deferred until InProc proves correctness. See [LANGGRAPH_SERVER.md](LANGGRAPH_SERVER.md).

**Known billing gap:** Server lacks `usageUnitId` and `costUsd` from LiteLLM headers. Cannot be customer-billable until resolved.

### P0: Token Streaming Notes

InProc uses `graph.invoke()` + AsyncQueue pattern (NOT `streamEvents`). Token flow:

- `CompletionUnitLLM._generate()` → `tokenSink.push()` (sync) → AsyncQueue → yield AiEvent
- P0 common subset: `text_delta`, `usage_report`, `assistant_final`, `done`
- Tool events (`tool_call_start`, `tool_call_result`) are InProc-only for P0

**Translation Ownership:**

| Component             | Owns                                                                        |
| --------------------- | --------------------------------------------------------------------------- |
| **Server Adapter**    | Maps SDK chunks → AiEvent (SDK handles SSE parsing)                         |
| **InProc Runner**     | Token queue lifecycle, `invoke()` orchestration, `assistant_final` emission |
| **Shared (runtime/)** | `extractTextContent()`, `createTextDeltaEvent()`, `accumulateUsage()`       |

### P0: Tool Support (✅ Infrastructure Complete)

- [x] Create `packages/ai-tools` package (NO `@langchain`, NO `src` imports)
- [x] Move tool contracts + pure implementations to `packages/ai-tools`
- [x] Create `toLangChainTool()` wrapper in `packages/langgraph-graphs/src/runtime/`
- [x] Update `createChatGraph(llm, tools)` to accept injected tools

Remaining wiring tracked in Phase 2c above.

### P0: Graph #2 Enablement (Phase 4 — Ready)

- [ ] Create `packages/langgraph-graphs/src/graphs/research/` (Graph #2 factory)
- [ ] Implement `createResearchGraph()` in package
- [ ] Add `langgraph:research` entry to catalog exported by `@cogni/langgraph-graphs` (single source of truth)
- [ ] Expose via `listGraphs()` on aggregator
- [ ] UI adds graph selector → sends `graphId` when creating run
- [ ] E2E test: verify graph switching works

### P1+: Future Work

- [ ] Server path billing parity (usageUnitId, costUsd from LiteLLM headers)
- [ ] Durable event log (`ai_run_events` table for replay)
- [ ] Worker service (move execution off Next.js)
- [ ] Shared helper extraction: `extractTextContent()`, `accumulateUsage()`
- [ ] Conformance test: same prompt → both paths emit comparable AiEvent sequences
- [ ] Thread persistence (move from ephemeral to durable)

---

## Anti-Patterns

1. **No `@langchain` imports in `src/`** — All LangChain code in `packages/langgraph-graphs/`
2. **No hardcoded models in graphs** — Model comes from `GraphRunRequest.model` → `config.configurable.model`
3. **No direct `ChatOpenAI` in InProc** — Use `CompletionUnitLLM` wrapper for billing
4. **No raw `thread_id` from client** — Always derive server-side. Conversation continuity requires a stable, server-derived `threadKey`.
5. **No `done` emission in completion unit** — Only graph-level runner emits `done`
6. **No env reads in package exports** — Inject dependencies, don't read `env.ts`
7. **No `await` in token sink** — `tokenSink.push()` must be synchronous; async causes backpressure aborts
8. **No `streamEvents()` for InProc** — Use `invoke()` + AsyncQueue; `streamEvents()` has Pregel lifecycle issues
9. **No circular dependencies** — `ai-tools` must not import `langgraph-graphs`; only `langgraph-graphs` wraps `ai-tools` into LangChain tools. Adapters in `src/` pass factories, not pre-bound functions
10. **No nested `done`/`final` from subgraphs** — Subgraph invocation runs in "subgraph mode" (no `done`); parent run owns `done`/`final`

---

## Known Issues

- [ ] **Stream controller "already closed" error** — Chat with Tool usage -> new message -> `TypeError: Invalid state: Controller is already closed` fires on client abort/disconnect but does not block execution. The `createAssistantStreamResponse()` callback in `src/app/api/v1/ai/chat/route.ts` attempts writes after stream termination. Fix: wrap controller writes to catch `ERR_INVALID_STATE`, check `request.signal.aborted` before writes, skip finalization on abort. Tracked as non-blocking; stream completes successfully despite error.

- [ ] **P1: Tool call ID architecture** — P0 workaround generates canonical `toolCallId` at adapter finalization (`src/adapters/server/ai/litellm.adapter.ts:662`) using `acc.id || randomUUID()`. This works but conflates `providerToolCallId` (optional, for telemetry) with `canonicalToolCallId` (required, for correlation). P1 should: (1) preserve `providerToolCallId` as optional metadata, (2) generate `canonicalToolCallId` at tool invocation boundary in graph layer, (3) use canonical ID consistently for `assistant.tool_calls[].id` and `tool.tool_call_id`.

- [x] **P0: Runner/Adapter architecture split** — ~~Current `langgraph-chat.runner.ts` violates layer boundaries.~~ **RESOLVED in Phase 3.** Summary:
  - [x] **Delete runner**: `langgraph-chat.runner.ts` → deleted; logic absorbed by `LangGraphInProcProvider`
  - [x] **Move tool-runner**: `features/ai/tool-runner.ts` → `shared/ai/tool-runner.ts` (adapters can import shared/)
  - [x] **Fix types**: `ToolExecFn`/`EmitAiEvent` moved to `@cogni/ai-core`; adapters import legally
  - [x] **No per-graph files**: Provider uses imported catalog from `@cogni/langgraph-graphs`

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

**Last Updated**: 2026-01-11
**Status**: Draft (Rev 14 - Tier 1/2 structure; AGENT_DEVELOPMENT_GUIDE.md added)
