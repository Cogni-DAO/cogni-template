# ai · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2026-01-14
- **Status:** stable

## Purpose

AI service adapters including LiteLLM completion/streaming, usage telemetry, agent discovery via AgentCatalogProvider + AggregatingAgentCatalog, and graph execution via GraphProvider + AggregatingGraphExecutor.

## Pointers

- [LlmService port](../../../ports/llm.port.ts)
- [AgentCatalogPort](../../../ports/agent-catalog.port.ts)
- [GraphExecutorPort](../../../ports/graph-executor.port.ts)
- [ActivityUsagePort](../../../ports/usage.port.ts)
- [Agent Discovery Design](../../../../docs/AGENT_DISCOVERY.md)
- [LiteLLM configuration](../../../../../platform/infra/services/litellm/)
- [Activity Metrics Design](../../../../docs/ACTIVITY_METRICS.md)
- [Graph Execution Design](../../../../docs/GRAPH_EXECUTION.md)
- [LangGraph Server Design](../../../../docs/LANGGRAPH_SERVER.md)

## Boundaries

```json
{
  "layer": "adapters/server",
  "may_import": ["adapters/server", "ports", "shared", "types"],
  "must_not_import": ["app", "features", "core"]
}
```

## Public Surface

- **Exports:** LiteLlmAdapter (LlmService), LiteLlmActivityUsageAdapter (ActivityUsagePort), LiteLlmUsageServiceAdapter (UsageService), InProcCompletionUnitAdapter (completion unit execution), AgentCatalogProvider (discovery interface), AggregatingAgentCatalog (implements AgentCatalogPort), LangGraphInProcAgentCatalogProvider (discovery provider), AggregatingGraphExecutor (execution routing), GraphProvider (execution interface), LangGraphInProcProvider (implements GraphProvider), ObservabilityGraphExecutorDecorator (wraps GraphExecutorPort with Langfuse traces)
- **Routes (if any):** none
- **CLI (if any):** none
- **Env/Config keys:** LITELLM_BASE_URL, LITELLM_MASTER_KEY (model param required - no env fallback)
- **Files considered API:** litellm.adapter.ts, litellm.activity-usage.adapter.ts, litellm.usage-service.adapter.ts, inproc-completion-unit.adapter.ts, agent-catalog.provider.ts, aggregating-agent-catalog.ts, aggregating-executor.ts, graph-provider.ts, langgraph/inproc-agent-catalog.provider.ts, langgraph/inproc.provider.ts, observability-executor.decorator.ts
- **Streaming:** completionStream() supports SSE streaming via eventsource-parser with robustness against malformed chunks

## Ports (optional)

- **Uses ports:** none
- **Implements ports:** LlmService, ActivityUsagePort, UsageService, AgentCatalogPort, GraphExecutorPort
- **Contracts (required if implementing):** LlmService contract tests in tests/contract/, usage adapter tests in tests/unit/adapters/

## Responsibilities

- This directory **does**: Implement LlmService for AI completions and streaming (with tool message format support); implement ActivityUsagePort for LiteLLM usage logs (read-only, powers Activity dashboard); implement UsageService adapter mapping usage logs to usage stats; implement AgentCatalogPort via AggregatingAgentCatalog (discovery-only, fans out to AgentCatalogProvider[]); implement GraphExecutorPort via AggregatingGraphExecutor (routes graphId to execution providers); provide AgentCatalogProvider and GraphProvider interfaces; provide LangGraphInProcAgentCatalogProvider (discovery) and LangGraphInProcProvider (execution)
- This directory **does not**: Handle authentication, rate limiting, timestamps, or write charge receipts to DB

## Usage

Minimal local commands:

```bash
pnpm test tests/integration/ai/
```

## Standards

- Never logs prompts or API keys for security
- Enforces 15s connect timeout for streaming (fetch TTFB only)
- Handles provider-specific response formatting
- Streaming malformed SSE chunks logged as warnings without failing stream
- Promise settlement guaranteed exactly once via defer helper
- Usage logs: bounded scan up to MAX_RANGE_LIMIT (5000), pass-through data from LiteLLM (no local recomputation)
- Usage adapter throws ActivityUsageUnavailableError on LiteLLM failures (never silent degradation)
- getSpendLogs avoids date params (cause aggregation), fetches individual logs, filters in-memory by timestamp
- Bounded scan validation: throws TooManyLogsError (422) if range incomplete after MAX_LOGS_PER_RANGE fetch
- Tool message format: liteLlmMessages includes tool_calls (assistant) and tool_call_id (tool role) for agentic loop
- Discovery/Execution split: AgentCatalogProvider for discovery (no execution deps), GraphProvider for execution
- AgentCatalogProvider pattern: listAgents() returns AgentDescriptor[]; AggregatingAgentCatalog fans out to providers
- GraphProvider pattern: providerId prefixes graphId (e.g., "langgraph:poet"); AggregatingGraphExecutor routes to registered providers
- langgraph/ subdirectory: LangGraphInProcAgentCatalogProvider (discovery) and LangGraphInProcProvider (execution) wire @cogni/langgraph-graphs catalog

## Dependencies

- **Internal:** ports, shared/env, shared/observability/logging
- **External:** LiteLLM service (external HTTP API), eventsource-parser (npm)

## Change Protocol

- Update this file when **Exports** or **Env/Config** change
- Bump **Last reviewed** date
- Ensure boundary lint + contract tests pass

## Notes

- Used in production for real LLM completions
- Connects to LiteLLM proxy service for provider abstraction
