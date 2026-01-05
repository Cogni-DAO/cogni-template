# Tool Use Specification

> [!CRITICAL]
> Tools execute via `toolRunner.exec()` only. Route maps AiEvents to `assistant-stream` format via `controller.addToolCallPart()`.

## Core Invariants

1. **TOOLS_VIA_TOOLRUNNER**: All tool execution flows through `toolRunner.exec()` for InProc execution. LangChain tool wrappers (`@cogni/langgraph-graphs`) must delegate to `toolRunner.exec()` to preserve validation/redaction pipeline. No direct tool implementation calls.

2. **TOOLS_IN_PACKAGES**: Tool contracts + implementations in `@cogni/ai-tools`. Semantic types (`ToolSpec`, `ToolInvocationRecord`) in `@cogni/ai-core/tooling/`. Wire adapters (OpenAI/Anthropic encoders/decoders) in adapters layer. LangChain wrappers in `@cogni/langgraph-graphs/runtime`. Binding in composition roots only. No tool definitions in `src/**`.

3. **TOOLS_IO_VIA_CAPABILITIES**: Tools receive IO capabilities as injected interfaces (defined in packages). No direct adapter/env imports in tool code. Capabilities are bound to adapters in composition roots.

4. **REDACTION_REQUIRED**: Every tool must define deterministic redaction for UI/telemetry outputs. Allowlist is the required mechanism—output fields not in allowlist are stripped. Missing redaction config = error event, not silent pass-through.

5. **TOOLCALLID_STABLE**: Same ID across start→result. Model-provided or UUID at boundary.

6. **LANGGRAPH_OWNS_GRAPHS**: Agentic loops via `@cogni/langgraph-graphs`. No `@langchain/*` imports in `src/**`. See [LANGGRAPH_AI.md](LANGGRAPH_AI.md).

7. **STREAM_VIA_ASSISTANT_STREAM**: Use `assistant-stream` package only. No custom SSE.

8. **DECODER_ASSEMBLES_TOOLCALLS**: Wire decoders (e.g., `OpenAIToolDecoder`) are the single assemblers of streamed tool deltas into `ToolInvocationRecord`. `litellm.adapter.ts` delegates to the decoder; it does not implement assembly logic itself. Assembly state is scoped to a single decode session and reset between calls. Graph executes tools only from decoded records, never from raw deltas.

9. **BINDING_IN_COMPOSITION_ROOT**: Tool binding (connecting contracts to ports/deps) occurs only in composition roots: `src/bootstrap/**` (Next.js) or `packages/langgraph-server/**` (LangGraph Server). Features and packages never instantiate bound tools.

10. **TOOL_SEMANTICS_CANONICAL**: The canonical tool types are semantic, not wire-format-specific:
    - `ToolSpec { name, description, inputSchema: JSONSchema7, redaction }` — tool definition (compiled schema, no Zod runtime)
    - `ToolInvocationRecord { toolCallId, name, args, result, error, startedAt, endedAt, raw?: unknown }` — execution record
      `inputSchema` must conform to P0-supported JSONSchema subset; disallow `oneOf`/`anyOf`/`allOf`/`not`/`if-then-else`/`patternProperties`/complex `$ref`. Enforced by `validateToolSchemaP0()` tests.
      `raw` preserves provider-native payload for observability only; must be redacted/omitted from UI/logs, and must never influence execution or billing.
      These live in `@cogni/ai-core/tooling/`. Zod stays in `@cogni/ai-tools`; compile to JSONSchema7 before passing to core.

11. **WIRE_FORMATS_ARE_ADAPTERS**: Wire DTOs (OpenAI function-calling, Anthropic tool_use/tool_result) are adapter concerns, not core types. Encoders convert `ToolSpec` → provider wire format. Decoders convert provider responses → `ToolInvocationRecord` + tool AiEvents. This enables Anthropic richness (attachments, content blocks) without core rewrites.

12. **OPENAI_WIRE_V1_SUPPORTED**: OpenAI function-calling format is the P0 wire protocol (via LiteLLM). `OpenAIToolEncoder(ToolSpec)` produces `tools[]`. `OpenAIToolDecoder(stream)` assembles deltas into `ToolInvocationRecord`. Anthropic wire support is P1.

13. **JSON_SCHEMA7_PARAMETERS**: Tool definition `parameters` field uses full JSONSchema7 (not a simplified subset). Tool input schemas must compile deterministically from Zod → JSON Schema for wire emission. Use `zod-to-json-schema` or equivalent.

14. **NO_MANUAL_SCHEMA_DUPLICATION**: No hand-written JSON Schema objects alongside Zod schemas. The `parameters` field in wire DTOs must be derived from the contract's Zod schema via `getToolJsonSchema(contract)`. Manual duplication causes drift.

15. **GOLDEN_FIXTURES_ENFORCE_WIRE_FORMAT**: Golden fixture tests enforce wire conformance per adapter: exact key sets (no extra keys), required fields for tool definitions, correct delta assembly, and correct result message formation. Tests assert structure, not JSON key ordering.

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
- [ ] Remove manual JSON Schema in `chat.runner.ts` — use `toToolSpec()` output

**OpenAI wire adapter (`src/adapters/server/ai/`):**

- [ ] `OpenAIToolEncoder(ToolSpec)` → `tools[]` for LLM request
- [ ] `OpenAIToolDecoder(stream)` → `ToolInvocationRecord` + tool AiEvents
- [ ] Replace simplified `JsonSchemaObject` with proper `JSONSchema7` import

**Golden fixtures (`tests/contracts/`):**

- [ ] `openai-tool-wire-format.test.ts` — tool definition serialization (exact keys, no extras)
- [ ] `tool-call-delta-assembly.test.ts` — stream delta accumulation matches OpenAI SSE format
- [ ] `tool-invocation-record.test.ts` — semantic record captures full lifecycle

### P0: First Tool End-to-End

**Port layer:**

- [x] Add tool types to `llm.port.ts`: `LlmToolDefinition`, `LlmToolCall`, `LlmToolCallDelta`, `LlmToolChoice` (migrate to ai-core)
- [ ] Extend `CompletionStreamParams` with `tools?: LlmToolDefinition[]` and `toolChoice?: LlmToolChoice`
- [ ] Add `tool_call_delta` event to `ChatDeltaEvent` union
- [ ] Add `toolCalls?: LlmToolCall[]` to `LlmCompletionResult`

**Adapter layer:**

- [ ] Update `litellm.adapter.ts` to pass tools/toolChoice to LiteLLM API
- [ ] Parse SSE `delta.tool_calls` and emit `tool_call_delta` events
- [ ] Accumulate tool calls and include in final result

**Package layer:**

- [x] Create `get_current_time` tool in `@cogni/ai-tools/tools/get-current-time.ts`
- [x] Create `@cogni/ai-tools` package with ToolContract, BoundTool types
- [x] Create `toLangChainTool()` converter in `@cogni/langgraph-graphs/runtime/`
- [ ] Implement agentic loop in `@cogni/langgraph-graphs/inproc/` (LLM→tool→LLM cycle)

**Bootstrap layer:**

- [ ] Create `src/bootstrap/ai/tools.bindings.ts` for tool binding with ports

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

### P1: Tool Ecosystem

- [ ] `GraphLlmCaller` type enforcement (graphRunId requires graph_name + graph_version)
- [ ] Include tools in `promptHash` computation (canonical tool schema)
- [ ] `ToolFallback.tsx` for unregistered tool names
- [ ] Tool telemetry in `ai_invocation_summaries` (tool_calls count, latency)

### P2: Advanced (Do NOT Build Yet)

- [ ] Multi-tool parallel execution
- [ ] Tool result streaming (partial results)

---

## File Pointers (P0)

| File                                                 | Change                                                                               |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `src/contracts/ai.chat.v1.contract.ts`               | Extended: tool-call/tool-result parts, JSONValue, cross-field validation             |
| `src/app/api/v1/ai/chat/route.ts`                    | Extended: `toMessageDtos()` handles tool messages, `validateToolCallIdConsistency()` |
| `tests/contract/ai.chat.v1.contract.test.ts`         | New: regression tests for tool message validation                                    |
| `@cogni/ai-core/tooling/types.ts`                    | New: `ToolSpec`, `ToolInvocationRecord` — canonical semantic types                   |
| `@cogni/ai-tools/schema.ts`                          | New: `toToolSpec(contract)` — compiles Zod contract → ToolSpec                       |
| `src/adapters/server/ai/openai-tool-encoder.ts`      | New: `OpenAIToolEncoder(ToolSpec)` → `tools[]`                                       |
| `src/adapters/server/ai/openai-tool-decoder.ts`      | New: `OpenAIToolDecoder(stream)` → `ToolInvocationRecord` + AiEvents                 |
| `src/adapters/server/ai/litellm.adapter.ts`          | Use encoder/decoder; parse `delta.tool_calls` in SSE stream                          |
| `src/features/ai/runners/chat.runner.ts`             | Remove manual JSON Schema, use `toToolSpec()` output                                 |
| `@cogni/ai-tools/tools/get-current-time.ts`          | Contract + implementation with capability injection                                  |
| `@cogni/ai-tools/capabilities/*.ts`                  | Capability interfaces (e.g., Clock) for tool IO                                      |
| `@cogni/langgraph-graphs/runtime/langchain-tools.ts` | `toLangChainTool()` wrapper for LangGraph execution                                  |
| `src/bootstrap/ai/tools.bindings.ts`                 | Bind capabilities → adapters for Next.js runtime                                     |
| `src/app/api/v1/ai/chat/route.ts`                    | Uncomment `addToolCallPart()` handling (lines 275-285)                               |
| `src/features/ai/components/tools/ToolFallback.tsx`  | New: generic tool result UI component (optional for MVP)                             |
| `tests/contracts/openai-tool-wire-format.test.ts`    | New: golden fixture tests for OpenAI wire format conformance                         |
| `tests/contracts/tool-invocation-record.test.ts`     | New: semantic record lifecycle tests                                                 |

---

## Design Decisions

### 1. Tool Architecture

| Layer            | Location                               | Owns                                                                   |
| ---------------- | -------------------------------------- | ---------------------------------------------------------------------- |
| Semantic types   | `@cogni/ai-core/tooling/types.ts`      | `ToolSpec` (JSONSchema7), `ToolInvocationRecord` (with `raw`) — no Zod |
| Contract         | `@cogni/ai-tools/tools/*.ts`           | Zod schema, allowlist, name, description, redaction                    |
| Implementation   | `@cogni/ai-tools/tools/*.ts`           | `execute(ctx, args)` — IO via injected capabilities                    |
| Schema compiler  | `@cogni/ai-tools/schema.ts`            | `toToolSpec(contract)` — compiles Zod → ToolSpec with JSONSchema7      |
| Wire encoder     | `src/adapters/server/ai/*-encoder.ts`  | `ToolSpec` → provider wire format (OpenAI, Anthropic)                  |
| Wire decoder     | `src/adapters/server/ai/*-decoder.ts`  | Provider response → `ToolInvocationRecord` + AiEvents                  |
| Capability iface | `@cogni/ai-tools/capabilities/*.ts`    | Minimal interfaces tools depend on (e.g., Clock)                       |
| LangChain wrap   | `@cogni/langgraph-graphs/runtime/`     | `toLangChainTool()` converter (delegates to toolRunner)                |
| Binding (Next)   | `src/bootstrap/**`                     | Wire capabilities → adapters for Next.js runtime                       |
| Binding (Server) | `packages/langgraph-server/bootstrap/` | Wire capabilities → adapters for LangGraph Server                      |
| IO Adapter       | `src/adapters/server/**`               | Capability implementation                                              |

**Rules:**

- Semantic types (`ToolSpec`, `ToolInvocationRecord`) in `@cogni/ai-core` — no Zod runtime dependency.
- Tool contracts (with Zod) in `@cogni/ai-tools`; compile to `ToolSpec` before passing to core.
- Wire formats (OpenAI, Anthropic) are adapter concerns — encoders/decoders in `src/adapters/`.
- IO allowed only via injected capabilities — no adapter/env imports in tools.
- Binding in composition roots only.

**Note:** Per **TOOL_SEMANTICS_CANONICAL** and **WIRE_FORMATS_ARE_ADAPTERS**, the canonical types are semantic (not wire-format-specific). OpenAI function-calling is P0 via `OpenAIToolEncoder`/`OpenAIToolDecoder`. Future Anthropic adapter would add `AnthropicToolEncoder`/`AnthropicToolDecoder` mapping `tool_use`/`tool_result` content blocks to the same `ToolInvocationRecord`, preserving rich attachments in `raw`.

### 2. assistant-stream Tool API

Route uses `assistant-stream` controller API. See `finalizeToolCall()` in `route.ts` for the correct pattern.

**Critical:** `setResponse()` alone does NOT finalize the substream. Must call `close()` after. See Known Issues.

**Never** invent custom SSE events. Use official helper only.

### 3. Agentic Loop (chat.graph.ts)

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

### 4. OpenAI Tool Call SSE Format

LiteLLM streams tool calls as incremental deltas:

```json
// First chunk: ID + name
{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_xxx","function":{"name":"generate_title","arguments":""},"type":"function"}]}}]}

// Subsequent chunks: argument fragments
{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\"mes"}}]}}]}
{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"sage\":\"hi\"}"}}]}}]}
```

Accumulate by `index`, parse complete JSON when done.

### 5. Tool UI Location

Tool components in `features/ai/components/tools/`. Kit cannot import features.

Register via `makeAssistantToolUI` keyed by tool name:

```typescript
export const GenerateTitleToolUI = makeAssistantToolUI({
  toolName: "generate_title",
  render: ({ args, result, status }) => { ... }
});
```

### 6. Completion Contract for Tool Calls

The `LlmCompletionResult` contract for tool calls:

- `toolCalls` is present iff `finishReason === "tool_calls"`
- Each `LlmToolCall.function.arguments` is a fully assembled JSON string (not fragments)
- Graph must NOT attempt to parse or execute tools until `final` resolves
- Adapter resets assembly state between `completionStream()` calls (per **ADAPTER_ASSEMBLES_TOOLCALLS**)

### 7. Tool Argument Parse Errors

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

| Component                | Location                             | Status                                         |
| ------------------------ | ------------------------------------ | ---------------------------------------------- |
| AiEvent types            | `@cogni/ai-core`                     | ✓ Complete                                     |
| ToolContract, BoundTool  | `@cogni/ai-tools`                    | ✓ Complete                                     |
| get_current_time tool    | `@cogni/ai-tools/tools/`             | ✓ Complete                                     |
| tool-runner.ts           | `features/ai/tool-runner.ts`         | ✓ Complete pipeline                            |
| Route tool handling      | `app/api/v1/ai/chat/route.ts`        | ✓ Active (lines 274-294)                       |
| ai_runtime.ts            | `features/ai/services/ai_runtime.ts` | ✓ Uses GraphExecutorPort (no tool routing yet) |
| LlmCaller/GraphLlmCaller | `ports/llm.port.ts`                  | ✓ Types defined                                |

---

## Known Issues

- [ ] **assistant-stream API footgun**: `setResponse()` does not finalize tool-call substream; `close()` must be called after. Current workaround: `finalizeToolCall()` helper in `route.ts`. Upstream fix pending.
- [ ] **assistant-stream chunk ordering**: Async merger does not guarantee ToolCallResult precedes FinishMessage. Chunks exist but may arrive out of order. Upstream fix needed. see `tests/stack/ai/chat-tool-replay.stack.test.ts`

---

## Related Documents

- [AI_SETUP_SPEC.md](AI_SETUP_SPEC.md) — Correlation IDs, telemetry invariants
- [LANGGRAPH_AI.md](LANGGRAPH_AI.md) — Architecture, anti-patterns
- [GRAPH_EXECUTION.md](GRAPH_EXECUTION.md) — GraphExecutorPort, billing, pump+fanout

---

**Last Updated**: 2026-01-05
**Status**: Draft (aligned with LANGGRAPH_AI.md)
