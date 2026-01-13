# Agent Discovery Architecture

> Discovery pipeline for listing available agents across multiple adapters.

## Overview

Agent discovery enables the UI and API to list all available graph agents without requiring execution infrastructure. Discovery is decoupled from execution to avoid unnecessary dependencies and enable future multi-adapter scenarios.

**Key Principle:** Route calls discovery helper, which uses aggregator to fan out to providers. Route never imports adapters directly.

```
Route (/api/v1/ai/graphs)
     │
     ▼
listGraphsForApi() [bootstrap/graph-discovery.ts]
     │
     ▼
AggregatingGraphExecutor.listGraphs()
     │
     ▼
GraphProvider[].listGraphs() (fanout)
     │
     └──► LangGraphCatalogProvider → reads LANGGRAPH_CATALOG
```

---

## Core Invariants

1. **DISCOVERY_PIPELINE**: Route → bootstrap helper → aggregator → providers. Route never imports adapters.

2. **DISCOVERY_NO_EXECUTION_DEPS**: Discovery providers do not require execution infrastructure (no `CompletionStreamFn`, no tool runners). `runGraph()` throws if called.

3. **REGISTRY_SEPARATION**: Discovery-only providers are never registered in the execution registry. Execution providers may implement `listGraphs()` but are wired separately.

4. **GRAPH_ID_STABLE**: `graphId` format is `${providerId}:${graphName}` (e.g., `langgraph:poet`). Stable across execution backends.

5. **CAPABILITIES_CONSERVATIVE**: Only set capability flags for what is truly supported. Do not guess or over-promise.

6. **DEDUPE_BY_GRAPHID**: If multiple providers return the same `graphId`, log error and prefer first provider in registry order.

7. **SORT_FOR_STABILITY**: Output sorted by `displayName` (or `graphId`) for stable UI rendering.

---

## Phase Checklist

### Phase 0: MVP (✅ Complete)

- [x] Create `LangGraphCatalogProvider` (discovery-only, no execution deps)
- [x] Create `src/bootstrap/graph-discovery.ts` with `listGraphsForApi()`
- [x] Update route to use `listGraphsForApi()` instead of direct catalog import
- [x] Remove `GraphExecutorPort` from `InProcCompletionUnitAdapter` (it's a `CompletionUnitAdapter`)
- [x] Keep `DEFAULT_LANGGRAPH_GRAPH_ID` as app default (temporary, from package)

### Phase 1: Discovery/Execution Split

- [ ] Create `createGraphProvidersForDiscovery()` factory in bootstrap
- [ ] Create `createGraphProvidersForExecution(completionStreamFn)` factory in bootstrap
- [ ] Add bootstrap-time assertion: discovery providers never in execution registry
- [ ] Add unit test: execution registry contains no discovery-only providers
- [ ] Make `defaultGraphId` app-configurable via env override
- [ ] Validate `defaultGraphId` exists in returned graphs

### Phase 2: LangGraph Server Discovery

- [ ] Create `LangGraphServerCatalogProvider` calling `/assistants/search`
- [ ] Add to discovery registry
- [ ] Handle server-discoverable graphs (runtime, not static catalog)

### Phase 3: Multi-Adapter Discovery

- [ ] Claude SDK catalog adapter (if/when available)
- [ ] n8n/Flowise discovery (if demand materializes)
- [ ] Adapter-agnostic `AgentDescriptor` with `providerRef` for adapter-specific data

---

## File Structure

```
src/
├── bootstrap/
│   ├── graph-discovery.ts         # Discovery factory (no execution deps)
│   └── graph-executor.factory.ts  # Execution factory (with completion deps)
│
├── adapters/server/ai/
│   ├── graph-provider.ts          # GraphProvider interface (internal)
│   ├── aggregating-executor.ts    # AggregatingGraphExecutor
│   ├── inproc-completion-unit.adapter.ts # CompletionUnitAdapter (NOT GraphExecutorPort)
│   └── langgraph/
│       ├── catalog.provider.ts    # LangGraphCatalogProvider (discovery-only)
│       └── inproc.provider.ts     # LangGraphInProcProvider (execution)
│
└── app/api/v1/ai/graphs/
    └── route.ts                   # Uses listGraphsForApi() from bootstrap
```

---

## Provider Types

### Discovery-Only Provider

Implements `GraphProvider` but only for discovery. Throws on execution.

```typescript
class LangGraphCatalogProvider implements GraphProvider {
  readonly providerId = "langgraph";

  listGraphs(): readonly GraphDescriptor[] {
    // Read from LANGGRAPH_CATALOG
  }

  canHandle(graphId: string): boolean {
    // Check if graphId matches catalog
  }

  runGraph(): GraphRunResult {
    throw new Error("Discovery-only provider");
  }
}
```

### Execution Provider

Implements full `GraphProvider` with execution capability.

```typescript
class LangGraphInProcProvider implements GraphProvider {
  constructor(private adapter: CompletionUnitAdapter) {}

  listGraphs(): readonly GraphDescriptor[] {
    // Read from LANGGRAPH_CATALOG
  }

  canHandle(graphId: string): boolean {
    // Check if graphId matches catalog
  }

  runGraph(req: GraphRunRequest): GraphRunResult {
    // Execute via package runner
  }
}
```

---

## Future: Agent vs Graph Naming

P0 uses `GraphDescriptor` for stability. Future phases may rename to `AgentDescriptor` to align with LangGraph Server's "Assistant" concept:

- **P0**: `agentId === graphId` (1 agent per graph)
- **P1+**: `agentId` can represent assistant/config variants

```typescript
// Future shape (P1+)
interface AgentDescriptor {
  agentId: string; // Stable identifier
  graphId: string; // Internal reference
  displayName: string;
  description: string;
  capabilities: AgentCapabilities;
  providerRef?: {
    // Provider-specific reference
    providerId: string;
    ref: unknown; // e.g., { assistantId } for LangGraph Server
  };
}
```

---

## Related Documents

- [GRAPH_EXECUTION.md](GRAPH_EXECUTION.md) — Execution invariants, billing flow
- [LANGGRAPH_AI.md](LANGGRAPH_AI.md) — Graph patterns, package structure
- [ARCHITECTURE.md](ARCHITECTURE.md) — Hexagonal boundaries

---

**Last Updated**: 2026-01-13
**Status**: Draft (P0 implementation in progress)
