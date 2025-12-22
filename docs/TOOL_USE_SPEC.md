# Tool Use Specification

> [!CRITICAL]
> Tools execute via `toolRunner.exec()` only. Route maps AiEvents to `assistant-stream` format via `controller.addToolCallPart()`.

## Core Invariants

1. **TOOLS_VIA_TOOLRUNNER**: All tool execution through `toolRunner.exec()`. No direct calls.

2. **TOOLS_FEATURE_SCOPED**: Tool contracts + implementations in `features/ai/tools/`. Pure functions injected with ports.

3. **TOOLS_IO_VIA_PORTS**: Tools needing IO receive port dependencies. No direct adapter imports.

4. **REDACTION_REQUIRED**: Every tool defines allowlist. Missing = error event.

5. **TOOLCALLID_STABLE**: Same ID across start→result. Model-provided or UUID at boundary.

6. **NO_LANGGRAPH_RUNTIME**: Hand-rolled agentic loop. No `@langchain/langgraph` dependency.

7. **STREAM_VIA_ASSISTANT_STREAM**: Use `assistant-stream` package only. No custom SSE.

8. **ADAPTER_ASSEMBLES_TOOLCALLS**: `litellm.adapter.ts` is the single assembler of streamed `tool_call` deltas into `final.toolCalls`. Assembly state is scoped to a single `completionStream()` call and reset between calls. Graph executes tools only from `final.toolCalls`, never from raw deltas.

---

## Implementation Checklist

### P0: First Tool End-to-End

**Port layer:**

- [ ] Add tool types to `llm.port.ts`: `LlmToolDefinition`, `LlmToolCall`, `LlmToolCallDelta`, `LlmToolChoice`
- [ ] Extend `CompletionStreamParams` with `tools?: LlmToolDefinition[]` and `toolChoice?: LlmToolChoice`
- [ ] Add `tool_call_delta` event to `ChatDeltaEvent` union
- [ ] Add `toolCalls?: LlmToolCall[]` to `LlmCompletionResult`

**Adapter layer:**

- [ ] Update `litellm.adapter.ts` to pass tools/toolChoice to LiteLLM API
- [ ] Parse SSE `delta.tool_calls` and emit `tool_call_delta` events
- [ ] Accumulate tool calls and include in final result

**Feature layer:**

- [ ] Create `get_current_time` tool in `features/ai/tools/get-current-time.tool.ts`
- [ ] Register tool in `tool-registry.ts` with contract + implementation
- [ ] Add `getLlmToolDefinitions()` converter (contract → LlmToolDefinition)
- [ ] Implement agentic loop in `chat.graph.ts` (LLM→tool→LLM cycle)

**Route layer:**

- [ ] Uncomment route tool handling (lines 275-285) using `controller.addToolCallPart()`

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

| File                                                | Change                                                           |
| --------------------------------------------------- | ---------------------------------------------------------------- |
| `src/ports/llm.port.ts`                             | Add `LlmToolDefinition`, `LlmToolCall`, `LlmToolCallDelta` types |
| `src/adapters/server/ai/litellm.adapter.ts`         | Parse `delta.tool_calls` in SSE stream, emit `tool_call_delta`   |
| `src/features/ai/tools/get-current-time.tool.ts`    | New: contract + pure implementation                              |
| `src/features/ai/tool-registry.ts`                  | Register tool, add `getLlmToolDefinitions()` converter           |
| `src/features/ai/graphs/chat.graph.ts`              | Agentic loop: accumulate deltas, execute tools, loop             |
| `src/app/api/v1/ai/chat/route.ts`                   | Uncomment `addToolCallPart()` handling (lines 275-285)           |
| `src/features/ai/components/tools/ToolFallback.tsx` | New: generic tool result UI component (optional for MVP)         |

---

## Design Decisions

### 1. Tool Architecture

| Layer          | Location                       | Owns                              |
| -------------- | ------------------------------ | --------------------------------- |
| Contract       | `features/ai/tools/*.tool.ts`  | Zod schema, allowlist, name       |
| Implementation | `features/ai/tools/*.tool.ts`  | `execute()` (pure, receives port) |
| Registry       | `features/ai/tool-registry.ts` | Name→BoundTool map                |
| IO Port        | `ports/*.port.ts`              | Interface for tools needing IO    |
| IO Adapter     | `adapters/server/**`           | Port implementation               |

**Rule:** Tools stay in features. IO via ports only. No adapter imports in tools.

**Note:** LLM port tool types (`LlmToolDefinition`, `LlmToolCall`, etc.) are OpenAI-compatible internal DTOs. LiteLLM uses OpenAI format, so no mapping needed for MVP. A future Anthropic direct adapter would map `tools[].input_schema` and `tool_use`/`tool_result` content blocks into these internal types.

### 2. assistant-stream Tool API

Route uses `assistant-stream` controller API:

```typescript
// Tool start
const toolCtrl = controller.addToolCallPart({
  toolCallId: event.toolCallId,
  toolName: event.toolName,
  args: event.args,
});

// Tool result
toolCtrl.setResponse(event.result);
```

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
| AiEvent types            | `features/ai/types.ts`               | ✓ Complete                                     |
| ToolContract, BoundTool  | `features/ai/types.ts`               | ✓ Complete                                     |
| tool-runner.ts           | `features/ai/tool-runner.ts`         | ✓ Complete pipeline                            |
| tool-registry.ts         | `features/ai/tool-registry.ts`       | ✓ Empty skeleton                               |
| chat.graph.ts            | `features/ai/graphs/chat.graph.ts`   | ✓ Empty skeleton                               |
| Route tool handling      | `app/api/v1/ai/chat/route.ts`        | ✓ Written but commented (264-285)              |
| ai_runtime.ts            | `features/ai/services/ai_runtime.ts` | ✓ Uses GraphExecutorPort (no tool routing yet) |
| LlmCaller/GraphLlmCaller | `ports/llm.port.ts`                  | ✓ Types defined                                |

---

## Related Documents

- [AI_SETUP_SPEC.md](AI_SETUP_SPEC.md) — Correlation IDs, telemetry invariants
- [LANGGRAPH_AI.md](LANGGRAPH_AI.md) — Architecture, anti-patterns
- [GRAPH_EXECUTION.md](GRAPH_EXECUTION.md) — GraphExecutorPort, billing, pump+fanout

---

**Last Updated**: 2025-12-22
**Status**: Draft
