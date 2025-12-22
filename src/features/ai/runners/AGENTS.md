# runners · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-12-23
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

- **Exports:** `createChatRunner` (factory for chat graph runner)
- **Routes:** none
- **CLI:** none
- **Env/Config keys:** none
- **Files considered API:** chat.runner.ts (exported via public.server.ts)

## Ports

- **Uses ports:** GraphRunRequest, GraphRunResult (types from ports)
- **Implements ports:** none (factories, not adapters)
- **Contracts:** none

## Responsibilities

- **This directory does:**
  - Create graph runner factories for bootstrap wiring
  - Wire toolRunner with noop emit (graph yields events directly per MVP_GRAPH_YIELDS_TOOL_EVENTS)
  - Load tools via getToolsForGraph()
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

- **Internal:** ../graphs/chat.graph.ts, ../tool-registry.ts, ../tool-runner.ts, @/ports
- **External:** none

## Change Protocol

- Update this file when adding runners
- Ensure runners export via public.server.ts
- Run pnpm check before committing

## Notes

- MVP: Only chat runner exists
- Per NO_LANGGRAPH_RUNTIME: Hand-rolled runners until LangGraph migration
- Resolver receives adapter at call time (solves circular dependency)
