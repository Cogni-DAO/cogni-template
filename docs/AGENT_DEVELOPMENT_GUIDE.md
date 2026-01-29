# Agent Development Guide

> Quick reference for adding new agent graphs. For architecture details, see [LANGGRAPH_AI.md](LANGGRAPH_AI.md).

## Tier 1: Single-Node Agent

**File Structure:**

```
packages/langgraph-graphs/src/graphs/<name>/
├── graph.ts        # Pure factory: createXGraph({ llm, tools })
├── prompts.ts      # System prompt constant(s)
├── server.ts       # LangGraph dev entrypoint (~1 line)
└── cogni-exec.ts   # Cogni executor entrypoint (~1 line)
```

**Steps:**

1. Create `graph.ts` — pure factory with `stateSchema: MessagesAnnotation`
2. Create `prompts.ts` — system prompt constant
3. Add entry to `catalog.ts` — `toolIds`, `graphFactory`
4. Create `server.ts` — `export const x = await createServerEntrypoint("name")`
5. Create `cogni-exec.ts` — `export const x = createCogniEntrypoint("name")`
6. Add to `langgraph.json` — `"name": "./src/graphs/<name>/server.ts:x"`
7. Export from `graphs/index.ts`

**Template:** Copy from `ponderer/`

**Verify:** `pnpm packages:build && pnpm check`

## Entrypoint Invariants

| Invariant                            | Rule                                                                   |
| ------------------------------------ | ---------------------------------------------------------------------- |
| PURE_GRAPH_FACTORY                   | `graph.ts` has no env/ALS/entrypoint wiring                            |
| ENTRYPOINT_IS_THIN                   | `server.ts` and `cogni-exec.ts` are ~1-liners                          |
| LANGGRAPH_JSON_POINTS_TO_SERVER_ONLY | Never reference `cogni-exec.ts` in langgraph.json                      |
| NO_CROSSING_THE_STREAMS              | `server.ts` uses `initChatModel`; `cogni-exec.ts` uses ALS — never mix |

## Shared Types

From `packages/langgraph-graphs/src/graphs/types.ts`:

| Type                           | Purpose                                            |
| ------------------------------ | -------------------------------------------------- |
| `InvokableGraph<I, O>`         | Type firewall: `Pick<RunnableInterface, "invoke">` |
| `CreateReactAgentGraphOptions` | Base options: `{ llm, tools }`                     |
| `MessageGraphInput/Output`     | Standard message-based I/O                         |
| `asInvokableGraph()`           | Centralized cast with runtime assertion            |

## Tier 2: Composed Graphs

For multi-node graphs with node-keyed configuration, see [GRAPH_EXECUTION.md](GRAPH_EXECUTION.md) § Node-Keyed Model & Tool Configuration.

## Related

- [LANGGRAPH_AI.md](LANGGRAPH_AI.md) — Architecture patterns
- [GRAPH_EXECUTION.md](GRAPH_EXECUTION.md) — Execution invariants
