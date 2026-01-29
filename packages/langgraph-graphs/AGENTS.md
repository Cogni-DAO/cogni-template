# langgraph-graphs · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @Cogni-DAO
- **Last reviewed:** 2026-01-29
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
  - `@cogni/langgraph-graphs` — Barrel re-export of common types plus:
    - `LANGGRAPH_CATALOG` — Graph catalog with registered graphs and metadata
  - `@cogni/langgraph-graphs/inproc` — InProc execution runner:
    - `createInProcGraphRunner()` — Generic InProc graph runner factory
    - `InProcRunnerOptions`, `InProcGraphRequest`, `GraphResult` — Runner types
    - `CompletionFn`, `CompletionResult` — Injected completion function types
    - `CreateGraphFn`, `CreateGraphOptions` — Graph factory types
    - `ToolExecFn`, `ToolExecResult` — Tool execution types
  - `@cogni/langgraph-graphs/runtime` — LangChain utilities:
    - `toLangChainTools()` — Convert tool contracts to LangChain DynamicStructuredTool (checks configurable.toolIds)
    - `CompletionUnitLLM` — Runnable-based LLM wrapper for billing integration (reads model from configurable)
    - `toBaseMessage()`, `fromBaseMessage()` — Message converters
    - `AsyncQueue` — Simple async queue for streaming
    - `runWithInProcContext()`, `getInProcRuntime()`, `hasInProcRuntime()` — AsyncLocalStorage for per-run context
    - `InProcRuntime` — Runtime context type (completionFn, tokenSink, toolExecFn; NO model per #35)
  - `@cogni/langgraph-graphs/graphs` — Graph factories and shared types:
    - `createPoetGraph()`, `createPondererGraph()` — React agent factories
    - `POET_GRAPH_NAME`, `PONDERER_GRAPH_NAME` — Graph name constants
    - `InvokableGraph<I,O>` — Type firewall (Pick<RunnableInterface, "invoke">)
    - `GraphInvokeOptions` — Alias to Partial<RunnableConfig>
    - `CreateReactAgentGraphOptions` — Base factory options
    - `asInvokableGraph()` — Centralized cast with runtime assertion
- **CLI:** none
- **Env/Config keys:** none (all deps injected)
- **Files considered API:** `index.ts`, `inproc/index.ts`, `runtime/index.ts`, `graphs/index.ts`, `langgraph.json`
- **Dev entrypoints:** `src/graphs/poet/dev.ts`, `src/graphs/ponderer/dev.ts` — Pre-compiled graphs for `langgraph dev` server

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
- TOOLS_DENY_BY_DEFAULT: toLangChainTool checks configurable.toolIds; returns policy_denied if not in list
- TOOL_CATALOG_IS_CANONICAL: `LANGGRAPH_CATALOG` entries use `toolIds: string[]` references; providers resolve from `TOOL_CATALOG`
- Dev entrypoints (`dev.ts`) read process.env for LiteLLM config — only for `langgraph dev` server use

## Dependencies

- **Internal:** `@cogni/ai-core` (AiEvent types), `@cogni/ai-tools` (ToolContract, BoundTool)
- **External:** `@langchain/core`, `@langchain/langgraph`, `zod`

## Change Protocol

- Update this file when public exports change
- Changes to graph contracts require updating `src/adapters/server/ai/langgraph/inproc.provider.ts`
- Coordinate with LANGGRAPH_AI.md invariants

## Notes

- Per NO_LANGCHAIN_IN_SRC: `src/**` cannot import `@langchain/*` — only this package
- Per PACKAGES_NO_SRC_IMPORTS: This package cannot import from `src/**`
- `LangGraphInProcProvider` in `src/adapters/server/ai/langgraph/` wires this package
- Package isolation enables LangGraph Server to import graphs without Next.js deps
