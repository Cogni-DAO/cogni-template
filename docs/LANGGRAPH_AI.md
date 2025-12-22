# LangGraph AI Guide

> How to create and maintain agentic graph workflows.

> [!IMPORTANT]
> **LangGraph graphs execute in an external LangGraph Server process.** Next.js never imports graph modules. See [LANGGRAPH_SERVER.md](LANGGRAPH_SERVER.md) for runtime architecture. `LangGraphServerAdapter` implements `GraphExecutorPort`, preserving unified billing/telemetry.

## Overview

Graph definitions live in `apps/langgraph-service/` (feature-sliced within that service). Next.js only communicates with LangGraph Server via adapter—no graph code in the Next.js codebase.

**Runtime architecture:**

- **Next.js:** Uses assistant-ui Data Stream Protocol (`@assistant-ui/react-data-stream`)
- **LangGraph Server:** External process executes graphs, owns thread state/checkpoints
- **Adapter:** `LangGraphServerAdapter` translates server streams → AiEvents

**Key Principle:** All AI execution flows through `GraphExecutorPort`. The executor choice (LangGraph Server, Claude SDK, InProc) is an implementation detail behind the unified interface.

---

## AI Runtime Architecture

All AI execution flows through `GraphExecutorPort` per the **UNIFIED_GRAPH_EXECUTOR** invariant. There is no "graph vs direct LLM decision" — everything goes through the same port.

**Route → ai_runtime → GraphExecutorPort → Adapter**

| Component          | Location                                         | Responsibility                                   |
| ------------------ | ------------------------------------------------ | ------------------------------------------------ |
| Route              | `src/app/api/v1/ai/chat/route.ts`                | Maps AiEvents → Data Stream Protocol             |
| AI Runtime         | `src/features/ai/services/ai_runtime.ts`         | Creates runId, manages RunEventRelay for billing |
| GraphExecutorPort  | `src/ports/graph-executor.port.ts`               | Unified execution interface                      |
| InProcGraphAdapter | `src/adapters/server/ai/inproc-graph.adapter.ts` | Wraps LLM completion, emits usage_report         |

**Route responsibilities:**

- Consumes AiEvents from ai_runtime
- Maps AiEvents → Data Stream Protocol using official assistant-ui helper
- Applies final transport-level truncation if needed

**AI Runtime responsibilities:**

- Generates `runId` for graph executions
- Manages `RunEventRelay` for pump+fanout (billing independent of client)
- Returns `AsyncIterable<AiEvent>` — must yield immediately, no buffering
- Does NOT map to wire protocol (that's route's job)

---

## Creating a New Graph

### File Structure

```
apps/langgraph-service/
└── src/
    └── graphs/
        └── <feature>/
            ├── <graph>.graph.ts      # Graph definition (LangGraph native)
            ├── <graph>.prompt.ts     # Prompt templates
            └── tools/                # Tool definitions for LangGraph
                └── <tool>.ts

src/features/<feature>/ai/
└── tools/
    └── <tool>.tool.ts                # Tool contracts (InProc adapter only)
```

**Note:** Graph code lives in `apps/langgraph-service/`, NOT in `src/features/`. Next.js never imports graph modules.

**Tool ownership by executor:**

- **`langgraph_server`:** Tool definitions live in `apps/langgraph-service/`. LangGraph Server executes tools internally.
- **`inproc`:** Tool contracts in `src/features/` for validation/redaction when streaming tool events to UI.

### Step-by-Step

1. **Create graph definition** in `apps/langgraph-service/src/graphs/<feature>/<graph>.graph.ts`
   - Use LangGraph native patterns
   - Tool definitions for LangGraph; contracts in Next.js for validation

2. **Create prompt templates** in `apps/langgraph-service/src/graphs/<feature>/<graph>.prompt.ts`
   - Versioned text; tracked in git
   - `prompt_hash` computed by LangGraph Server or adapter

3. **Configure assistant ID** in environment
   - Add `AI_LANGGRAPH_ASSISTANT_ID_<FEATURE>` config
   - Maps feature → assistant/graph deployment

4. **Next.js calls via adapter** (never imports graph)
   - Route calls ai_runtime; runtime selects `LangGraphServerAdapter`
   - Adapter calls LangGraph Server, translates stream → AiEvents

---

## Caller Types

| Type             | Required Fields                                                      | Usage                              |
| ---------------- | -------------------------------------------------------------------- | ---------------------------------- |
| `LlmCaller`      | `billingAccountId`, `virtualKeyId`, `requestId`, `traceId`           | Direct LLM calls (no graph)        |
| `GraphLlmCaller` | All above + `graphRunId`, `graphName`, `graphVersion` (all required) | LLM calls within a graph execution |

**Type safety invariant:** `LlmCaller` has NO `graphRunId` field. `GraphLlmCaller` extends `LlmCaller` with REQUIRED graph fields. Do NOT make `graphRunId` optional on base type.

---

## Prompt Hash Canonicalization

### Location

`src/shared/ai/prompt-hash.ts` — canonical implementation

### Canonical Payload Fields

| Field                 | Included         | Notes                                          |
| --------------------- | ---------------- | ---------------------------------------------- |
| `prompt_hash_version` | Yes              | Version tag embedded in payload (e.g., `'v1'`) |
| `model`               | Yes              | Model identifier                               |
| `messages`            | Yes              | Array of `{ role, content }`                   |
| `temperature`         | Yes              | Float                                          |
| `max_tokens`          | Yes              | Integer                                        |
| `tools`               | Yes (if present) | Tool definitions array                         |

### Excluded from Hash

- `request_id`, `trace_id`, `user`, `metadata` (correlation/billing fields)

### Single Computation Site (InProc Only)

**Invariant:** For `inproc` executor, only `src/adapters/server/ai/litellm.adapter.ts` computes `promptHash`. For `langgraph_server`, promptHash is not available in P0—LangGraph Server owns its own telemetry.

---

## Graph Execution Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ ROUTE (src/app/api/v1/ai/chat/route.ts)                             │
│ - Calls ai_runtime.runChatStream()                                  │
│ - Consumes AiEvents from runtime                                    │
│ - Maps AiEvents → Data Stream Protocol (official helper)            │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ AI RUNTIME (src/features/ai/services/ai_runtime.ts)                 │
│ - Generates runId, derives tenant-scoped thread_id                  │
│ - Selects adapter via GraphExecutorPort                             │
│ - RunEventRelay: pumps stream to completion (billing-independent)   │
│ - Fans out: UI subscriber + billing subscriber (+ history optional) │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ GRAPH EXECUTOR PORT (src/ports/graph-executor.port.ts)              │
│ - Unified interface for all graph execution                         │
│ - Returns { stream: AsyncIterable<AiEvent>, final: Promise }        │
└─────────────────────────────────────────────────────────────────────┘
                              │
            ┌─────────────────┼─────────────────┐
            ▼                 ▼                 ▼
┌───────────────────┐ ┌───────────────┐ ┌───────────────────┐
│ LangGraphServer   │ │ InProc        │ │ ClaudeSdk         │
│ Adapter (P0)      │ │ Adapter       │ │ Adapter (P2)      │
│ ─────────────     │ │ ─────         │ │ ───────           │
│ Calls external    │ │ Wraps         │ │ Calls Anthropic   │
│ LangGraph Server  │ │ completion.ts │ │ SDK directly      │
│ via HTTP/WS       │ │               │ │                   │
└───────────────────┘ └───────────────┘ └───────────────────┘
            │                 │                 │
            └─────────────────┼─────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ ALL ADAPTERS EMIT (normalized):                                     │
│ - AiEvents (text_delta, assistant_final, done, error)               │
│ - usage_report with UsageFact (executorType required)               │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ TELEMETRY (src/features/ai/services/telemetry.ts)                   │
│ - Writes ai_invocation_summaries row per LLM call                   │
│ - Enforces: if graphRunId → graph_name + graph_version non-null     │
└─────────────────────────────────────────────────────────────────────┘
```

**Note:** Per `P0_NO_TOOL_EVENT_STREAMING`: LangGraph Server adapter emits `text_delta`, `assistant_final`, `usage_report`, `done` only. Tool events (`tool_call_start`/`tool_call_result`) are `inproc` executor only in P0. ToolRunner is InProc-specific.

---

## Streaming Integration (Chat Route)

**Separation of concerns:**

- **ai_runtime** emits AiEvents (text_delta, tool_call_start, tool_call_result, usage_report, done)
- **route.ts** maps AiEvents → Data Stream Protocol using official assistant-ui helper

Do NOT invent custom SSE event vocabulary. Do NOT encode protocol in runtime.

### AiEvent Types (Runtime Output)

| Event              | Fields                                        | Emitter                   |
| ------------------ | --------------------------------------------- | ------------------------- |
| `text_delta`       | `delta: string`                               | Adapter (from LLM stream) |
| `tool_call_start`  | `toolCallId`, `toolName`, `args`              | ToolRunner                |
| `tool_call_result` | `toolCallId`, `result` (redacted), `isError?` | ToolRunner                |
| `usage_report`     | `fact: UsageFact`                             | Adapter (for billing)     |
| `done`             | —                                             | Adapter                   |

### Wire Format (Route Output)

Route maps AiEvents to assistant-ui Data Stream Protocol:

- **Text deltas:** assistant-ui text chunk type
- **Tool calls:** assistant-ui tool-call parts with stable `toolCallId`
- **Tool results:** assistant-ui tool-result parts with redacted output

### Tool UI Registration

- Tool names are stable API identifiers (snake_case)
- Every tool has Zod `inputSchema` and `outputSchema`
- Frontend components keyed by `toolName`; provide `ToolFallback` for unregistered tools
- Stream only UI-safe content: summaries, references, execution status; redact secrets/large payloads

### ToolCallId Stability

**Model-initiated:** Use model's `tool_call.id` directly

**Graph-initiated:** Generate UUID at tool-runner boundary; same `toolCallId` across all stream chunks (start→args→result)

**Never use `span_id` as `toolCallId`** — span_id is for tracing UI only.

### Stream Redaction

**Redaction ownership:**

- **ToolRunner** redacts tool payloads per allowlist before emitting AiEvents
- **Route** may apply final transport-level truncation as last-mile enforcement

**Prod:** Redact full payloads; stream summaries + references + status only

**Eval/CI:** Capture full artifacts out-of-band (Langfuse datasets or `evals/artifacts/` files); stream redacted payloads same as prod

**Allowlist per tool:** Define which result fields are UI-safe (e.g., `query`, `resultCount`, `topUrl` for search; redact full documents)

---

## Correlation ID Requirements

### Essential (Always Required)

| ID              | Scope                     | Persisted To                             |
| --------------- | ------------------------- | ---------------------------------------- |
| `request_id`    | One per inbound request   | ai_invocation_summaries, charge_receipts |
| `trace_id`      | One per distributed trace | ai_invocation_summaries                  |
| `invocation_id` | One per LLM call attempt  | ai_invocation_summaries (UNIQUE)         |

### Essential for Graphs

| ID              | Scope                   | Persisted To            |
| --------------- | ----------------------- | ----------------------- |
| `graph_run_id`  | One per graph execution | ai_invocation_summaries |
| `graph_name`    | Graph identifier        | ai_invocation_summaries |
| `graph_version` | Git SHA at build        | ai_invocation_summaries |

**Enforcement:** If `graph_run_id` is present, `graph_name` and `graph_version` must be non-null.

### Nice-to-Have (Nullable)

| ID                  | Scope             | Notes                                 |
| ------------------- | ----------------- | ------------------------------------- |
| `langfuse_trace_id` | Langfuse-specific | Equals trace_id when Langfuse enabled |
| `litellm_call_id`   | LiteLLM call ID   | Null on errors; join to /spend/logs   |

---

## Tool Structure

### Contract + Implementation (feature-scoped)

| File                                   | Contents                                          |
| -------------------------------------- | ------------------------------------------------- |
| `src/features/ai/tools/<tool>.tool.ts` | Zod schemas, allowlist, pure `execute()` function |

Tool implementations receive port dependencies via injection. No direct adapter imports.

### Registry (in features)

| File                               | Contents                     |
| ---------------------------------- | ---------------------------- |
| `src/features/ai/tool-registry.ts` | Name→BoundTool map, bindings |

### ToolRunner Execution

**Return shape:** `{ok:true, value}` | `{ok:false, errorCode, safeMessage}`

**Error codes:** `validation` | `execution` | `unavailable` | `redaction_failed`

**Pipeline order (fixed):**

1. Validate args (Zod inputSchema)
2. Execute tool implementation
3. Validate result (Zod outputSchema)
4. Redact per allowlist (hard-fail if missing)
5. Emit `tool_call_result` AiEvent
6. Return result shape

**Invariant:** Validation/redaction failures still emit `tool_call_result` error event with same `toolCallId`. Never pass-through unknown fields.

### Drift Guardrail

If a tool contract is used by 2+ features or any Operator service, move to shared location:

- **Temporary:** `src/shared/ai/contracts/`
- **Post-split:** Package in `packages/`

**Port guidance:** One port per external system, NOT per tool.

| Port              | Backs Tools            |
| ----------------- | ---------------------- |
| `KnowledgePort`   | RAG search, doc lookup |
| `WebResearchPort` | Web search, URL fetch  |
| `RepoPort`        | Code search, file read |
| `McpPort`         | MCP server calls       |

### UI Registration

Tool names are stable API contracts:

- Zod schemas for `inputSchema` and `outputSchema` serve both UI rendering and eval validation
- Frontend component registry by `toolName` (e.g., `knowledge_search` → `<KnowledgeSearchUI />`)
- Always provide `ToolFallback` for unregistered tools in the UI
- Never stream full artifacts; stream summaries with reference IDs/URLs instead

---

## When to Package

Create packages only when criteria are met:

| Criterion                  | When to Package                                      |
| -------------------------- | ---------------------------------------------------- |
| **Cross-repo stability**   | Node + Operator need same contract (post-split)      |
| **Multi-deployable reuse** | Same code consumed by 2+ services without divergence |
| **Boundary enforcement**   | Hard isolation needed (no IO imports)                |

**Do NOT package:**

- Graphs before proven cross-service reuse
- Tool contracts used by single feature
- Patterns used only once

---

## Anti-Patterns

1. **No graph imports in Next.js** — All graph code in `apps/langgraph-service/`. Next.js communicates via adapter only.
2. **No raw thread_id from client** — Always derive server-side with tenant prefix (`${accountId}:${threadKey}`)
3. **No graphs in routes** — Routes call ai_runtime; runtime uses GraphExecutorPort
4. **No multiple done events** — Adapter emits exactly one `done` and resolves `final` exactly once per run
5. **No port-per-tool** — Ports per external system; tools compose on top
6. **No optional graphRunId in graph APIs** — Use distinct caller types with required fields
7. **No span_id persistence** — span_id is for tracing UI only; not a durable join key
8. **No premature packaging** — Package only after proven cross-service reuse
9. **No full tool artifacts in user stream** — Stream UI-safe summaries + status + references; capture full artifacts out-of-band
10. **No custom SSE event vocabulary** — Route maps AiEvents to Data Stream Protocol via official helper
11. **No protocol encoding in runtime** — Runtime emits AiEvents only; route handles wire protocol
12. **No rebuild of LangGraph Server capabilities** — Use checkpoints/threads/runs as-is; don't duplicate in `run_artifacts`
13. **No executor-specific billing logic** — `UsageFact` is normalized; adapters translate to common shape

---

## Related Docs

- [LANGGRAPH_SERVER.md](LANGGRAPH_SERVER.md) — External runtime MVP, adapter implementation
- [AI_SETUP_SPEC.md](AI_SETUP_SPEC.md) — P0/P1/P2 checklists, ID map, invariants
- [GRAPH_EXECUTION.md](GRAPH_EXECUTION.md) — Billing idempotency, pump+fanout
- [USAGE_HISTORY.md](USAGE_HISTORY.md) — Artifact caching (executor-agnostic)
- [TOOL_USE_SPEC.md](TOOL_USE_SPEC.md) — Tool execution invariants
- [AI_EVALS.md](AI_EVALS.md) — Eval harness structure, CI gates
- [ARCHITECTURE.md](ARCHITECTURE.md) — Hexagonal layers

---

**Last Updated**: 2025-12-22
**Status**: Design Approved (External Runtime)
