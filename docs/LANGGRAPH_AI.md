# LangGraph AI Guide

> How to create and maintain LangGraph graphs in feature slices.

## Overview

Graphs live in feature slices, NOT in shared packages. This keeps AI logic co-located with the feature it serves and avoids premature abstraction.

**Runtime choice:** We use assistant-ui **Data Stream Protocol** (`@assistant-ui/react-data-stream`), NOT the LangGraph runtime (`@assistant-ui/react-langgraph`). Server emits DSP chunks; graphs run server-side behind ai.facade.

**Key Principle:** Graphs start in `src/features/<feature>/ai/`. Packages are only for cross-repo contracts after proven reuse across 2+ services.

---

## AI Facade Pattern

Routes and features call AI through a single facade (`src/features/ai/ai.facade.ts`), never graphs directly.

**Facade responsibilities:**

- Decides graph vs direct LLM based on task complexity
- Generates `graphRunId` for graph executions
- Returns `AsyncIterable<UiEvent>` — must yield immediately, no buffering
- Does NOT map to wire protocol (that's route's job)

**Route responsibilities:**

- Consumes UiEvents from facade
- Maps UiEvents → Data Stream Protocol using official assistant-ui helper
- Applies final transport-level truncation if needed

**When to use direct LLM (via facade):**

- Classification, routing, entity extraction
- Title/summary generation
- Simple Q&A without tools

**When to use graphs (via facade):**

- Any tool use or retrieval
- Multi-step reasoning
- Structured tool lifecycle visible in UI

---

## Creating a New Graph

### File Structure

```
src/features/<feature>/ai/
├── graphs/
│   └── <graph>.graph.ts      # Graph definition (pure logic, no IO)
├── prompts/
│   └── <graph>.prompt.ts     # Prompt templates
├── tools/
│   └── <tool>.tool.ts        # Tool contracts (Zod schema + handler interface)
└── services/
    └── <graph>.ts            # Orchestration: bridges ports, receives graphRunId from facade
```

### Step-by-Step

1. **Create graph definition** in `graphs/<graph>.graph.ts`
   - Pure logic only; no IO/adapter imports
   - Accept LLM port + toolRunner via dependency injection
   - Invoke tools only through toolRunner.exec()

2. **Create prompt templates** in `prompts/<graph>.prompt.ts`
   - Versioned text; tracked in git
   - `prompt_hash` computed by adapter for drift detection

3. **Create orchestration service** in `services/<graph>.ts`
   - Receive `graphRunId` from facade (single owner)
   - Bridge app's `LlmService` to graph's expected port
   - Pass `graph_name` + `graph_version` to telemetry

4. **Wire via ai.facade** (not directly in route)
   - Route calls ai.facade; facade decides graph vs direct
   - Facade emits UiEvents; route maps to Data Stream Protocol

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

### Single Computation Site

**Invariant:** Only `src/adapters/server/ai/litellm.adapter.ts` computes `promptHash`. Graph code never computes it.

---

## Graph Execution Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ ROUTE (src/app/api/v1/ai/chat/route.ts)                             │
│ - Calls ai.facade with request context                              │
│ - Consumes UiEvents from facade                                     │
│ - Maps UiEvents → Data Stream Protocol (official helper)            │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ AI FACADE (src/features/ai/ai.facade.ts)                            │
│ - Decides: graph vs direct LLM                                      │
│ - Generates graphRunId (once per graph invocation)                  │
│ - Emits UiEvents (text_delta, tool_call_start/result, done)         │
│ - Does NOT touch wire protocol                                      │
└─────────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌──────────────────────────┐    ┌─────────────────────────────────────┐
│ GRAPH (pure logic)       │    │ DIRECT LLM (simple tasks)           │
│ - No IO/adapters         │    │ - Classification, extraction        │
│ - Calls toolRunner only  │    │ - Title/summary generation          │
│ - Same graphRunId        │    └─────────────────────────────────────┘
└──────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ TOOL RUNNER (src/features/ai/tool-runner.ts)                        │
│ - Sole tool execution point (graphs never call impls directly)      │
│ - Generates/owns toolCallId                                         │
│ - Emits tool_call_start/result UiEvents                             │
│ - Redacts payloads per allowlist                                    │
└─────────────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ LLM ADAPTER (src/adapters/server/ai/litellm.adapter.ts)             │
│ - Computes promptHash (single call site)                            │
│ - Extracts litellmCallId, providerCostUsd                           │
└─────────────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ TELEMETRY (src/features/ai/services/completion.ts)                  │
│ - Writes ai_invocation_summaries row per LLM call                   │
│ - Enforces: if graphRunId → graph_name + graph_version non-null     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Streaming Integration (Chat Route)

**Separation of concerns:**

- **ai.facade** emits UiEvents (text_delta, tool_call_start, tool_call_result, done)
- **route.ts** maps UiEvents → Data Stream Protocol using official assistant-ui helper

Do NOT invent custom SSE event vocabulary. Do NOT encode protocol in facade.

### UiEvent Types (Facade Output)

| Event              | Fields                                        | Emitter                  |
| ------------------ | --------------------------------------------- | ------------------------ |
| `text_delta`       | `delta: string`                               | Facade (from LLM stream) |
| `tool_call_start`  | `toolCallId`, `toolName`, `args`              | ToolRunner               |
| `tool_call_result` | `toolCallId`, `result` (redacted), `isError?` | ToolRunner               |
| `done`             | —                                             | Facade                   |

### Wire Format (Route Output)

Route maps UiEvents to assistant-ui Data Stream Protocol:

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

- **ToolRunner** redacts tool payloads per allowlist before emitting UiEvents
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

### Contract (feature-scoped by default)

| File                                             | Contents                                               |
| ------------------------------------------------ | ------------------------------------------------------ |
| `src/features/<feature>/ai/tools/<tool>.tool.ts` | Tool name, Zod input/output schemas, handler interface |

### Implementation (in adapters)

| File                                | Contents                           |
| ----------------------------------- | ---------------------------------- |
| `src/adapters/tools/<tool>.impl.ts` | IO, policy checks, instrumentation |

### Registry (in features)

| File                               | Contents                                |
| ---------------------------------- | --------------------------------------- |
| `src/features/ai/tool-registry.ts` | Binds tool contracts to implementations |

### ToolRunner Execution

**Return shape:** `{ok:true, value}` | `{ok:false, errorCode, safeMessage}`

**Error codes:** `validation` | `execution` | `unavailable` | `redaction_failed`

**Pipeline order (fixed):**

1. Validate args (Zod inputSchema)
2. Execute tool implementation
3. Validate result (Zod outputSchema)
4. Redact per allowlist (hard-fail if missing)
5. Emit `tool_call_result` UiEvent
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

1. **No IO in graphs** — Tool contracts define schemas; implementations live in adapters
2. **No graphs in routes** — Routes call ai.facade; facade decides graph vs direct
3. **No direct tool calls from graphs** — Graphs invoke tools only through toolRunner.exec(); ToolRunner owns toolCallId and UiEvent emission
4. **No port-per-tool** — Ports per external system; tools compose on top
5. **No optional graphRunId in graph APIs** — Use distinct caller types with required fields
6. **No duplicate promptHash computation** — Only adapter computes; graph receives result
7. **No span_id persistence** — span_id is for tracing UI only; not a durable join key
8. **No premature packaging** — Package only after proven cross-service reuse
9. **No full tool artifacts in user stream** — Stream UI-safe summaries + status + references; capture full artifacts out-of-band. Tool lifecycle state MUST be in stream.
10. **No custom SSE event vocabulary** — Route maps UiEvents to Data Stream Protocol via official helper; never invent custom events
11. **No protocol encoding in facade** — Facade emits UiEvents only; route handles wire protocol

---

## Related Docs

- [AI_SETUP_SPEC.md](AI_SETUP_SPEC.md) — P0/P1/P2 checklists, ID map, invariants
- [AI_EVALS.md](AI_EVALS.md) — Eval harness structure, CI gates
- [ARCHITECTURE.md](ARCHITECTURE.md) — Hexagonal layers

---

**Last Updated**: 2025-12-19
**Status**: Design Approved (Feature-Centric)
