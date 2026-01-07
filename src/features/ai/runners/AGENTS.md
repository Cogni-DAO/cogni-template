# runners · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2026-01-07
- **Status:** stable

## Purpose

Graph runner factories for MVP tool use. Creates thin wrappers around graph execution that wire dependencies (toolRunner, completionUnit) and convert generators to GraphRunResult.

## Pointers

- [Graph Execution Design](../../../../docs/GRAPH_EXECUTION.md)
- [Tool Use Spec](../../../../docs/TOOL_USE_SPEC.md)
- [Chat Graph](../graphs/chat.graph.ts)
- [Tool Runner](../tool-runner.ts)
- [Parent AGENTS.md](../AGENTS.md)

## Boundaries

```json
{
  "layer": "features",
  "may_import": ["ports", "core", "shared", "types", "contracts"],
  "must_not_import": ["app", "adapters", "bootstrap"]
}
```

## Public Surface

- **Exports:**
  - `createChatRunner` — Factory for MVP chat graph runner
  - `createLangGraphChatRunner` — Factory for LangGraph InProc runner with tool calling
  - `CompletionUnitAdapter` — Interface for completion unit execution
- **Routes:** none
- **CLI:** none
- **Env/Config keys:** none
- **Files considered API:** chat.runner.ts, langgraph-chat.runner.ts (exported via public.server.ts)

## Ports

- **Uses ports:** GraphRunRequest, GraphRunResult (types from ports)
- **Implements ports:** none (factories, not adapters)
- **Contracts:** none

## Responsibilities

- **This directory does:**
  - Create graph runner factories for bootstrap wiring
  - Wire toolRunner with noop emit (graph yields events directly per MVP_GRAPH_YIELDS_TOOL_EVENTS)
  - Import tools from @cogni/ai-tools (per TOOLS_IN_PACKAGES)
  - Convert async generators to { stream, completion } shape
  - Bind completionUnit to run context

- **This directory does not:**
  - Contain graph orchestration logic (owned by graphs/)
  - Execute tools directly (owned by tool-runner.ts)
  - Import from adapters (architecture violation)
  - Implement ports

## Usage

```typescript
// Exported via public.server.ts for facade use
import { createChatRunner } from "@/features/ai/public.server";

// Facade creates resolver, passes to bootstrap
const graphResolver = (graphName, adapter) =>
  graphName === "chat" ? createChatRunner(adapter) : undefined;
```

## Standards

- Runners are thin wrappers (no business logic)
- Use spread pattern for optional properties (exactOptionalPropertyTypes)
- Graph yields events directly (noop emit pattern)

## Dependencies

- **Internal:** ../graphs/chat.graph.ts, ../tool-runner.ts, @cogni/ai-tools, @/ports
- **External:** none

## Change Protocol

- Update this file when adding runners
- Ensure runners export via public.server.ts
- Run pnpm check before committing

## Notes

- Two runners: `chat.runner.ts` (MVP), `langgraph-chat.runner.ts` (LangGraph InProc)
- Resolver receives adapter at call time (solves circular dependency)
- **P1 arch debt**: `langgraph-chat.runner.ts` contains LangGraph-specific wiring that belongs in adapters layer. See [LANGGRAPH_AI.md Known Issues](../../../../docs/LANGGRAPH_AI.md#known-issues) for split plan.
