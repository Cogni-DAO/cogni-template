# ai-tools · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @Cogni-DAO
- **Last reviewed:** 2026-02-02
- **Status:** draft

## Purpose

Pure tool definitions for AI agent execution. Defines `ToolContract`, `ToolImplementation`, `BoundTool` types and tool implementations with Zod validation. NO LangChain dependencies — LangChain wrapping lives in `@cogni/langgraph-graphs`.

## Pointers

- [LangGraph AI Guide](../../docs/LANGGRAPH_AI.md)
- [Tool Use Spec](../../docs/TOOL_USE_SPEC.md)

## Boundaries

```json
{
  "layer": "packages",
  "may_import": ["packages"],
  "must_not_import": [
    "app",
    "features",
    "ports",
    "core",
    "adapters",
    "shared",
    "services"
  ]
}
```

**External deps:** `zod`, `zod-to-json-schema`. Imports `@cogni/ai-core` (ToolSpec type). NO LangChain.

## Public Surface

- **Exports:**
  - `ToolContract` - Tool definition interface (name, inputSchema, outputSchema, redact)
  - `ToolImplementation` - Pure execute function interface
  - `BoundTool` - Contract + implementation bundled together
  - `CatalogBoundTool` - Type alias for TOOL_CATALOG entries (type-erased BoundTool)
  - `ToolResult`, `ToolErrorCode` - Execution result types
  - `getCurrentTimeBoundTool`, `GET_CURRENT_TIME_NAME` - Time tool
  - `metricsQueryBoundTool`, `METRICS_QUERY_NAME`, `createMetricsQueryImplementation` - Metrics query tool
  - `webSearchBoundTool`, `WEB_SEARCH_NAME`, `createWebSearchImplementation` - Web search tool
  - `WebSearchCapability`, `WebSearchParams`, `WebSearchResult`, `WebSearchResultItem` - Web search types
  - `toToolSpec()`, `toToolSpecs()` - Compile ToolContract to ToolSpec (Zod → JSONSchema7)
  - `TOOL_CATALOG` - Singleton catalog of all registered tools (Record<string, CatalogBoundTool>)
  - `createToolCatalog()`, `getToolById()`, `getToolIds()`, `hasToolId()` - Catalog accessors
  - `toBoundToolRuntime()`, `contractToRuntime()` - Runtime adapter converters (contractToRuntime for DI)
  - `ToolCapabilities`, `AuthCapability`, `ClockCapability`, `MetricsCapability` - Capability interfaces
- **CLI:** none
- **Env/Config keys:** none
- **Files considered API:** `index.ts`, `types.ts`, `schema.ts`, `catalog.ts`, `runtime-adapter.ts`, `capabilities/*.ts`, `tools/*.ts`

## Ports

- **Uses ports:** none
- **Implements ports:** none

## Responsibilities

- This directory **does**: Define pure tool contracts and implementations
- This directory **does not**: Import LangChain, make I/O calls (except pure Date), depend on src/

## Usage

```bash
pnpm --filter @cogni/ai-tools typecheck
pnpm --filter @cogni/ai-tools build
```

## Standards

- Pure implementations only (no I/O beyond pure functions)
- All exports must work in both browser and Node.js
- NO_LANGCHAIN: LangChain wrapping happens in `@cogni/langgraph-graphs`

## Dependencies

- **Internal:** `@cogni/ai-core` (ToolSpec type)
- **External:** `zod`, `zod-to-json-schema`

## Change Protocol

- Update this file when public exports change
- Changes require updating `@cogni/langgraph-graphs` wrappers
- Coordinate with TOOL_USE_SPEC.md invariants

## Notes

- Per LANGGRAPH_AI.md: tool contracts live here, LangChain `tool()` wrappers in langgraph-graphs
- Per PACKAGES_NO_SRC_IMPORTS: This package cannot import from `src/**`
- Package isolation enables LangGraph Server to import tools without Next.js deps
