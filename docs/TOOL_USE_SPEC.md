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

---

## Implementation Checklist

### P0: First Tool End-to-End

- [ ] Add `completionStreamWithTools()` to `LlmService` port (extend existing interface)
- [ ] Implement in `litellm.adapter.ts` (parse delta.tool_calls from SSE)
- [ ] Create `generate_title` tool in `features/ai/tools/generate-title.tool.ts`
- [ ] Register in `tool-registry.ts` with binding (feature-layer, not bootstrap)
- [ ] Implement agentic loop in `chat.graph.ts` (LLM→tool→LLM cycle)
- [ ] Wire `ai_runtime.ts` to conditionally route through graph when tools present
- [ ] Uncomment route tool handling (lines 264-285) using `controller.addToolCallPart()`
- [ ] Create `GenerateTitleTool.tsx` in `features/ai/components/tools/`

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

| File                                                     | Change                                           |
| -------------------------------------------------------- | ------------------------------------------------ |
| `src/ports/llm.port.ts`                                  | Add `ToolDefinition`, `ToolCallDelta` types      |
| `src/adapters/server/ai/litellm.adapter.ts`              | Parse `delta.tool_calls` in SSE stream           |
| `src/features/ai/tools/generate-title.tool.ts`           | New: contract + pure implementation              |
| `src/features/ai/tool-registry.ts`                       | Register tool with binding                       |
| `src/features/ai/graphs/chat.graph.ts`                   | Agentic loop yielding AiEvents                   |
| `src/features/ai/services/ai_runtime.ts`                 | Route to graph when tools enabled                |
| `src/app/api/v1/ai/chat/route.ts`                        | Uncomment `addToolCallPart()` handling (264-285) |
| `src/features/ai/components/tools/GenerateTitleTool.tsx` | New: tool result UI component                    |

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

```
┌─────────────────────────────────────────────────────────────────────┐
│ LLM Call via completion.executeStream()                              │
│ - Yield text_delta events for content                                │
│ - Accumulate delta.tool_calls fragments                              │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (if finish_reason == "tool_calls")
┌─────────────────────────────────────────────────────────────────────┐
│ Tool Execution via toolRunner.exec()                                 │
│ - Yield tool_call_start event (same toolCallId)                      │
│ - Execute tool implementation                                        │
│ - Yield tool_call_result event (same toolCallId)                     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (feed results back)
┌─────────────────────────────────────────────────────────────────────┐
│ Next LLM Call with tool results in messages                          │
│ - Include assistant message with tool_calls                          │
│ - Include tool messages with results                                 │
│ - Repeat until finish_reason != "tool_calls"                         │
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

---

## Existing Infrastructure (✓ Built)

| Component                | Location                             | Status                            |
| ------------------------ | ------------------------------------ | --------------------------------- |
| AiEvent types            | `features/ai/types.ts`               | ✓ Complete                        |
| ToolContract, BoundTool  | `features/ai/types.ts`               | ✓ Complete                        |
| tool-runner.ts           | `features/ai/tool-runner.ts`         | ✓ Complete pipeline               |
| tool-registry.ts         | `features/ai/tool-registry.ts`       | ✓ Empty skeleton                  |
| chat.graph.ts            | `features/ai/graphs/chat.graph.ts`   | ✓ Empty skeleton                  |
| Route tool handling      | `app/api/v1/ai/chat/route.ts`        | ✓ Written but commented (264-285) |
| ai_runtime.ts            | `features/ai/services/ai_runtime.ts` | ✓ Direct LLM only                 |
| LlmCaller/GraphLlmCaller | `ports/llm.port.ts`                  | ✓ Types defined                   |

---

## Related Documents

- [AI_SETUP_SPEC.md](AI_SETUP_SPEC.md) — Correlation IDs, telemetry invariants
- [LANGGRAPH_AI.md](LANGGRAPH_AI.md) — Architecture, anti-patterns

---

**Last Updated**: 2025-12-21
**Status**: Draft
