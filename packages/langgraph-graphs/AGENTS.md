# langgraph-graphs · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @Cogni-DAO
- **Last reviewed:** 2026-01-05
- **Status:** draft

## Purpose

LangGraph graph definitions and runtime utilities for agentic AI execution. Contains all `@langchain/*` code in the monorepo. Provides graph factories, message converters, tool wrappers, and streaming utilities.

## Pointers

- [LangGraph AI Guide](../../docs/LANGGRAPH_AI.md)
- [Graph Execution](../../docs/GRAPH_EXECUTION.md)
- [Tool Use Spec](../../docs/TOOL_USE_SPEC.md)
- [Packages Architecture](../../docs/PACKAGES_ARCHITECTURE.md)

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

**External deps:** `@langchain/core`, `@langchain/langgraph`, `zod`. Imports `@cogni/ai-core`, `@cogni/ai-tools`.

## Public Surface

- **Exports (subpaths):**
  - `@cogni/langgraph-graphs` — Barrel re-export of common types
  - `@cogni/langgraph-graphs/runtime` — LangChain utilities:
    - `toLangChainTool()` — Convert BoundTool to LangChain StructuredTool
    - `CompletionUnitLLM` — BaseChatModel wrapper for billing integration
    - `toBaseMessage()`, `fromBaseMessage()` — Message converters
    - `AsyncQueue` — Simple async queue for streaming
  - `@cogni/langgraph-graphs/graphs` — Graph factories:
    - `createChatGraph()` — Simple React agent factory
    - `CHAT_GRAPH_NAME` — Graph name constant
- **CLI:** none
- **Env/Config keys:** none (all deps injected)
- **Files considered API:** `index.ts`, `runtime/index.ts`, `graphs/index.ts`

## Ports

- **Uses ports:** none (pure package, no ports)
- **Implements ports:** none

## Responsibilities

- This directory **does**: Define LangGraph graphs, wrap tools for LangChain, convert message formats
- This directory **does not**: Import from `src/`, execute graphs (runners in `src/`), own billing logic

## Usage

```bash
pnpm --filter @cogni/langgraph-graphs typecheck
pnpm --filter @cogni/langgraph-graphs build
pnpm --filter @cogni/langgraph-graphs test
```

## Standards

- All `@langchain/*` imports must stay in this package (NO_LANGCHAIN_IN_SRC)
- Graph factories are pure functions — no env reads, no side effects
- Message types compatible with `src/core/chat/model.ts` (will migrate to ai-core)
- Tools wrapped via `toLangChainTool()` must delegate to injected exec function

## Dependencies

- **Internal:** `@cogni/ai-core` (AiEvent types), `@cogni/ai-tools` (ToolContract, BoundTool)
- **External:** `@langchain/core`, `@langchain/langgraph`, `zod`

## Change Protocol

- Update this file when public exports change
- Changes to graph contracts require updating `src/features/ai/runners/`
- Coordinate with LANGGRAPH_AI.md invariants

## Notes

- Per NO_LANGCHAIN_IN_SRC: `src/**` cannot import `@langchain/*` — only this package
- Per PACKAGES_NO_SRC_IMPORTS: This package cannot import from `src/**`
- Runners that wire this package live in `src/features/ai/runners/`
- Package isolation enables LangGraph Server to import graphs without Next.js deps
