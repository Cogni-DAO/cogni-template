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
14. **ASSISTANT_FINAL_REQUIRED**: All executors must emit exactly one `assistant_final` event per run with the complete assistant response. Required for USAGE_HISTORY persistence. InProc extracts from graph state; Server extracts from final SDK message.

---

## InProc Execution Path

InProc executes LangGraph within the Next.js process with billing through the adapter layer.

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

`CompletionUnitLLM` (`runtime/completion-unit-llm.ts`) is a LangChain `BaseChatModel` wrapper that routes LLM calls through injected `CompletionFn`:

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

## Server Execution Path

Server path calls external LangGraph Agent Server via SDK. See [LANGGRAPH_SERVER.md](LANGGRAPH_SERVER.md) for infrastructure details.

### Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ Facade / AI Runtime                                                  │
│ - Creates GraphRunRequest with messages, model, caller               │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ LangGraphServerAdapter                                               │
│ - Derives tenant-scoped thread_id (UUIDv5)                           │
│ - Calls SDK client.runs.stream()                                     │
│ - Translates messages-tuple chunks → AiEvents                        │
│ - Emits usage_report with accumulated tokens                         │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ LangGraph Server (External Process)                                  │
│ - Executes graph, owns thread state/checkpoints                      │
│ - Routes LLM calls through LiteLLM proxy                             │
└─────────────────────────────────────────────────────────────────────┘
```

### Billing Contract Divergence (P0 Known Issue)

| Field                       | InProc | Server |
| --------------------------- | ------ | ------ |
| usageUnitId (litellmCallId) | Yes    | No     |
| costUsd                     | Yes    | No     |
| model (resolved)            | Yes    | No     |
| inputTokens / outputTokens  | Yes    | Yes    |

**Decision needed:** Mark server path non-reconcilable for P0, OR enhance server to emit full billing facts.

---

## Creating a New Graph

### 1. Create Graph Folder

```
packages/langgraph-graphs/src/graphs/my-agent/
├── graph.ts    # createMyAgentGraph(llm, tools) factory
├── llm.ts      # LLM config for this graph
├── tools.ts    # Tool selection (imports from @cogni/ai-tools, wraps via toLangChainTools)
├── prompts.ts  # System prompts
└── index.ts    # Barrel export
```

**Note:** `tools.ts` imports contracts from `@cogni/ai-tools` and wraps them for this graph. It does NOT define tool contracts.

### 2. Export from Graphs Barrel

```typescript
// packages/langgraph-graphs/src/graphs/index.ts
export { myAgentGraph } from "./my-agent";
```

Runners import only from `@cogni/langgraph-graphs/graphs` (never internals).

### 3. Update InProc Resolver

```typescript
// src/bootstrap/graph-executor.factory.ts
const graphResolver: GraphResolverFn = (graphId, adapter) => {
  if (graphId === "chat") return createChatRunner(adapter);
  if (graphId === "my-agent") return createMyAgentRunner(adapter);
  return undefined;
};
```

### 4. (If Server) Add to langgraph.json

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

```typescript
// packages/langgraph-graphs/src/runtime/langchain-tools.ts
type ToolExecFn = (params: {
  toolName: string;
  args: unknown;
  toolCallId: string;
}) => Promise<ToolExecResult>;

export function toLangChainTool(opts: {
  contract: ToolContract;
  exec: ToolExecFn;
}): StructuredToolInterface;

export function toLangChainTools(opts: {
  contracts: ToolContract[];
  exec: ToolExecFn;
}): StructuredToolInterface[];
```

**Note:** Wrapper generates `toolCallId` per invocation and passes it to `exec`. No `eventSink` — toolRunner owns event emission via the `emit` callback bound at runner level.

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

### P0: Package Foundation (Phase 1 — Current)

**@cogni/ai-core canonical types:**

- [x] `AiEvent` union type (events/ai-events.ts)
- [x] `UsageFact`, `ExecutorType` (usage/usage.ts)
- [ ] `CompletionFn`, `CompletionResult` — **tech debt: currently defined in langgraph-graphs**
- [ ] `Message`, `MessageToolCall` — **tech debt: currently defined in langgraph-graphs**

**@cogni/langgraph-graphs package structure:**

- [x] Package scaffolding (package.json, tsconfig.json, tsup.config.ts, vitest.config.ts)
- [x] Root tsconfig.json project reference added
- [x] Root package.json workspace dependency added
- [x] Biome noDefaultExport override for config files
- [x] Dependency-cruiser rule: PACKAGES_NO_SRC_IMPORTS (`:365-375`)
- [x] Biome rule: NO_LANGCHAIN_IN_SRC (via noRestrictedImports `:68-69`)

**Runtime utilities (`/runtime` subpath):**

- [x] `CompletionUnitLLM` — BaseChatModel wrapper with injected CompletionFn
- [x] `toBaseMessage()` / `fromBaseMessage()` — Message format converters
- [x] `toLangChainTool()` / `toLangChainTools()` — Tool contract → StructuredTool wrappers
- [x] `AsyncQueue` — Sync-push async-iterate queue for invoke() pattern

**Graph factories (`/graphs` subpath):**

- [x] `createChatGraph(llm, tools)` — React agent factory
- [x] `CHAT_GRAPH_NAME` constant

**Tests:**

- [x] AsyncQueue unit tests (5 passing)
- [ ] CompletionUnitLLM unit tests
- [ ] Message converter unit tests
- [ ] Tool wrapper unit tests

### P0: InProc Execution Path (Phase 2)

> **✅ RESOLVED:** Removed depcruiser rule `no-src-to-langgraph-graphs`.
> NO_LANGCHAIN_IN_SRC is enforced via Biome `noRestrictedImports` which blocks
> `@langchain/**` imports in `src/`. The adapter layer (`src/adapters/server/ai/`)
> CAN import from `@cogni/langgraph-graphs` — only the LangChain packages themselves are blocked.

- [x] Resolve depcruiser rule conflict (removed rule, Biome enforces NO_LANGCHAIN_IN_SRC)
- [ ] Create `/inproc` subpath export in package.json
- [ ] Implement `createInProcChatRunner()` in `packages/langgraph-graphs/src/inproc/runner.ts`
- [ ] Create `langgraph-runner.ts` thin adapter in `src/` (NO `@langchain` imports)
- [ ] Wire `createLangGraphRunner()` in bootstrap factory
- [ ] Add grep test: `@langchain` only in `packages/langgraph-graphs/`

### P0: Server Path (Phase 3)

- [ ] Create `LangGraphServerAdapter` implementing `GraphExecutorPort`
- [ ] Implement `thread_id` derivation (UUIDv5, tenant-scoped)
- [ ] Implement SDK streaming with usage accumulation
- [ ] Resolve billing contract divergence (missing usageUnitId/costUsd)

### P0: InProc Token Streaming (SINGLE_AIEVENT_CONTRACT)

InProc uses `graph.invoke()` + AsyncQueue pattern (NOT `streamEvents`). Tokens flow from `CompletionUnitLLM` → queue → AiEvent yield. Server keeps SDK SSE streaming.

**Translation Ownership:**

| Component             | Owns                                                                        | Shared Helpers                                                        |
| --------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **Server Adapter**    | Maps SDK chunks → AiEvent (SDK handles SSE parsing)                         | Content extraction, AiEvent constructors                              |
| **InProc Runner**     | Token queue lifecycle, `invoke()` orchestration, `assistant_final` emission | Content extraction, AiEvent constructors                              |
| **Shared (runtime/)** | —                                                                           | `extractTextContent()`, `createTextDeltaEvent()`, `accumulateUsage()` |

**Token Flow:**

- InProc: `CompletionUnitLLM._generate()` → `tokenSink.push()` (sync) → AsyncQueue → yield AiEvent
- Server: SDK `client.runs.stream()` → SDK chunk → `mapChunkToAiEvent()` → yield AiEvent
- P0 common subset: `text_delta`, `usage_report`, `assistant_final`, `done` (tool events InProc-only)

**Remaining:**

- [ ] Factor shared helper functions: `extractTextContent()`, `accumulateUsage()`
- [ ] Add conformance test: same prompt → both paths emit comparable AiEvent sequences
- [ ] Verify stack tests: `text_delta` events appear BEFORE `done` event

### P0: Tool Support

- [x] Create `packages/ai-tools` package (NO `@langchain`, NO `src` imports)
- [x] Move tool contracts + pure implementations to `packages/ai-tools`
- [x] Create `toLangChainTool()` wrapper in `packages/langgraph-graphs/src/runtime/`
- [x] Update `createChatGraph(llm, tools)` to accept injected tools
- [ ] Wire `toolExec` function in `langgraph-runner.ts` (passes to package APIs)
- [ ] Add stack test: tool_call_start/tool_call_result events emitted

### P1: Multi-Graph Support

- [ ] Add second graph type to prove pattern
- [ ] Document graph registration workflow
- [ ] Add eval harness for graph comparison

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

---

## Related Documents

- [GRAPH_EXECUTION.md](GRAPH_EXECUTION.md) — Executor-agnostic billing, tracking, UI/UX patterns
- [LANGGRAPH_SERVER.md](LANGGRAPH_SERVER.md) — Infrastructure: Docker, Redis, container deployment
- [LANGGRAPH_TESTING.md](LANGGRAPH_TESTING.md) — Testing strategy for both executors
- [AI_SETUP_SPEC.md](AI_SETUP_SPEC.md) — Correlation IDs, telemetry
- [TOOL_USE_SPEC.md](TOOL_USE_SPEC.md) — Tool execution invariants
- [USAGE_HISTORY.md](USAGE_HISTORY.md) — Run artifacts, assistant_final persistence

---

**Last Updated**: 2026-01-04
**Status**: Draft (Rev 9 - Phase 2 InProc runner implementation in progress)
