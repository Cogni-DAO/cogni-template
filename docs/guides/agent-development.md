---
id: agent-development-guide
type: guide
title: Agent Development Guide
status: draft
trust: draft
summary: Step-by-step checklist for adding new agent graphs (single-node and composed) to the LangGraph package.
read_when: Adding a new AI agent graph to packages/langgraph-graphs.
owner: derekg1729
created: 2026-02-06
verified: 2026-02-06
tags: [ai, agents, dev]
---

# Agent Development Guide

> Quick reference for adding new agent graphs. For architecture details, see [LangGraph Patterns spec](../spec/langgraph-patterns.md).

## When to Use This

You are adding a new AI agent graph to `packages/langgraph-graphs`. This covers both single-node (Tier 1) and composed multi-node (Tier 2) graphs.

## Preconditions

- [ ] `packages/langgraph-graphs` builds cleanly (`pnpm packages:build`)
- [ ] Agent purpose and required tools identified
- [ ] Familiar with the `ponderer/` graph as a reference implementation

## Steps

### Tier 1: Single-Node Agent

**File Structure:**

```
packages/langgraph-graphs/src/graphs/<name>/
├── graph.ts        # Pure factory: createXGraph({ llm, tools })
├── prompts.ts      # System prompt constant(s)
├── tools.ts        # Tool IDs constant (*_TOOL_IDS)
├── server.ts       # LangGraph dev entrypoint
└── cogni-exec.ts   # Cogni executor entrypoint
```

**Steps:**

1. Create `graph.ts` — pure factory with `stateSchema: MessagesAnnotation`, NO explicit return type
2. Create `prompts.ts` — system prompt constant
3. Create `tools.ts` — export `*_TOOL_IDS` array referencing tool names from `@cogni/ai-tools`
4. Create `server.ts` — `export const x = await makeServerGraph({ name, createGraph, toolIds })`
5. Create `cogni-exec.ts` — `export const xGraph = makeCogniGraph({ name, createGraph, toolIds })`
6. Add entry to `catalog.ts` — `toolIds`, `graphFactory`
7. Add to `langgraph.json` — `"name": "./src/graphs/<name>/server.ts:x"`
8. Export from `graphs/index.ts`
9. **P0 workaround:** Add to `AVAILABLE_GRAPHS` in `src/features/ai/components/ChatComposerExtras.tsx`

> **Note:** Step 9 is a temporary workaround. The chat UI uses a hardcoded graph list instead of fetching from `/api/v1/ai/agents`. See [GRAPH_EXECUTION.md](../GRAPH_EXECUTION.md) P1 checklist for the fix.

**Template:** Copy from `ponderer/`

**Verify:** `pnpm packages:build && pnpm langgraph:dev`

### Entrypoint Invariants

| Invariant                            | Rule                                                                   |
| ------------------------------------ | ---------------------------------------------------------------------- |
| PURE_GRAPH_FACTORY                   | `graph.ts` has no env/ALS/entrypoint wiring                            |
| TYPE_TRANSPARENT_RETURN              | `graph.ts` has NO explicit return type (preserves CompiledStateGraph)  |
| ENTRYPOINT_IS_THIN                   | `server.ts` and `cogni-exec.ts` call `make*Graph` helpers              |
| LANGGRAPH_JSON_POINTS_TO_SERVER_ONLY | Never reference `cogni-exec.ts` in langgraph.json                      |
| NO_CROSSING_THE_STREAMS              | `server.ts` uses `initChatModel`; `cogni-exec.ts` uses ALS — never mix |

### Shared Types

From `packages/langgraph-graphs/src/graphs/types.ts`:

| Type                           | Purpose                                            |
| ------------------------------ | -------------------------------------------------- |
| `InvokableGraph<I, O>`         | Type firewall: `Pick<RunnableInterface, "invoke">` |
| `CreateReactAgentGraphOptions` | Base options: `{ llm, tools }`                     |
| `MessageGraphInput/Output`     | Mutable message arrays (LangGraph-aligned)         |

### Tier 2: Composed Graphs

For multi-node graphs with node-keyed configuration, see [GRAPH_EXECUTION.md](../GRAPH_EXECUTION.md) § Node-Keyed Model & Tool Configuration.

## Verification

```bash
pnpm packages:build && pnpm langgraph:dev
```

Verify your graph appears in the LangGraph Studio UI and responds to test messages.

## Troubleshooting

### Problem: Graph not appearing in LangGraph Studio

**Solution:** Ensure you added the entry to `langgraph.json` pointing to `server.ts` (not `cogni-exec.ts`). Check the LANGGRAPH_JSON_POINTS_TO_SERVER_ONLY invariant.

### Problem: Type error on graph return type

**Solution:** Do NOT add an explicit return type to `graph.ts`. The TYPE_TRANSPARENT_RETURN invariant requires the `CompiledStateGraph` type to flow through naturally.

## Related

- [Tools Authoring Guide](./tools-authoring.md) — Adding new tools for agents
- [LangGraph Patterns Spec](../spec/langgraph-patterns.md) — Architecture patterns
- [GRAPH_EXECUTION.md](../GRAPH_EXECUTION.md) — Execution invariants
