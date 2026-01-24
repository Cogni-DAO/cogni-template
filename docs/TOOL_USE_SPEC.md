# Tool Use Specification

> [!CRITICAL]
> Tools execute via `toolRunner.exec()` only. Route maps AiEvents to `assistant-stream` format via `controller.addToolCallPart()`.

## Core Invariants

1. **TOOLS_VIA_TOOLRUNNER**: All tool execution flows through `toolRunner.exec()` for ALL executors (InProc, langgraph dev, server). LangChain tool wrappers (`@cogni/langgraph-graphs`) must delegate to `toolRunner.exec()` to preserve validation/redaction pipeline. No direct tool implementation calls. No executor-specific bypass paths.

2. **TOOLS_IN_PACKAGES**: Tool contracts + implementations in `@cogni/ai-tools`. Semantic types (`ToolSpec`, `ToolInvocationRecord`) in `@cogni/ai-core/tooling/`. Wire adapters (OpenAI/Anthropic encoders/decoders) in adapters layer. LangChain wrappers in `@cogni/langgraph-graphs/runtime`. Binding in composition roots only. No tool definitions in `src/**`.

3. **TOOLS_IO_VIA_CAPABILITIES**: Tools receive IO capabilities as injected interfaces (defined in packages). No direct adapter/env imports in tool code. Capabilities are bound to adapters in composition roots.

4. **REDACTION_REQUIRED**: Every tool must define deterministic redaction for UI/telemetry outputs. Allowlist is the required mechanism—output fields not in allowlist are stripped. Missing redaction config = error event, not silent pass-through.

5. **TOOLCALLID_STABLE**: Same ID across start→result. Model-provided or UUID at boundary.

6. **LANGGRAPH_OWNS_GRAPHS**: Agentic loops via `@cogni/langgraph-graphs`. No `@langchain/*` imports in `src/**`. See [LANGGRAPH_AI.md](LANGGRAPH_AI.md).

7. **STREAM_VIA_ASSISTANT_STREAM**: Use `assistant-stream` package only. No custom SSE.

8. **DECODER_ASSEMBLES_TOOLCALLS**: Wire decoders (e.g., `OpenAIToolDecoder`) are the single assemblers of streamed tool deltas into `ToolInvocationRecord`. `litellm.adapter.ts` delegates to the decoder; it does not implement assembly logic itself. Assembly state is scoped to a single decode session and reset between calls. Graph executes tools only from decoded records, never from raw deltas.

9. **BINDING_IN_COMPOSITION_ROOT**: Tool binding (connecting contracts to ports/deps) occurs only in composition roots: `src/bootstrap/**` (Next.js) or `packages/langgraph-server/**` (LangGraph Server). Features and packages never instantiate bound tools.

10. **TOOL_SEMANTICS_CANONICAL**: The canonical tool types are semantic, not wire-format-specific:
    - `ToolSpec { name, description, inputSchema: JSONSchema7, redaction, effect }` — tool definition (compiled schema, no Zod runtime)
    - `ToolEffect = 'read_only' | 'state_change' | 'external_side_effect'` — side-effect level for policy
    - `ToolInvocationRecord { toolCallId, name, args, result, error, startedAt, endedAt, raw?: unknown }` — execution record
      `inputSchema` must conform to P0-supported JSONSchema subset; disallow `oneOf`/`anyOf`/`allOf`/`not`/`if-then-else`/`patternProperties`/complex `$ref`. Enforced by `validateToolSchemaP0()` tests.
      `raw` preserves provider-native payload for observability only; must be redacted/omitted from UI/logs, and must never influence execution or billing.
      These live in `@cogni/ai-core/tooling/`. Zod stays in `@cogni/ai-tools`; compile to JSONSchema7 before passing to core.

11. **WIRE_FORMATS_ARE_ADAPTERS**: Wire DTOs (OpenAI function-calling, Anthropic tool_use/tool_result) are adapter concerns, not core types. Encoders convert `ToolSpec` → provider wire format. Decoders convert provider responses → `ToolInvocationRecord` + tool AiEvents. This enables Anthropic richness (attachments, content blocks) without core rewrites.

12. **OPENAI_WIRE_V1_SUPPORTED**: OpenAI function-calling format is the P0 wire protocol (via LiteLLM). `OpenAIToolEncoder(ToolSpec)` produces `tools[]`. `OpenAIToolDecoder(stream)` assembles deltas into `ToolInvocationRecord`. Anthropic wire support is P1.

13. **JSON_SCHEMA7_PARAMETERS**: Tool definition `parameters` field uses full JSONSchema7 (not a simplified subset). Tool input schemas must compile deterministically from Zod → JSON Schema for wire emission. Use `zod-to-json-schema` or equivalent.

14. **NO_MANUAL_SCHEMA_DUPLICATION**: No hand-written JSON Schema objects alongside Zod schemas. The `parameters` field in wire DTOs must be derived from the contract's Zod schema via `getToolJsonSchema(contract)`. Manual duplication causes drift.

15. **GOLDEN_FIXTURES_ENFORCE_WIRE_FORMAT**: Golden fixture tests enforce wire conformance per adapter: exact key sets (no extra keys), required fields for tool definitions, correct delta assembly, and correct result message formation. Tests assert structure, not JSON key ordering.

16. **TOOL_ID_NAMESPACED**: Tool IDs use namespaced format to prevent collisions: `core__get_current_time`, `mcp__<server>__<tool>`. Uses double-underscore `__` separator for LLM provider compatibility (OpenAI allows only `[a-zA-Z0-9_-]+`). Core tools use `core__` prefix. MCP-discovered tools use `mcp__<serverId>__<toolName>`. This enables safe aggregation from multiple tool sources.

17. **EFFECT_TYPED**: Every `ToolContract` declares its effect level via `effect: ToolEffect`:
    - `read_only` — pure computation or read-only data access
    - `state_change` — modifies application state (DB writes, file writes)
    - `external_side_effect` — calls external services, sends emails, triggers webhooks
      Policy may require approval for `state_change` or `external_side_effect` tools.

18. **CATALOG_IS_EXPLICIT**: The model only sees tools from the `ToolCatalog` compiled at request time. Graphs define their `graphTools[]`; bootstrap compiles these into a catalog. No tools outside the catalog are exposed to the LLM.

19. **POLICY_IS_DATA**: Enabling/disabling a tool is a config change, not a code change. `ToolPolicy` is a data structure with explicit allowlists and limits. No bespoke conditionals scattered across tool code.

20. **DENY_BY_DEFAULT**: If a tool is not explicitly enabled by `ToolPolicy.allowedTools`, `toolRunner.exec()` rejects the call with error code `policy_denied`. Unknown or disabled tools fail loudly, never pass silently.

21. **MCP_UNTRUSTED_BY_DEFAULT**: MCP-discovered tools are treated as untrusted. They must be explicitly allowlisted per server and per tool. Newly discovered tools (via `tools/list_changed`) are NOT auto-enabled; policy must be updated explicitly. See [MCP security guidance](https://modelcontextprotocol.io/docs/concepts/security).

22. **TOOL_ID_STABILITY**: Tool IDs in `TOOL_CATALOG` are canonical and stable. ID collisions throw at catalog construction time. Never silently overwrite. Format: `core__<tool_name>` for core tools, `mcp__<server>__<tool>` for MCP tools.

23. **TOOL_CONFIG_PROPAGATION**: LangChain tool wrappers receive `RunnableConfig` as 3rd parameter. Wrappers MUST accept and use config for per-run authorization via `configurable.toolIds`. Same policy/redaction path for all executors (InProc, langgraph dev, server).

24. **TOOL_CATALOG_IS_CANONICAL**: `TOOL_CATALOG: Record<string, BoundTool>` in `@cogni/ai-tools/catalog.ts` is the single source of truth for all tool definitions. `langgraph-graphs` only wraps tools from this catalog; it does not define tool contracts.

25. **TOOL_SAME_PATH_ALL_EXECUTORS**: Same policy/redaction/audit path for dev, server, and InProc. No executor-specific bypass paths (e.g., no dev.ts that skips policy). `toLangChainTool` wrapper enforces `configurable.toolIds` allowlist for all executors.

26. **CONNECTION_ID_ONLY**: Tools requiring external auth receive `connectionId` (opaque reference), never raw credentials. Connection Broker resolves tokens at invocation time. No secrets in `configurable`, `ToolPolicyContext`, or ALS context. Applies to all authenticated tools regardless of source (`@cogni/ai-tools` or MCP). See [TENANT_CONNECTIONS_SPEC.md](TENANT_CONNECTIONS_SPEC.md).

---

## Implementation Checklist

### P0: Canonical Tool Semantics + OpenAI Wire Adapter

Per invariants **TOOL_SEMANTICS_CANONICAL**, **WIRE_FORMATS_ARE_ADAPTERS**, **OPENAI_WIRE_V1_SUPPORTED**, **JSON_SCHEMA7_PARAMETERS**, **NO_MANUAL_SCHEMA_DUPLICATION**, **GOLDEN_FIXTURES_ENFORCE_WIRE_FORMAT**:

**Semantic types (`@cogni/ai-core/tooling/`):**

- [x] Create `ToolSpec { name, description, inputSchema: JSONSchema7, redaction, schemaHash? }` — tool definition (no Zod runtime, schemaHash optional for P0)
- [x] Create `ToolInvocationRecord { toolCallId, name, args, result, error, startedAtMs, endedAtMs, raw? }` — execution record
- [x] `raw` field preserves provider-native payload (Anthropic content blocks, attachments)
- [x] All internal tool logic uses these types; wire formats are adapter concerns

**Schema compilation (`@cogni/ai-tools`):**

- [x] Add `zod-to-json-schema` dependency
- [x] Create `toToolSpec(contract)` in `@cogni/ai-tools/schema.ts` — compiles contract → `ToolSpec` with JSONSchema7
- [ ] P0 schema subset validation (rejects oneOf/anyOf/allOf/not/if-then-else/patternProperties) — deferred post-P0
- [x] ~~Remove manual JSON Schema in `chat.runner.ts`~~ — runners deleted; `LangGraphInProcProvider` uses `toToolSpec()` via package

**OpenAI wire adapter (`src/adapters/server/ai/`):**

> Note: P0 uses LangGraph's `createReactAgent` which handles tool call assembly internally. Explicit encoder/decoder is P1 for non-LangGraph paths.

- [ ] `OpenAIToolEncoder(ToolSpec)` → `tools[]` for LLM request (P1: non-LangGraph paths)
- [ ] `OpenAIToolDecoder(stream)` → `ToolInvocationRecord` + tool AiEvents (P1)
- [ ] Replace simplified `JsonSchemaObject` with proper `JSONSchema7` import (P1)

**Golden fixtures (`tests/contracts/`):**

- [ ] `openai-tool-wire-format.test.ts` — tool definition serialization (P1)
- [ ] `tool-call-delta-assembly.test.ts` — stream delta accumulation (P1)
- [x] Tool replay test — `tests/stack/ai/chat-tool-replay.stack.test.ts`

### P0: First Tool End-to-End ✅

**Port layer:**

- [x] Add tool types to `llm.port.ts`: `LlmToolDefinition`, `LlmToolCall`, `LlmToolCallDelta`, `LlmToolChoice`
- [x] Tools passed via `GraphRunRequest.toolIds` → `configurable.toolIds`

**Package layer:**

- [x] Create `get_current_time` tool in `@cogni/ai-tools/tools/get-current-time.ts`
- [x] Create `@cogni/ai-tools` package with ToolContract, BoundTool types
- [x] Create `toLangChainTool()` converter in `@cogni/langgraph-graphs/runtime/`
- [x] Agentic loop via `createReactAgent` in `@cogni/langgraph-graphs` (LLM→tool→LLM works)

**Provider layer:**

- [x] `LangGraphInProcProvider` wires tools from `TOOL_CATALOG` to graph
- [x] `createToolRunner()` with policy enforcement at runtime

**Contract layer:**

- [x] Extend `AssistantUiInputSchema` to accept tool-call/tool-result message parts
- [x] Add JSONValue schema for JSON-serializable validation (finite numbers, no cyclic refs)
- [x] Add cross-field constraints: role-based content type, exactly 1 tool-result per tool message
- [x] Add size limits: toolCallId max 128, args max 8KB, result max 32KB
- [x] Extend `toMessageDtos()` in route to convert tool messages to downstream format
- [x] Add `validateToolCallIdConsistency()` for orphan tool-result detection
- [x] Add regression tests (`tests/contract/ai.chat.v1.contract.test.ts`)

**Route layer:**

- [x] Route tool handling using `controller.addToolCallPart()` (lines 274-294)

**UI layer (optional for MVP):**

- [ ] Create `ToolFallback.tsx` for generic tool display

#### Chores

- [ ] Observability [observability.md](../.agent/workflows/observability.md)
- [ ] Documentation [document.md](../.agent/workflows/document.md)

### P0: Tool Policy Enforcement

Per invariants **EFFECT_TYPED**, **POLICY_IS_DATA**, **DENY_BY_DEFAULT**, **TOOL_ID_NAMESPACED**:

- [x] Add `ToolEffect` type to `@cogni/ai-core/tooling/types.ts`
- [x] Add `effect: ToolEffect` field to `ToolContract` in `@cogni/ai-tools`
- [x] Add `effect: ToolEffect` field to `ToolSpec` in `@cogni/ai-core`
- [x] Update existing tools with effect declarations (`get_current_time` → `read_only`)
- [x] Create `ToolPolicy` interface in `@cogni/ai-core/tooling/runtime/tool-policy.ts`
- [x] Create `ToolCatalog` interface in `src/shared/ai/tool-catalog.ts`
- [x] Move `tool-runner.ts` to `@cogni/ai-core/tooling/tool-runner.ts`
- [x] Update `toolRunner.exec()` to accept and enforce `ToolPolicy`
- [x] Add `policy_denied` to `ToolErrorCode` union
- [x] Add namespace prefix to tool names (`core__get_current_time`)
- [x] Add test: deny-by-default (unknown tool name must fail)
- [x] Add test: policy filter (tool in contracts but not in policy must not execute)
- [x] Add test: require_approval treated as deny in P0 (tool-runner.test.ts)
- [x] Add test: catalog filtering uses policy.decide() (tool-catalog.test.ts)

### P1: Tool Ecosystem + ToolCatalog

- [ ] `GraphLlmCaller` type enforcement (graphRunId requires graph_name + graph_version)
- [ ] Include tools in `promptHash` computation (canonical tool schema)
- [ ] `ToolFallback.tsx` for unregistered tool names
- [ ] Tool telemetry in `ai_invocation_summaries` (tool_calls count, latency)
- [ ] ToolCatalog becomes first-class (UI rendering, agent discovery)
- [ ] Tenant/role-based ToolPolicy via config (use Casbin if complex)
- [ ] Human-in-the-loop approval for `state_change`/`external_side_effect` tools

### P2: MCP + Dynamic Tool Sources

Per invariant **MCP_UNTRUSTED_BY_DEFAULT**:

- [ ] Create `ToolProvider` interface: `StaticToolProvider` + `McpToolProvider`
- [ ] MCP tool discovery via `tools/list` (read-only; no auto-enable)
- [ ] Handle `tools/list_changed`: refresh catalog, keep policy unchanged
- [ ] MCP tool ID format: `mcp:<serverId>:<toolName>`
- [ ] Add test: MCP drift (newly discovered tool not enabled until policy changes)
- [ ] Consider OPA/Cedar if centralized policy infrastructure needed

### P3: Graph-as-Tool (Subagents)

- [ ] Create `GraphTool` contract: implementation calls `GraphExecutorPort.runGraph()`
- [ ] Enforce `allowedGraphs` allowlist
- [ ] Enforce `maxDepth = 1` (no recursive subgraphs in P3)
- [ ] Enforce strict budgets (time/tokens/USD)
- [ ] Enforce bounded output (summary-first)
- [ ] LangGraph interrupts for human-in-the-loop approval

### PX: Advanced (Do NOT Build Yet)

- [ ] Multi-tool parallel execution
- [ ] Tool result streaming (partial results)

---

## File Pointers (P0)

| File                                                  | Change                                                                               |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `src/contracts/ai.chat.v1.contract.ts`                | Extended: tool-call/tool-result parts, JSONValue, cross-field validation             |
| `src/app/api/v1/ai/chat/route.ts`                     | Extended: `toMessageDtos()` handles tool messages, `validateToolCallIdConsistency()` |
| `tests/contract/ai.chat.v1.contract.test.ts`          | New: regression tests for tool message validation                                    |
| `@cogni/ai-core/tooling/types.ts`                     | New: `ToolSpec`, `ToolInvocationRecord` — canonical semantic types                   |
| `@cogni/ai-tools/schema.ts`                           | New: `toToolSpec(contract)` — compiles Zod contract → ToolSpec                       |
| `src/adapters/server/ai/openai-tool-encoder.ts`       | New: `OpenAIToolEncoder(ToolSpec)` → `tools[]`                                       |
| `src/adapters/server/ai/openai-tool-decoder.ts`       | New: `OpenAIToolDecoder(stream)` → `ToolInvocationRecord` + AiEvents                 |
| `src/adapters/server/ai/litellm.adapter.ts`           | Use encoder/decoder; parse `delta.tool_calls` in SSE stream                          |
| `src/adapters/server/ai/langgraph/inproc.provider.ts` | Uses tool contracts from catalog; schemas compiled via `@cogni/ai-tools`             |
| `@cogni/ai-tools/tools/get-current-time.ts`           | Contract + implementation with capability injection                                  |
| `@cogni/ai-tools/capabilities/*.ts`                   | Capability interfaces (e.g., Clock) for tool IO                                      |
| `@cogni/langgraph-graphs/runtime/langchain-tools.ts`  | `toLangChainTool()` wrapper for LangGraph execution                                  |
| `src/bootstrap/ai/tools.bindings.ts`                  | Bind capabilities → adapters for Next.js runtime                                     |
| `src/app/api/v1/ai/chat/route.ts`                     | Uncomment `addToolCallPart()` handling (lines 275-285)                               |
| `src/features/ai/components/tools/ToolFallback.tsx`   | New: generic tool result UI component (optional for MVP)                             |
| `tests/contracts/openai-tool-wire-format.test.ts`     | New: golden fixture tests for OpenAI wire format conformance                         |
| `tests/contracts/tool-invocation-record.test.ts`      | New: semantic record lifecycle tests                                                 |
| `src/shared/ai/tool-policy.ts`                        | New: `ToolPolicy` interface for deny-by-default enforcement                          |
| `src/shared/ai/tool-catalog.ts`                       | New: `ToolCatalog` interface for explicit tool visibility                            |
| `tests/unit/ai/tool-policy.test.ts`                   | New: deny-by-default + policy filter tests                                           |

---

## Design Decisions

### 1. Tool Architecture

| Layer            | Location                                        | Owns                                                                        |
| ---------------- | ----------------------------------------------- | --------------------------------------------------------------------------- |
| Semantic types   | `@cogni/ai-core/tooling/types.ts`               | `ToolSpec`, `ToolEffect`, `ToolExecResult`, `ToolInvocationRecord` — no Zod |
| Contract         | `@cogni/ai-tools/tools/*.ts`                    | Zod schema, allowlist, name, description, effect, redaction                 |
| Implementation   | `@cogni/ai-tools/tools/*.ts`                    | `execute(ctx, args)` — IO via injected capabilities                         |
| Schema compiler  | `@cogni/ai-tools/schema.ts`                     | `toToolSpec(contract)` — compiles Zod → ToolSpec with JSONSchema7           |
| Wire encoder     | `src/adapters/server/ai/*-encoder.ts`           | `ToolSpec` → provider wire format (OpenAI, Anthropic)                       |
| Wire decoder     | `src/adapters/server/ai/*-decoder.ts`           | Provider response → `ToolInvocationRecord` + AiEvents                       |
| Policy           | `@cogni/ai-core/tooling/runtime/tool-policy.ts` | `ToolPolicy` — allowlist, effect requirements, budgets                      |
| Catalog          | `src/shared/ai/tool-catalog.ts`                 | `ToolCatalog` — explicit tool visibility for LLM                            |
| Runner           | `@cogni/ai-core/tooling/tool-runner.ts`         | `createToolRunner` — canonical execution pipeline                           |
| Capability iface | `@cogni/ai-tools/capabilities/*.ts`             | Minimal interfaces tools depend on (e.g., Clock)                            |
| LangChain wrap   | `@cogni/langgraph-graphs/runtime/`              | `toLangChainTool()` converter (delegates to toolRunner)                     |
| Binding (Next)   | `src/bootstrap/**`                              | Wire capabilities → adapters for Next.js runtime                            |
| Binding (Server) | `packages/langgraph-server/bootstrap/`          | Wire capabilities → adapters for LangGraph Server                           |
| IO Adapter       | `src/adapters/server/**`                        | Capability implementation                                                   |

**Rules:**

- Semantic types (`ToolSpec`, `ToolInvocationRecord`) in `@cogni/ai-core` — no Zod runtime dependency.
- Tool contracts (with Zod) in `@cogni/ai-tools`; compile to `ToolSpec` before passing to core.
- Wire formats (OpenAI, Anthropic) are adapter concerns — encoders/decoders in `src/adapters/`.
- IO allowed only via injected capabilities — no adapter/env imports in tools.
- Binding in composition roots only.

**Note:** Per **TOOL_SEMANTICS_CANONICAL** and **WIRE_FORMATS_ARE_ADAPTERS**, the canonical types are semantic (not wire-format-specific). OpenAI function-calling is P0 via `OpenAIToolEncoder`/`OpenAIToolDecoder`. Future Anthropic adapter would add `AnthropicToolEncoder`/`AnthropicToolDecoder` mapping `tool_use`/`tool_result` content blocks to the same `ToolInvocationRecord`, preserving rich attachments in `raw`.

### 2. Tool Policy Architecture (P0)

Per invariants **EFFECT_TYPED**, **CATALOG_IS_EXPLICIT**, **POLICY_IS_DATA**, **DENY_BY_DEFAULT**:

```typescript
// @cogni/ai-core/tooling/types.ts
type ToolEffect = 'read_only' | 'state_change' | 'external_side_effect';

/** Result of toolRunner.exec() — includes toolCallId for correlation */
interface ToolExecResult {
  readonly toolCallId: string;  // Always present (generated if not provided)
  readonly ok: boolean;
  readonly value?: unknown;     // Any JSON-serializable value (not Record<string, unknown>)
  readonly errorCode?: ToolErrorCode;
  readonly safeMessage?: string;
}

// @cogni/ai-tools/types.ts (ToolContract adds effect)
interface ToolContract<...> {
  name: string;
  description: string;
  inputSchema: ZodSchema;
  outputSchema: ZodSchema;
  effect: ToolEffect;         // NEW: required
  redaction: RedactionConfig;
}

// @cogni/ai-core/tooling/runtime/tool-policy.ts (canonical location)
type ToolPolicyDecision = 'allow' | 'deny' | 'require_approval';

/** Minimal context for policy decisions. P0: runId only. P1+: add caller, tenant, role. */
interface ToolPolicyContext {
  readonly runId: string;
}

interface ToolPolicy {
  /** Explicit allowlist of tool IDs that may execute */
  allowedTools: readonly string[];
  /** Effects that require approval before execution (P1: human-in-the-loop) */
  requireApprovalForEffects?: readonly ToolEffect[];
  /** Runtime budgets per tool invocation */
  budgets?: {
    maxRuntimeMs?: number;
    maxResultBytes?: number;
  };
  /** Decide if a tool invocation is allowed. Called by createToolCatalog() and toolRunner.exec(). */
  decide(ctx: ToolPolicyContext, toolId: string, effect: ToolEffect): ToolPolicyDecision;
}

// src/shared/ai/tool-catalog.ts (P0 implementation)
/**
 * ToolCatalog: the per-request set of tools exposed to the model.
 * Built by compiling graph's ToolContracts AFTER policy.decide() filtering.
 * The model ONLY sees tools where policy.decide() returns 'allow'.
 * P0: Both 'deny' and 'require_approval' exclude tools from catalog.
 */
interface ToolCatalog {
  /** Tools exposed to the model for this request (post-policy filtering) */
  readonly tools: ReadonlyMap<string, ToolSpec>;
  /** Get tool by ID; returns undefined if not in catalog */
  get(toolId: string): ToolSpec | undefined;
  /** List all tool specs (for LLM tool parameter) */
  list(): readonly ToolSpec[];
}
```

**P0 workflow:**

1. Graph defines `graphTools: ToolContract[]` by importing from `@cogni/ai-tools`
2. `ToolPolicy` loaded from config (P0: hardcoded allowlist with TODO for P1 config loading)
3. `createToolCatalog(specs, policy)` calls `policy.decide()` for each tool:
   - Only tools where `decide()` returns `'allow'` are included
   - P0: `'deny'` and `'require_approval'` both exclude tools from catalog
4. LLM receives only tools in `ToolCatalog` (model never sees denied tools)
5. `toolRunner.exec(toolId, args)` calls `policy.decide(ctx, toolId, effect)` at runtime:
   - `allow` → execute tool
   - `deny` → error code `policy_denied`
   - `require_approval` → P0: treated as deny; P1: human-in-the-loop interrupt

**Double enforcement:** Catalog filters visibility; toolRunner enforces at runtime (defense in depth).

**No tool registry service in P0.** Graphs import their tools directly. Tool bindings live in composition roots (`src/bootstrap/ai/tool-bindings.ts`), not adapter-scoped files.

### 3. assistant-stream Tool API

Route uses `assistant-stream` controller API. See `finalizeToolCall()` in `route.ts` for the correct pattern.

**Critical:** `setResponse()` alone does NOT finalize the substream. Must call `close()` after. See Known Issues.

**Never** invent custom SSE events. Use official helper only.

### 4. Agentic Loop (chat.graph.ts)

**Critical:** Graph calls `completion.executeStream()`, never `llmService` directly. This keeps billing/telemetry/promptHash centralized.

**Critical:** Graph reads tool calls from `final.toolCalls` only—never from raw `tool_call_delta` events. The adapter assembles deltas; graph consumes assembled results.

```
┌─────────────────────────────────────────────────────────────────────┐
│ LLM Call via completion.executeStream()                              │
│ - Yield text_delta events for content                                │
│ - Adapter accumulates delta.tool_calls internally                    │
│ - Await final: { toolCalls, finishReason, ... }                      │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (if final.finishReason == "tool_calls")
┌─────────────────────────────────────────────────────────────────────┐
│ Tool Execution via toolRunner.exec() for each final.toolCalls[]      │
│ - Yield tool_call_start event (same toolCallId)                      │
│ - Parse args JSON, execute tool (or emit error if invalid)           │
│ - Yield tool_call_result event (same toolCallId)                     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (feed results back)
┌─────────────────────────────────────────────────────────────────────┐
│ Next LLM Call with tool results in messages                          │
│ - Include assistant message with tool_calls                          │
│ - Include tool messages with results                                 │
│ - Repeat until final.finishReason != "tool_calls"                    │
└─────────────────────────────────────────────────────────────────────┘
```

**Finalization:** Emit exactly one `done` event and resolve `final` exactly once—regardless of how many tool loops occurred. No side effects attached to stream iteration.

### 5. OpenAI Tool Call SSE Format

LiteLLM streams tool calls as incremental deltas:

```json
// First chunk: ID + name
{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_xxx","function":{"name":"generate_title","arguments":""},"type":"function"}]}}]}

// Subsequent chunks: argument fragments
{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\"mes"}}]}}]}
{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"sage\":\"hi\"}"}}]}}]}
```

Accumulate by `index`, parse complete JSON when done.

### 6. Tool UI Location

Tool components in `features/ai/components/tools/`. Kit cannot import features.

Register via `makeAssistantToolUI` keyed by tool name:

```typescript
export const GenerateTitleToolUI = makeAssistantToolUI({
  toolName: "generate_title",
  render: ({ args, result, status }) => { ... }
});
```

### 7. Completion Contract for Tool Calls

The `LlmCompletionResult` contract for tool calls:

- `toolCalls` is present iff `finishReason === "tool_calls"`
- Each `LlmToolCall.function.arguments` is a fully assembled JSON string (not fragments)
- Graph must NOT attempt to parse or execute tools until `final` resolves
- Adapter resets assembly state between `completionStream()` calls (per **ADAPTER_ASSEMBLES_TOOLCALLS**)

### 8. Tool Argument Parse Errors

When `toolCall.function.arguments` is invalid JSON:

1. Graph emits `tool_call_start` with the malformed toolCallId (per **TOOLCALLID_STABLE**)
2. Graph emits `tool_call_result` with error payload:
   ```typescript
   {
     ok: false,
     errorCode: "invalid_json",
     message: "Invalid tool arguments JSON"  // Safe message, no raw args leaked
   }
   ```
3. Graph continues: feed error result back to LLM as tool message for self-correction (do NOT halt)
4. LLM may retry with corrected arguments or respond with explanation

---

## Existing Infrastructure (✓ Built)

| Component                | Location                                        | Status                                         |
| ------------------------ | ----------------------------------------------- | ---------------------------------------------- |
| AiEvent types            | `@cogni/ai-core`                                | ✓ Complete                                     |
| ToolContract, BoundTool  | `@cogni/ai-tools`                               | ✓ Complete                                     |
| get_current_time tool    | `@cogni/ai-tools/tools/`                        | ✓ Complete                                     |
| tool-runner.ts           | `@cogni/ai-core/tooling/tool-runner.ts`         | ✓ Complete pipeline (canonical location)       |
| tool-policy.ts           | `@cogni/ai-core/tooling/runtime/tool-policy.ts` | ✓ ToolPolicy, createToolAllowlistPolicy        |
| Route tool handling      | `app/api/v1/ai/chat/route.ts`                   | ✓ Active (lines 274-294)                       |
| ai_runtime.ts            | `features/ai/services/ai_runtime.ts`            | ✓ Uses GraphExecutorPort (no tool routing yet) |
| LlmCaller/GraphLlmCaller | `ports/llm.port.ts`                             | ✓ Types defined                                |

---

## Known Issues

- [ ] **assistant-stream API footgun**: `setResponse()` does not finalize tool-call substream; `close()` must be called after. Current workaround: `finalizeToolCall()` helper in `route.ts`. Upstream fix pending.
- [ ] **assistant-stream chunk ordering**: Async merger does not guarantee ToolCallResult precedes FinishMessage. Chunks exist but may arrive out of order. Upstream fix needed. see `tests/stack/ai/chat-tool-replay.stack.test.ts`

---

## Related Documents

- [AI_SETUP_SPEC.md](AI_SETUP_SPEC.md) — Correlation IDs, telemetry invariants
- [LANGGRAPH_AI.md](LANGGRAPH_AI.md) — Architecture, anti-patterns
- [GRAPH_EXECUTION.md](GRAPH_EXECUTION.md) — GraphExecutorPort, billing, pump+fanout
- [TENANT_CONNECTIONS_SPEC.md](TENANT_CONNECTIONS_SPEC.md) — Authenticated tool connections

---

**Last Updated**: 2026-01-24
**Status**: Draft (Rev 4 - Added CONNECTION_ID_ONLY, fixed P0 checklist to reflect working agentic loop)
