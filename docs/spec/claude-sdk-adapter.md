---
id: claude-sdk-adapter
type: spec
title: Claude Agent SDK Adapter
status: draft
spec_state: draft
trust: draft
summary: GraphExecutorPort adapter for Claude Agent SDK with in-process billing, MCP tool bridging, and streaming event mapping
read_when: Implementing or modifying the Claude Agent SDK execution adapter
implements:
owner: derekg1729
created: 2026-01-29
verified:
tags: [ai-graphs, adapters]
---

# Claude Agent SDK Adapter

## Context

Cogni supports multiple execution backends via `GraphExecutorPort`. This spec defines the adapter for the Claude Agent SDK, which runs in-process (unlike external executors like LangGraph Server or n8n). Because it's in-process, billing uses real-time capture from `message.usage` — no reconciliation needed.

> [!CRITICAL]
> This adapter wraps the Claude Agent SDK as a `GraphExecutorPort` implementation. It runs **in-process** (SDK is a library, not external service), so billing uses **real-time capture** from `message.usage`—no reconciliation needed. `usageUnitId = message.id` per LLM call.

## Goal

Standardize Claude Agent SDK execution into Cogni's auth + billing pipeline as a `GraphExecutorPort` adapter, with MCP-based tool bridging and per-message billing capture.

## Non-Goals

- Do NOT attempt "same compiled graph artifact" across LangGraph and Claude Agent SDK — fundamentally different execution models
- Do NOT introduce runtime-aware LLM branching inside graphs — graphs are executor-agnostic; routing happens at `GraphExecutorPort` level
- Do NOT use Claude SDK for graphs requiring LangGraph-specific features (checkpointers, interrupt/resume, multi-node state machines)
- Do NOT use reconciliation pattern — Claude SDK is in-process; real-time capture is simpler and more accurate

## Core Invariants

1. **ADAPTER_NOT_RUNTIME**: `ClaudeAgentExecutor` is an adapter implementing `GraphExecutorPort`. It translates our `GraphRunRequest` into Claude Agent SDK `query()` calls—it does not attempt to run LangGraph graphs on Claude.

2. **IN_PROCESS_REAL_TIME_BILLING**: Unlike external executors (LangGraph Server, n8n) which follow invariants 41-47, Claude SDK runs in-process. Billing captures `message.usage` directly from SDK responses—no async reconciliation required.

3. **USAGE_UNIT_IS_MESSAGE_ID**: Each LLM call has `usageUnitId = message.id`. Multi-turn SDK sessions produce multiple charge_receipts (one per assistant message with usage).

4. **TOOL_BRIDGING_VIA_MCP**: Claude SDK tools are bridged via in-process MCP server (`createSdkMcpServer`). Each allowed `toolId` from `GraphRunRequest.toolIds` is registered as an MCP tool that delegates to `ToolRunner.exec()`.

5. **NO_LANGCHAIN_IN_ADAPTER**: Adapter imports only `@anthropic-ai/claude-agent-sdk` and `@cogni/ai-core`. No LangGraph or LangChain dependencies.

6. **STREAM_EVENTS_ARE_AUTHORITATIVE**: Unlike external executors where stream events are UX-only (invariant 45), in-process SDK `usage_report` events ARE the authoritative billing source.

## Schema

**Source System:** `'anthropic_sdk'`

**ExecutorType:** `'claude_sdk'`

**UsageFact mapping (per assistant message):**

| Field             | Source                                            |
| ----------------- | ------------------------------------------------- |
| `usageUnitId`     | `SDKAssistantMessage.message.id`                  |
| `costUsd`         | Computed from `message.usage` + Anthropic pricing |
| `inputTokens`     | `message.usage.input_tokens`                      |
| `outputTokens`    | `message.usage.output_tokens`                     |
| `cacheReadTokens` | `message.usage.cache_read_input_tokens`           |
| `model`           | `SDKSystemMessage.model`                          |
| `runId`           | `GraphRunRequest.runId`                           |
| `attempt`         | `0` (P0 frozen)                                   |

**Idempotency key:** `${runId}/${attempt}/${message.id}`

Multi-turn sessions emit multiple `usage_report` events (one per assistant message). Each is a separate LLM call with distinct `message.id`.

## Design

### Key Decisions

### 1. SDK Integration Pattern

| Component       | Claude Agent SDK             | Our Adapter                    |
| --------------- | ---------------------------- | ------------------------------ |
| **Entry Point** | `query({prompt, options})`   | `runGraph(GraphRunRequest)`    |
| **Streaming**   | `AsyncGenerator<SDKMessage>` | `AsyncIterable<AiEvent>`       |
| **Final**       | `SDKResultMessage`           | `GraphFinal`                   |
| **Tools**       | Built-in + MCP               | MCP bridge to `ToolRunner`     |
| **Billing**     | `message.usage` per turn     | `UsageReportEvent` per message |

**Rule:** Adapter translates interfaces—it does not modify SDK behavior or inject LangGraph concepts.

### 2. Event Flow

```
ClaudeAgentExecutor.runGraph(request)
  1. Build SDK options from GraphRunRequest
  2. Create MCP bridge for allowed toolIds
  3. Call query({prompt: buildPrompt(messages), options})
  4. Start event mapper async generator
  5. Return { stream, final }
       │
       ▼
Event Mapper (transforms SDK messages)
  - SDKPartialAssistantMessage → TextDeltaEvent (streaming)
  - SDKAssistantMessage → UsageReportEvent (usageUnitId=message.id)
  - SDKAssistantMessage (tool_use) → ToolCallStartEvent
  - PostToolUse hook callback → ToolCallResultEvent
  - SDKResultMessage → AssistantFinalEvent + DoneEvent
       │
       ▼
GraphFinal Construction
  - ok: SDKResultMessage.subtype === 'success'
  - runId: from request
  - requestId: request.ingressRequestId
  - error: map subtype to AiExecutionErrorCode
  - content: SDKResultMessage.result
  - usage: aggregated from all SDKAssistantMessage.usage
```

**Why per-message billing?** SDK sessions can have multiple turns (tool use → response → tool use → response). Each turn is a separate LLM call with its own `message.id` and usage.

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

### 4. Error Code Mapping

| SDK `subtype`            | `AiExecutionErrorCode` |
| ------------------------ | ---------------------- |
| `success`                | (ok: true)             |
| `error_max_turns`        | `timeout`              |
| `error_during_execution` | `internal`             |
| `error_max_budget_usd`   | `rate_limit`           |

**Never** expose SDK error strings to clients—normalize at adapter boundary.

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

### File Pointers

| File                                                | Purpose                                                |
| --------------------------------------------------- | ------------------------------------------------------ |
| `src/adapters/server/ai/claude-sdk/executor.ts`     | `ClaudeAgentExecutor` implementing `GraphExecutorPort` |
| `src/adapters/server/ai/claude-sdk/event-mapper.ts` | SDK message → AiEvent translation                      |
| `src/adapters/server/ai/claude-sdk/mcp-bridge.ts`   | MCP tool bridge for Cogni tools                        |
| `src/adapters/server/ai/claude-sdk/index.ts`        | Barrel export                                          |
| `src/bootstrap/graph-executor.factory.ts`           | Wire ClaudeAgentExecutor into aggregator               |
| `packages/ai-core/src/usage/usage.ts`               | Verify `claude_sdk` in `ExecutorType`                  |

## Acceptance Checks

**Automated:**

- (none yet — spec_state: draft, code not implemented)

**Manual:**

1. `ClaudeAgentExecutor.runGraph()` produces streaming `AiEvent`s and correct `GraphFinal`
2. `UsageReportEvent` emitted per assistant message with `usageUnitId = message.id`
3. MCP bridge only registers tools from `GraphRunRequest.toolIds`
4. Error codes correctly mapped from SDK `subtype` to `AiExecutionErrorCode`

## Open Questions

- [ ] Should `buildPrompt()` use SDK's native message format or string concatenation?

## Related

- [external-executor-billing.md](./external-executor-billing.md) — billing patterns (in-process vs reconciliation)
- [agent-discovery.md](./agent-discovery.md) — agent catalog integration
- [ini.claude-sdk-adapter.md](../../work/initiatives/ini.claude-sdk-adapter.md) — implementation roadmap
