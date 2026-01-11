# Agent Development Guide

> Quick reference for adding new agent graphs. For architecture details, see [LANGGRAPH_AI.md](LANGGRAPH_AI.md).

## Tier 1: Single-Node Agent (Default)

Use this structure for simple agents with one ReAct loop.

```
packages/langgraph-graphs/src/graphs/<name>/
├── graph.ts      # Factory: createXxxGraph(opts) → InvokableGraph
└── prompts.ts    # System prompt constant(s)
```

### Template: Copy from `ponderer/`

```bash
cp -r packages/langgraph-graphs/src/graphs/ponderer packages/langgraph-graphs/src/graphs/<name>
```

### Files to Edit

**1. `prompts.ts`** — Define your system prompt:

```typescript
export const MY_AGENT_SYSTEM_PROMPT = `Your system prompt here.` as const;
```

**2. `graph.ts`** — Import shared types and prompt:

```typescript
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import {
  asInvokableGraph,
  type CreateReactAgentGraphOptions,
  type InvokableGraph,
  type MessageGraphInput,
  type MessageGraphOutput,
} from "../types";
import { MY_AGENT_SYSTEM_PROMPT } from "./prompts";

export const MY_AGENT_GRAPH_NAME = "my-agent" as const;

// Type alias using shared InvokableGraph — no per-graph interface duplication
export type MyAgentGraph = InvokableGraph<
  MessageGraphInput,
  MessageGraphOutput
>;

export function createMyAgentGraph(
  opts: CreateReactAgentGraphOptions
): MyAgentGraph {
  const agent = createReactAgent({
    llm: opts.llm,
    tools: [...opts.tools], // Spread readonly to mutable
    messageModifier: MY_AGENT_SYSTEM_PROMPT,
  });
  return asInvokableGraph<MessageGraphInput, MessageGraphOutput>(agent);
}
```

**3. `packages/langgraph-graphs/src/graphs/index.ts`** — Add export:

```typescript
export {
  createMyAgentGraph,
  MY_AGENT_GRAPH_NAME,
  type MyAgentGraph,
} from "./my-agent/graph";
```

**4. `packages/langgraph-graphs/src/catalog.ts`** — Add catalog entry:

```typescript
[MY_AGENT_GRAPH_NAME]: {
  displayName: "My Agent",
  description: "What this agent does",
  boundTools: { [GET_CURRENT_TIME_NAME]: getCurrentTimeBoundTool },
  graphFactory: createMyAgentGraph,
},
```

### Build and Verify

```bash
pnpm packages:build && pnpm check
```

## Shared Types

All graphs use shared types from `packages/langgraph-graphs/src/graphs/types.ts`:

| Type                           | Purpose                                                                   |
| ------------------------------ | ------------------------------------------------------------------------- |
| `InvokableGraph<I, O>`         | Type firewall: `Pick<RunnableInterface, "invoke">` from `@langchain/core` |
| `GraphInvokeOptions`           | Alias to `Partial<RunnableConfig>` (signal, configurable, metadata, etc.) |
| `CreateReactAgentGraphOptions` | Base options: `{ llm, tools }`                                            |
| `MessageGraphInput/Output`     | Standard message-based I/O types                                          |
| `asInvokableGraph()`           | Centralized cast with runtime assertion                                   |

> **LangChain Alignment:** `GraphInvokeOptions` and `InvokableGraph` are aliases to upstream `@langchain/core` types, not custom definitions. This ensures compatibility with future LangGraph features (thread_id, callbacks, etc.).

## Deprecation Warning

> **`createReactAgent` from `@langchain/langgraph/prebuilt` is deprecated/migrated.**
> LangGraph v1 moves this to `langchain` package. Pin versions in `package.json`.
> Future migration to `createAgent` from `langchain` is expected.

## Tier 2: Composed Graphs (Future)

For multi-node graphs with custom routing, see [LANGGRAPH_AI.md](LANGGRAPH_AI.md) Tier 2 section (planned).

## Related

- [LANGGRAPH_AI.md](LANGGRAPH_AI.md) — Architecture patterns
- [GRAPH_EXECUTION.md](GRAPH_EXECUTION.md) — Execution invariants
- [packages/langgraph-graphs/AGENTS.md](../packages/langgraph-graphs/AGENTS.md) — Package surface
