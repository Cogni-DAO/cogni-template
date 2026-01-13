# Agent Discovery Architecture

> Discovery pipeline for listing available agents across multiple adapters.

## Overview

Agent discovery enables the UI and API to list all available graph agents without requiring execution infrastructure. Discovery is decoupled from execution to avoid unnecessary dependencies and enable future multi-adapter scenarios.

**Key Principle:** Route calls discovery helper, which uses aggregator to fan out to providers. Route never imports adapters directly.

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

---

## Core Invariants

1. **DISCOVERY_PIPELINE**: Route → bootstrap helper → aggregator → providers. Route never imports adapters.

2. **DISCOVERY_NO_EXECUTION_DEPS**: Discovery providers do not require execution infrastructure (no `CompletionStreamFn`, no tool runners). `runGraph()` throws if called.

3. **REGISTRY_SEPARATION**: Discovery-only providers are never registered in the execution registry. Execution providers may implement `listAgents()` but are wired separately.

4. **P0_AGENT_GRAPH_IDENTITY**: `agentId === graphId` in P0 (one agent per graph). P1+ may decouple when multi-assistant support lands.

5. **AGENT_ID_STABLE**: `agentId` format is `${providerId}:${graphName}` (e.g., `langgraph:poet`). Stable across execution backends.

6. **LANGGRAPH_SERVER_ALIGNED**: Field names match LangGraph Server assistant model (`name`, nullable `description`). No bespoke `capabilities` in P0.

7. **DEDUPE_BY_AGENTID**: If multiple providers return the same `agentId`, log error and prefer first provider in registry order.

8. **SORT_FOR_STABILITY**: Output sorted by `name` (or `agentId`) for stable UI rendering.

---

## Phase Checklist

### Phase 0: MVP (✅ Complete)

- [x] Create `AgentCatalogPort` interface in `src/ports/agent-catalog.port.ts`
- [x] Create `AgentDescriptor` with `agentId`, `graphId`, `name`, `description` (nullable)
- [x] Create `LangGraphInProcAgentCatalogProvider` (discovery-only, no execution deps)
- [x] Create `src/bootstrap/agent-discovery.ts` with `listAgentsForApi()`
- [x] Create `/api/v1/ai/agents` route using `listAgentsForApi()`
- [x] Create `AggregatingAgentCatalog` implementing `AgentCatalogPort`
- [x] Remove `listGraphs()` from `GraphExecutorPort` (it's execution-only now)
- [x] Keep `DEFAULT_LANGGRAPH_GRAPH_ID` as app default (temporary, from package)

### Phase 1: Discovery/Execution Split

- [x] Create `AgentCatalogPort` separate from `GraphExecutorPort`
- [ ] Create `createAgentCatalogProvidersForDiscovery()` factory in bootstrap
- [ ] Add bootstrap-time assertion: discovery providers never in execution registry
- [ ] Add unit test: execution registry contains no discovery-only providers
- [ ] Make `defaultAgentId` app-configurable via env override
- [ ] Validate `defaultAgentId` exists in returned agents

### Phase 2: LangGraph Server Discovery

- [ ] Create `LangGraphServerCatalogProvider` calling `/assistants/search`
- [ ] Add to discovery registry
- [ ] Handle server-discoverable graphs (runtime, not static catalog)

### Phase 3: Multi-Adapter Discovery

- [ ] Claude SDK catalog adapter (if/when available)
- [ ] n8n/Flowise discovery (if demand materializes)
- [ ] Add `providerRef` to `AgentDescriptor` for adapter-specific data

---

## File Structure

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

---

## Provider Types

### Discovery Provider (AgentCatalogProvider)

Implements `AgentCatalogProvider` for discovery. No execution capability.

```typescript
class LangGraphInProcAgentCatalogProvider implements AgentCatalogProvider {
  readonly providerId = "langgraph";

  listAgents(): readonly AgentDescriptor[] {
    // Read from LANGGRAPH_CATALOG, map to AgentDescriptor
  }
}
```

### Execution Provider (GraphProvider)

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

---

## AgentDescriptor Shape

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

---

## LangGraph Server Alignment Roadmap

LangGraph Server `POST /assistants/search` returns these fields per assistant:

| LangGraph Server Field                | Our Field        | P0 Status                              |
| ------------------------------------- | ---------------- | -------------------------------------- |
| `assistant_id` (UUID)                 | —                | P1+: expose when multi-assistant lands |
| `graph_id` (string)                   | `graphId` suffix | ✅ graphId = `langgraph:{graph_id}`    |
| `name`                                | `name`           | ✅ aligned                             |
| `description`                         | `description`    | ✅ aligned (nullable)                  |
| `config`                              | —                | P1+: if UI needs config exposure       |
| `metadata`                            | —                | P1+: extensible metadata               |
| `version`, `created_at`, `updated_at` | —                | P2+: versioning support                |

**P0 simplifications:**

- `agentId === graphId` (one agent per graph, no assistant variants)
- No `capabilities` field (was bespoke, not LangGraph Server aligned)
- No `providerRef` (deferred to P3 multi-adapter)

---

## Related Documents

- [GRAPH_EXECUTION.md](GRAPH_EXECUTION.md) — Execution invariants, billing flow
- [LANGGRAPH_AI.md](LANGGRAPH_AI.md) — Graph patterns, package structure
- [ARCHITECTURE.md](ARCHITECTURE.md) — Hexagonal boundaries

---

**Last Updated**: 2026-01-14
**Status**: Draft (P0 complete — AgentCatalogPort, AgentDescriptor, /api/v1/ai/agents)
