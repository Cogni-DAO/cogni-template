# Claude Agent SDK Adapter Design

> [!CRITICAL]
> This adapter wraps the Claude Agent SDK as a `GraphExecutorPort` implementation. It does NOT run LangGraph graphs inside Claude—it provides Claude Agent SDK agentic execution as an alternative executor with unified billing/telemetry.

## Core Invariants

1. **ADAPTER_NOT_RUNTIME**: `ClaudeAgentExecutor` is an adapter implementing `GraphExecutorPort`. It translates our `GraphRunRequest` into Claude Agent SDK `query()` calls—it does not attempt to run LangGraph graphs on Claude.

2. **UNIFIED_BILLING_CONTRACT**: Adapter emits `UsageFact` with `source: 'anthropic_sdk'`, `executorType: 'claude_sdk'`. Uses `SDKResultMessage.total_cost_usd` for billing. `usageUnitId` is `session_id`.

3. **TOOL_BRIDGING_VIA_MCP**: Claude SDK tools are bridged via in-process MCP server (`createSdkMcpServer`). Each allowed `toolId` from `GraphRunRequest.toolIds` is registered as an MCP tool that delegates to `ToolRunner.exec()`.

4. **NO_LANGCHAIN_IN_ADAPTER**: Adapter imports only `@anthropic-ai/claude-agent-sdk` and `@cogni/ai-core`. No LangGraph or LangChain dependencies.

---

## Implementation Checklist

### P0: MVP Critical - Basic Execution

- [ ] Create `ClaudeAgentExecutor` implementing `GraphExecutorPort` in `src/adapters/server/ai/claude-sdk/`
- [ ] Implement `query()` wrapper: translate `GraphRunRequest` → SDK `query({prompt, options})`
- [ ] Map SDK streaming messages to `AiEvent` stream (`SDKPartialAssistantMessage` → `TextDeltaEvent`)
- [ ] Extract `SDKResultMessage` for `GraphFinal` construction
- [ ] Emit `UsageReportEvent` with `UsageFact` from `SDKResultMessage.total_cost_usd`

#### Chores

- [ ] Observability instrumentation [observability.md](../.agent/workflows/observability.md)
- [ ] Documentation updates [document.md](../.agent/workflows/document.md)

### P1: Tool Bridging

- [ ] Create `createCogniMcpBridge(toolContracts, toolExecFn)` helper
- [ ] Register bridge as in-process MCP server via `createSdkMcpServer()`
- [ ] Wire tool policy: only `toolIds` from request are registered
- [ ] Emit `ToolCallStartEvent`/`ToolCallResultEvent` via `PostToolUse` hook

### P2: Agent Catalog Integration (Optional/Future)

- [ ] Evaluate if Claude SDK agents should appear in `AgentCatalogPort`
- [ ] Create `ClaudeAgentCatalogProvider` if multi-agent discovery needed
- [ ] **Do NOT build this preemptively**

---

## File Pointers (P0 Scope)

| File                                                | Change                                                      |
| --------------------------------------------------- | ----------------------------------------------------------- |
| `src/adapters/server/ai/claude-sdk/executor.ts`     | New: `ClaudeAgentExecutor` implementing `GraphExecutorPort` |
| `src/adapters/server/ai/claude-sdk/event-mapper.ts` | New: SDK message → AiEvent translation                      |
| `src/adapters/server/ai/claude-sdk/index.ts`        | New: Barrel export                                          |
| `src/adapters/server/index.ts`                      | Export ClaudeAgentExecutor                                  |
| `src/bootstrap/graph-executor.factory.ts`           | Wire ClaudeAgentExecutor into aggregator                    |
| `packages/ai-core/src/usage/usage.ts`               | Verify `claude_sdk` in `ExecutorType`                       |

---

## Schema (Billing)

**Source System:** `'anthropic_sdk'`

**UsageFact mapping:**

| Field          | Source                                 |
| -------------- | -------------------------------------- |
| `usageUnitId`  | `SDKResultMessage.session_id`          |
| `costUsd`      | `SDKResultMessage.total_cost_usd`      |
| `inputTokens`  | `SDKResultMessage.usage.input_tokens`  |
| `outputTokens` | `SDKResultMessage.usage.output_tokens` |
| `model`        | `SDKSystemMessage.model`               |
| `runId`        | `GraphRunRequest.runId`                |
| `attempt`      | `0` (P0 frozen)                        |

**Idempotency key:** `${runId}/${attempt}/${session_id}`

---

## Design Decisions

### 1. SDK Integration Pattern

| Component       | Claude Agent SDK             | Our Adapter                 |
| --------------- | ---------------------------- | --------------------------- |
| **Entry Point** | `query({prompt, options})`   | `runGraph(GraphRunRequest)` |
| **Streaming**   | `AsyncGenerator<SDKMessage>` | `AsyncIterable<AiEvent>`    |
| **Final**       | `SDKResultMessage`           | `GraphFinal`                |
| **Tools**       | Built-in + MCP               | MCP bridge to `ToolRunner`  |

**Rule:** Adapter translates interfaces—it does not modify SDK behavior or inject LangGraph concepts.

---

### 2. Event Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ ClaudeAgentExecutor.runGraph(request)                               │
│ ─────────────────────────────────────                               │
│ 1. Build SDK options from GraphRunRequest                           │
│ 2. Create MCP bridge for allowed toolIds                            │
│ 3. Call query({prompt: buildPrompt(messages), options})             │
│ 4. Start event mapper async generator                               │
│ 5. Return { stream, final }                                         │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Event Mapper (transforms SDK messages)                              │
│ ───────────────────────────────────────                             │
│ - SDKPartialAssistantMessage → TextDeltaEvent                       │
│ - SDKAssistantMessage (tool_use) → ToolCallStartEvent               │
│ - PostToolUse hook callback → ToolCallResultEvent                   │
│ - SDKResultMessage → UsageReportEvent + AssistantFinalEvent + Done  │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ GraphFinal Construction                                             │
│ ─────────────────────────                                           │
│ - ok: SDKResultMessage.subtype === 'success'                        │
│ - runId: from request                                               │
│ - requestId: request.ingressRequestId                               │
│ - error: map subtype to AiExecutionErrorCode                        │
│ - content: SDKResultMessage.result                                  │
│ - usage: from SDKResultMessage.usage                                │
└─────────────────────────────────────────────────────────────────────┘
```

**Why MCP bridge?** Claude Agent SDK's tool system uses built-in tools or MCP servers. Our `ToolRunner` + `TOOL_CATALOG` is the canonical execution path. MCP bridging enables SDK tool calls to flow through our billing/telemetry pipeline.

---

### 3. Tool Bridging Architecture

```typescript
// src/adapters/server/ai/claude-sdk/mcp-bridge.ts
export function createCogniMcpBridge(
  toolContracts: BoundTool[],
  toolExecFn: ToolExecFn,
  emit: EmitAiEvent
): McpSdkServerConfigWithInstance {
  const mcpTools = toolContracts.map((contract) =>
    tool(
      contract.name,
      contract.contract.description,
      contract.contract.inputSchema,
      async (args) => {
        const result = await toolExecFn(contract.name, args);
        // MCP result format
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result.value ?? result.safeMessage),
            },
          ],
          isError: !result.ok,
        };
      }
    )
  );

  return createSdkMcpServer({
    name: "cogni-tools",
    version: "1.0.0",
    tools: mcpTools,
  });
}
```

**Policy enforcement:** Only tools in `GraphRunRequest.toolIds` are registered. SDK cannot call tools outside allowlist.

---

### 4. Error Code Mapping

| SDK `subtype`            | `AiExecutionErrorCode` |
| ------------------------ | ---------------------- |
| `success`                | (ok: true)             |
| `error_max_turns`        | `timeout`              |
| `error_during_execution` | `internal`             |
| `error_max_budget_usd`   | `rate_limit`           |

**Never** expose SDK error strings to clients—normalize at adapter boundary.

---

### 5. Configuration Options

**SDK Options from GraphRunRequest:**

| GraphRunRequest  | SDK Option                | Notes                             |
| ---------------- | ------------------------- | --------------------------------- |
| `messages`       | `prompt`                  | `buildPrompt()` formats as string |
| `model`          | `options.model`           | Pass through                      |
| `toolIds`        | MCP server registration   | Via bridge                        |
| `abortSignal`    | `options.abortController` | Wrap in AbortController           |
| `caller.traceId` | Hook logging              | For observability                 |

**Hardcoded Options:**

- `permissionMode: 'bypassPermissions'` — server-side execution, no interactive prompts
- `allowDangerouslySkipPermissions: true` — required for bypass mode
- `includePartialMessages: true` — needed for streaming
- `settingSources: []` — no filesystem settings

---

## Non-Goals

1. **Do NOT attempt 'same compiled graph artifact' across LangGraph and Claude Agent SDK** — fundamentally different execution models.

2. **Do NOT introduce runtime-aware LLM branching inside graphs** — graphs are executor-agnostic; routing happens at `GraphExecutorPort` level.

3. **Do NOT use Claude SDK for graphs requiring LangGraph-specific features** (checkpointers, interrupt/resume, multi-node state machines).

---

## Sources

- [Claude Agent SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview)
- [Claude Agent SDK TypeScript Reference](https://platform.claude.com/docs/en/agent-sdk/typescript)
- [Claude Agent SDK GitHub](https://github.com/anthropics/claude-agent-sdk-typescript)

---

**Last Updated**: 2026-01-29
**Status**: Draft
