---
id: langgraph-server-guide
type: guide
title: LangGraph Server Setup
status: draft
trust: draft
summary: How to run LangGraph Server in local dev, container, and hosted modes.
read_when: Setting up or switching between LangGraph Server execution modes.
owner: derekg1729
created: 2026-02-07
verified:
tags: [ai-graphs, langgraph]
---

# LangGraph Server Setup

> Source: docs/LANGGRAPH_SERVER.md

## When to Use This

You need to run LangGraph graphs via an external server process (not InProc). Three modes are available: local dev, Docker container, and hosted.

## Preconditions

- [ ] `packages/langgraph-graphs/` builds cleanly (`pnpm packages:build`)
- [ ] Graphs registered in `langgraph.json`
- [ ] For container mode: Docker installed and running
- [ ] For hosted mode: LangSmith account or managed LangGraph endpoint

## Steps

### A) Local Dev (fast iteration)

**Command:** `pnpm langgraph:dev`

**Behavior:** Runs LangGraph server in dev mode for local graph iteration. Dev mode uses in-memory checkpointer; do not rely on persistence across restarts.

**Next.js integration:** Set `LANGGRAPH_DEV_URL=http://localhost:2024` in `.env.local`.

### B) Container Build + Run (production-like)

**Commands:**

- `pnpm langgraph:build` (build image or dist)
- `pnpm langgraph:up` (bring up langgraph-server + redis via compose)

**Requirement:** `docker compose up` must start:

- `langgraph-server` container
- `redis` (required for persistent checkpointer/state in container mode)

### C) Hosted LangGraph (LangSmith / managed)

**Requirement:** Set `LANGGRAPH_SERVER_URL=<hosted endpoint>` in Next.js runtime.

**Optional:** `LANGGRAPH_SERVER_API_KEY` (if hosted requires it) passed into SDK `Client(...)`.

## Verification

```bash
pnpm langgraph:dev
```

Expected: Server starts on port 2024 and `/assistants/.../schemas` resolves.

For container mode:

```bash
pnpm langgraph:up
```

Expected: Container starts with health endpoint at port 8123.

## Troubleshooting

### Problem: `langgraph dev` fails to start

**Solution:** Ensure `packages/langgraph-graphs/langgraph.json` has valid graph registrations pointing to `server.ts` entrypoints (not `cogni-exec.ts`). Run `pnpm packages:build` first.

### Problem: Next.js can't connect to dev server

**Solution:** Verify `LANGGRAPH_DEV_URL=http://localhost:2024` is set in `.env.local`. The dev server uses port 2024; container mode uses port 8123.

## Related

- [LangGraph Server Spec](../spec/langgraph-server.md) — Architecture, invariants, adapter contract
- [LangGraph Patterns Spec](../spec/langgraph-patterns.md) — Package structure, InProc execution
- [Agent Development Guide](./agent-development.md) — Adding new graph definitions
