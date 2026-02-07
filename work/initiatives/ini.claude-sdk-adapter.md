---
work_item_id: ini.claude-sdk-adapter
work_item_type: initiative
title: Claude Agent SDK Adapter
state: Paused
priority: 2
estimate: 3
summary: Implement ClaudeAgentExecutor as a GraphExecutorPort adapter with in-process billing, tool bridging via MCP, and streaming event mapping
outcome: Claude Agent SDK available as an execution backend alongside LangGraph, with unified billing and tool access
assignees: derekg1729
created: 2026-02-07
updated: 2026-02-07
labels: [ai-graphs, adapters]
---

# Claude Agent SDK Adapter

## Goal

Wrap the Claude Agent SDK as a `GraphExecutorPort` implementation so developers can choose it as an execution backend. In-process billing via `message.usage` (no reconciliation needed), tool access via MCP bridge, streaming via event mapping.

## Roadmap

> Source: `docs/CLAUDE_SDK_ADAPTER_SPEC.md` — Spec: [claude-sdk-adapter.md](../../docs/spec/claude-sdk-adapter.md) (draft)

### Crawl (P0) — Basic Execution

**Goal:** MVP adapter that runs Claude Agent SDK queries through the standard graph execution pipeline with billing.

| Deliverable                                                                                           | Status      | Est | Work Item |
| ----------------------------------------------------------------------------------------------------- | ----------- | --- | --------- |
| Create `ClaudeAgentExecutor` implementing `GraphExecutorPort` in `src/adapters/server/ai/claude-sdk/` | Not Started | 2   | —         |
| Implement `query()` wrapper: translate `GraphRunRequest` → SDK `query({prompt, options})`             | Not Started | 1   | —         |
| Map SDK streaming messages to `AiEvent` stream (`SDKPartialAssistantMessage` → `TextDeltaEvent`)      | Not Started | 2   | —         |
| Extract usage from `SDKAssistantMessage.message.usage` per turn                                       | Not Started | 1   | —         |
| Emit `UsageReportEvent` per assistant message with `usageUnitId = message.id`                         | Not Started | 1   | —         |
| Extract `SDKResultMessage` for `GraphFinal` construction                                              | Not Started | 1   | —         |
| Observability instrumentation                                                                         | Not Started | 1   | —         |

### Walk (P1) — Tool Bridging

**Goal:** Claude SDK can call Cogni tools via in-process MCP bridge.

| Deliverable                                                            | Status      | Est | Work Item |
| ---------------------------------------------------------------------- | ----------- | --- | --------- |
| Create `createCogniMcpBridge(toolContracts, toolExecFn)` helper        | Not Started | 2   | —         |
| Register bridge as in-process MCP server via `createSdkMcpServer()`    | Not Started | 1   | —         |
| Wire tool policy: only `toolIds` from request are registered           | Not Started | 1   | —         |
| Emit `ToolCallStartEvent`/`ToolCallResultEvent` via `PostToolUse` hook | Not Started | 1   | —         |

### Run (P2+) — Multi-Turn Sessions (Future)

**Goal:** Session resume for multi-request conversations. **Do NOT build preemptively.**

| Deliverable                                                                | Status      | Est | Work Item |
| -------------------------------------------------------------------------- | ----------- | --- | --------- |
| Evaluate session resume (`options.resume`) for multi-request conversations | Not Started | 2   | —         |
| Map `stateKey` to SDK session management                                   | Not Started | 2   | —         |

## Constraints

- Adapter translates interfaces only — does not modify SDK behavior or inject LangGraph concepts
- No LangGraph or LangChain dependencies in adapter (`NO_LANGCHAIN_IN_ADAPTER`)
- Do NOT use reconciliation pattern — in-process real-time capture is simpler and more accurate
- Do NOT use Claude SDK for graphs requiring LangGraph-specific features (checkpointers, interrupt/resume, multi-node state machines)

## Dependencies

- [ ] `@anthropic-ai/claude-agent-sdk` package availability
- [ ] MCP server SDK for tool bridging

## As-Built Specs

- [claude-sdk-adapter.md](../../docs/spec/claude-sdk-adapter.md) — adapter invariants, billing schema, event mapping, tool bridging design (draft)

## Design Notes

### External Executor Billing Checklist (from CLAUDE_SDK_ADAPTER_SPEC.md)

Per [external-executor-billing.md](../../docs/spec/external-executor-billing.md):

| Question                                     | Claude SDK Answer                                      |
| -------------------------------------------- | ------------------------------------------------------ |
| **Authoritative billing source?**            | `message.usage` (in-process capture)                   |
| **Correlation key we control?**              | N/A—in-process, no external query needed               |
| **Provider call ID for usageUnitId?**        | `message.id` (unique per LLM response)                 |
| **Idempotent flow through commitUsageFact?** | `source_reference = ${runId}/${attempt}/${message.id}` |

Claude SDK does NOT follow invariants 41-47 (those apply to external executors only). Same pattern as InProc: real-time capture with authoritative stream events.

### Sources

- [Claude Agent SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview)
- [Claude Agent SDK TypeScript Reference](https://platform.claude.com/docs/en/agent-sdk/typescript)
- [Claude Agent SDK GitHub](https://github.com/anthropics/claude-agent-sdk-typescript)
