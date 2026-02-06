---
id: agent-discovery-spec
type: spec
title: Agent Discovery Architecture
status: active
spec_state: draft
trust: draft
summary: Discovery pipeline for listing available agents across multiple adapters, decoupled from execution.
read_when: Working on agent listing, catalog providers, or the /api/v1/ai/agents endpoint.
owner: derekg1729
created: 2026-02-06
verified: 2026-02-06
tags: [ai-graphs]
---

# Agent Discovery Architecture

## Context

Agent discovery enables the UI and API to list all available graph agents without requiring execution infrastructure. Discovery is decoupled from execution to avoid unnecessary dependencies and enable future multi-adapter scenarios.

## Goal

Provide a pluggable agent discovery pipeline where routes call a bootstrap helper, which uses an aggregator to fan out to catalog providers. Route never imports adapters directly.

## Non-Goals

- Multi-assistant support per graph (P1+, tracked in ini.agent-registry.md)
- LangGraph Server runtime discovery (P2, tracked in ini.agent-registry.md)
- Claude SDK / n8n / Flowise discovery adapters (P3, tracked in ini.agent-registry.md)

## Core Invariants

1. **DISCOVERY_PIPELINE**: Route → bootstrap helper → aggregator → providers. Route never imports adapters.

2. **DISCOVERY_NO_EXECUTION_DEPS**: Discovery providers do not require execution infrastructure (no `CompletionStreamFn`, no tool runners). `runGraph()` throws if called.

3. **REGISTRY_SEPARATION**: Discovery-only providers are never registered in the execution registry. Execution providers may implement `listAgents()` but are wired separately.

4. **P0_AGENT_GRAPH_IDENTITY**: `agentId === graphId` in P0 (one agent per graph). P1+ may decouple when multi-assistant support lands.

5. **AGENT_ID_STABLE**: `agentId` format is `${providerId}:${graphName}` (e.g., `langgraph:poet`). Stable across execution backends.

6. **LANGGRAPH_SERVER_ALIGNED**: Field names match LangGraph Server assistant model (`name`, nullable `description`). No bespoke `capabilities` in P0.

7. **DEDUPE_BY_AGENTID**: If multiple providers return the same `agentId`, log error and prefer first provider in registry order.

8. **SORT_FOR_STABILITY**: Output sorted by `name` (or `agentId`) for stable UI rendering.

## Design

### Architecture

```
Route (/api/v1/ai/agents)
     │
     ▼
listAgentsForApi() [bootstrap/agent-discovery.ts]
     │
     ▼
AggregatingAgentCatalog.listAgents()
     │
     ▼
AgentCatalogProvider[].listAgents() (fanout)
     │
     └──► LangGraphInProcAgentCatalogProvider → reads LANGGRAPH_CATALOG
```

### Provider Types

#### Discovery Provider (AgentCatalogProvider)

Implements `AgentCatalogProvider` for discovery. No execution capability.

```typescript
class LangGraphInProcAgentCatalogProvider implements AgentCatalogProvider {
  readonly providerId = "langgraph";

  listAgents(): readonly AgentDescriptor[] {
    // Read from LANGGRAPH_CATALOG, map to AgentDescriptor
  }
}
```

#### Execution Provider (GraphProvider)

Implements `GraphProvider` for execution. May also implement discovery.

```typescript
class LangGraphInProcProvider implements GraphProvider {
  constructor(private adapter: CompletionUnitAdapter) {}

  canHandle(graphId: string): boolean {
    // Check if graphId matches catalog
  }

  runGraph(req: GraphRunRequest): GraphRunResult {
    // Execute via package runner
  }
}
```

### AgentDescriptor Shape

`AgentDescriptor` aligns with LangGraph Server's assistant model (`POST /assistants/search`):

```typescript
// src/ports/agent-catalog.port.ts (P0)
interface AgentDescriptor {
  agentId: string; // Stable identifier (P0: === graphId)
  graphId: string; // Internal routing: "${providerId}:${graphName}"
  name: string; // Matches LangGraph Server 'name'
  description: string | null; // Nullable per LangGraph Server
}

// GET /api/v1/ai/agents response
interface ListAgentsResponse {
  agents: AgentDescriptor[];
  defaultAgentId: string | null;
}
```

**P0 simplifications:**

- `agentId === graphId` (one agent per graph, no assistant variants)
- No `capabilities` field (was bespoke, not LangGraph Server aligned)
- No `providerRef` (deferred to P3 multi-adapter)

### Phase 0 Implementation (Complete)

- [x] Create `AgentCatalogPort` interface in `src/ports/agent-catalog.port.ts`
- [x] Create `AgentDescriptor` with `agentId`, `graphId`, `name`, `description` (nullable)
- [x] Create `LangGraphInProcAgentCatalogProvider` (discovery-only, no execution deps)
- [x] Create `src/bootstrap/agent-discovery.ts` with `listAgentsForApi()`
- [x] Create `/api/v1/ai/agents` route using `listAgentsForApi()`
- [x] Create `AggregatingAgentCatalog` implementing `AgentCatalogPort`
- [x] Remove `listGraphs()` from `GraphExecutorPort` (it's execution-only now)
- [x] Keep `DEFAULT_LANGGRAPH_GRAPH_ID` as app default (temporary, from package)
- [x] Create `AgentCatalogPort` separate from `GraphExecutorPort`

### File Pointers

```
src/
├── ports/
│   ├── agent-catalog.port.ts      # AgentCatalogPort, AgentDescriptor
│   └── graph-executor.port.ts     # GraphExecutorPort (execution only)
│
├── bootstrap/
│   ├── agent-discovery.ts         # Discovery factory (no execution deps)
│   └── graph-executor.factory.ts  # Execution factory (with completion deps)
│
├── adapters/server/ai/
│   ├── agent-catalog.provider.ts  # AgentCatalogProvider interface (internal)
│   ├── aggregating-agent-catalog.ts # AggregatingAgentCatalog
│   ├── aggregating-executor.ts    # AggregatingGraphExecutor
│   ├── inproc-completion-unit.adapter.ts # CompletionUnitAdapter (NOT GraphExecutorPort)
│   └── langgraph/
│       ├── inproc-agent-catalog.provider.ts # LangGraphInProcAgentCatalogProvider (discovery)
│       └── inproc.provider.ts     # LangGraphInProcProvider (execution)
│
└── app/api/v1/ai/agents/
    └── route.ts                   # Uses listAgentsForApi() from bootstrap
```

## Acceptance Checks

**Manual:**

1. `GET /api/v1/ai/agents` returns sorted agent list with stable agentIds
2. Discovery works without execution infrastructure running
3. Duplicate agentIds across providers are logged as errors

## Open Questions

_(none — planned evolution tracked in ini.agent-registry.md: discovery factory, LangGraph Server provider, multi-adapter discovery, LangGraph Server field alignment)_

## Related

- [Graph Execution](../GRAPH_EXECUTION.md) — Execution invariants, billing flow
- [AI Setup](./ai-setup.md) — AI stack configuration
- [Architecture](./architecture.md) — Hexagonal boundaries
