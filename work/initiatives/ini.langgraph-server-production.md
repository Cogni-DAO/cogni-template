---
work_item_id: ini.langgraph-server-production
work_item_type: initiative
title: LangGraph Server Production Readiness
state: Active
priority: 1
estimate: 5
summary: Evolve LangGraph Server from MVP (langgraph dev) to production Docker deployment with Postgres persistence, LiteLLM billing parity, and compliance.
outcome: Production-grade LangGraph Server with full billing reconciliation, persistent checkpoints, and Docker deployment.
assignees: derekg1729
created: 2026-02-07
updated: 2026-02-07
labels: [ai-graphs, langgraph, infrastructure]
---

# LangGraph Server Production Readiness

> Source: docs/LANGGRAPH_SERVER.md

## Goal

Evolve LangGraph Server integration from MVP (`langgraph dev`, in-memory, best-effort billing) to production-grade Docker deployment with Postgres persistence, Redis, full LiteLLM billing parity, and compliance-ready data deletion.

## Roadmap

### Crawl (MVP — langgraph dev)

**Goal:** Connect to `langgraph dev` server for development workflows. In-memory checkpointer. Same graphIds as InProc. Internal/experimental only — not customer-billable.

| Deliverable                                               | Status | Est | Work Item |
| --------------------------------------------------------- | ------ | --- | --------- |
| Add `@langchain/langgraph-sdk` to root `package.json`     | Done   | 1   | —         |
| Add `@langchain/langgraph-cli` devDep to langgraph-graphs | Done   | 1   | —         |
| Create `langgraph.json` with graph registration           | Done   | 1   | —         |
| Add `langgraph:dev` script to root `package.json`         | Done   | 1   | —         |
| Create SDK client factory (`dev/client.ts`)               | Done   | 1   | —         |
| Create UUIDv5 thread derivation (`dev/thread.ts`)         | Done   | 1   | —         |
| Create SDK → AiEvent stream translator                    | Done   | 2   | —         |
| Create `LangGraphDevProvider` (execution)                 | Done   | 2   | —         |
| Create `LangGraphDevAgentCatalogProvider` (discovery)     | Done   | 1   | —         |
| Update `graph-executor.factory.ts` env-based selection    | Done   | 1   | —         |
| Update `agent-discovery.ts` env-based selection           | Done   | 1   | —         |
| Add `LANGGRAPH_DEV_URL` to `.env.local.example`           | Done   | 1   | —         |
| Smoke test: `pnpm langgraph:dev` + chat streams correctly | Done   | 1   | —         |

**MVP Known Limitations:**

| Limitation                | Impact                                      | Resolution                             |
| ------------------------- | ------------------------------------------- | -------------------------------------- |
| No `usageUnitId`          | Billing uses fallback path                  | P1: LiteLLM header capture             |
| No `costUsd`              | Cannot bill accurately                      | P1: LiteLLM header capture             |
| In-memory only            | No persistence across restarts              | P1: Postgres checkpointer              |
| Manual catalog sync       | Must update both catalog and langgraph.json | P1: Build-time generation              |
| Late tool_call visibility | Tool may execute before chunk arrives       | Buffered; 64KB args / 100 pending caps |

**MVP Catalog Alignment:**

P0 (Manual): When adding a graph, update both:

1. `packages/langgraph-graphs/src/catalog.ts` (`LANGGRAPH_CATALOG`)
2. `packages/langgraph-graphs/langgraph.json`

Keys must match (e.g., `"poet"` in both places).

P1 (Automated): Build-time generation from `LANGGRAPH_CATALOG` → `langgraph.json`.

### Walk (P1 — Docker + Postgres + Billing Parity)

**Goal:** Full production server with Docker, Postgres checkpointer, Redis, LiteLLM billing parity. Requires MVP completion first.

**Dependency order:** Shared Contracts → Package Scaffold → Container → Postgres → LiteLLM → Graph → Adapter → Tests

#### Step 1: Shared Contracts Extraction (CRITICAL)

Extract cross-process types to `packages/ai-core/` so `packages/langgraph-server/` can import them.

**Extraction order** (reverse dependency): `SourceSystem` → `UsageFact`/`ExecutorType` → `AiEvent` → `RunContext`

| Deliverable                                                         | Status      | Est | Work Item |
| ------------------------------------------------------------------- | ----------- | --- | --------- |
| Create `packages/ai-core/` with pnpm workspace config               | Not Started | 2   | —         |
| Move `SOURCE_SYSTEMS` + `SourceSystem` → `ai-core/billing/`         | Not Started | 1   | —         |
| Move `UsageFact`, `ExecutorType` → `ai-core/usage/`                 | Not Started | 1   | —         |
| Move `AiEvent` types → `ai-core/events/`                            | Not Started | 1   | —         |
| Move `RunContext` → `ai-core/context/`                              | Not Started | 1   | —         |
| Create `ai-core/src/index.ts` barrel export                         | Not Started | 1   | —         |
| Update `src/types/` to re-export from `@cogni/ai-core` (shim)       | Not Started | 1   | —         |
| Add dependency-cruiser rule: `packages/**` cannot import `src/**`   | Not Started | 1   | —         |
| Add grep test: AiEvent/UsageFact defined only in `packages/ai-core` | Not Started | 1   | —         |

**Files to migrate:**

| From                                                       | To                                              |
| ---------------------------------------------------------- | ----------------------------------------------- |
| `src/types/ai-events.ts`                                   | `packages/ai-core/src/events/ai-events.ts`      |
| `src/types/usage.ts`                                       | `packages/ai-core/src/usage/usage.ts`           |
| `src/types/run-context.ts`                                 | `packages/ai-core/src/context/run-context.ts`   |
| `src/types/billing.ts` (`SOURCE_SYSTEMS` + `SourceSystem`) | `packages/ai-core/src/billing/source-system.ts` |

#### Step 2: Package Scaffold

| Deliverable                                                            | Status      | Est | Work Item |
| ---------------------------------------------------------------------- | ----------- | --- | --------- |
| Create `packages/langgraph-server/` with minimal health endpoint       | Not Started | 2   | —         |
| Create `packages/langgraph-graphs/` with feature-sliced structure      | Not Started | 2   | —         |
| Configure both packages to depend on `@cogni/ai-core`                  | Not Started | 1   | —         |
| Add dependency-cruiser rule: no `src/**` → `packages/langgraph-graphs` | Not Started | 1   | —         |

#### Step 3: Container Scaffold

| Deliverable                                                           | Status      | Est | Work Item |
| --------------------------------------------------------------------- | ----------- | --- | --------- |
| Create `platform/infra/services/runtime/langgraph-server/Dockerfile`  | Not Started | 2   | —         |
| Add langgraph-server to `docker-compose.dev.yml` with networks/health | Not Started | 1   | —         |
| Verify container builds and starts with health endpoint               | Not Started | 1   | —         |

#### Step 4: Postgres Provisioning

| Deliverable                                                   | Status      | Est | Work Item |
| ------------------------------------------------------------- | ----------- | --- | --------- |
| Add langgraph schema/DB to existing Postgres (reuse instance) | Not Started | 1   | —         |
| Add `LANGGRAPH_DATABASE_URL` env var to langgraph-server      | Not Started | 1   | —         |
| Configure LangGraph.js with Postgres checkpointer             | Not Started | 2   | —         |

#### Step 5: LiteLLM Wiring

| Deliverable                                                      | Status      | Est | Work Item |
| ---------------------------------------------------------------- | ----------- | --- | --------- |
| Add env vars: `LITELLM_BASE_URL`, `LITELLM_API_KEY`              | Not Started | 1   | —         |
| Configure LangGraph.js LLM client to use LiteLLM as base_url     | Not Started | 1   | —         |
| Verify langgraph-server can make test completion through litellm | Not Started | 1   | —         |

#### Step 6: Spend Attribution Headers

| Deliverable                                                                                           | Status      | Est | Work Item |
| ----------------------------------------------------------------------------------------------------- | ----------- | --- | --------- |
| Define canonical metadata payload: `{ accountId, runId, threadId, requestId, traceId, executorType }` | Not Started | 1   | —         |
| Attach metadata to LiteLLM calls via `x-litellm-spend-logs-metadata` header                           | Not Started | 2   | —         |
| Verify litellm spend logs contain metadata for test runs                                              | Not Started | 1   | —         |

#### Step 7: Minimal Graph + Endpoint

| Deliverable                                                                                   | Status      | Est | Work Item |
| --------------------------------------------------------------------------------------------- | ----------- | --- | --------- |
| Create chat graph in `packages/langgraph-graphs/graphs/chat/`                                 | Not Started | 2   | —         |
| Expose run endpoint: `{ accountId, runId, stateKey?, model, messages[], requestId, traceId }` | Not Started | 2   | —         |
| Derive `thread_id` server-side as `${accountId}:${stateKey \|\| runId}`                       | Not Started | 1   | —         |
| Return SSE stream with text deltas + final message + done                                     | Not Started | 2   | —         |

#### Step 8: LangGraphServerAdapter

| Deliverable                                                            | Status      | Est | Work Item |
| ---------------------------------------------------------------------- | ----------- | --- | --------- |
| Create `src/adapters/server/ai/langgraph-server.adapter.ts`            | Not Started | 2   | —         |
| Implement `GraphExecutorPort` interface                                | Not Started | 1   | —         |
| Build request payload with server-derived identity context             | Not Started | 1   | —         |
| Translate server stream → AiEvents (text_delta, assistant_final, done) | Not Started | 2   | —         |
| Emit `usage_report` with `executorType: 'langgraph_server'`            | Not Started | 1   | —         |

#### Step 9: Model Allowlist

| Deliverable                                                 | Status      | Est | Work Item |
| ----------------------------------------------------------- | ----------- | --- | --------- |
| Define model allowlist in Next.js (maps to LiteLLM aliases) | Not Started | 1   | —         |
| Select model server-side (not from client)                  | Not Started | 1   | —         |
| Pass selectedModel to langgraph-server in request           | Not Started | 1   | —         |

#### Step 10: Billing + Stack Tests

| Deliverable                                                         | Status      | Est | Work Item |
| ------------------------------------------------------------------- | ----------- | --- | --------- |
| Add `'langgraph_server'` to `SOURCE_SYSTEMS` enum                   | Not Started | 1   | —         |
| Stack test: docker compose up → chat request → HTTP 200 + done      | Not Started | 2   | —         |
| Stack test: langgraph_server path creates charge_receipt row        | Not Started | 2   | —         |
| Verify traceId/requestId flow: Next.js → langgraph-server → LiteLLM | Not Started | 1   | —         |

#### Chores

| Deliverable                   | Status      | Est | Work Item |
| ----------------------------- | ----------- | --- | --------- |
| Observability instrumentation | Not Started | 2   | —         |
| Documentation updates         | Not Started | 1   | —         |

**P1 File Pointers (planned changes):**

| File                                                   | Change                                                                               |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `packages/ai-core/`                                    | New: Shared cross-process types (AiEvent, UsageFact, etc.)                           |
| `packages/ai-core/src/events/ai-events.ts`             | Move from `src/types/ai-events.ts`                                                   |
| `packages/ai-core/src/usage/usage.ts`                  | Move from `src/types/usage.ts`                                                       |
| `packages/ai-core/src/context/run-context.ts`          | Move from `src/types/run-context.ts`                                                 |
| `packages/ai-core/src/billing/source-system.ts`        | Extract SourceSystem from `src/types/billing.ts`                                     |
| `packages/langgraph-server/`                           | New: LangGraph Server service code (Node.js/LangGraph.js)                            |
| `packages/langgraph-graphs/`                           | New: Feature-sliced graph definitions                                                |
| `packages/langgraph-graphs/graphs/chat/`               | New: Chat graph definition                                                           |
| `platform/infra/services/runtime/langgraph-server/`    | New: Dockerfile + compose config                                                     |
| `platform/infra/services/runtime/docker-compose.*.yml` | Add langgraph-server service with networks/healthcheck                               |
| `src/adapters/server/ai/langgraph-server.adapter.ts`   | New: `LangGraphServerAdapter` implementing GraphExecutorPort                         |
| `src/types/ai-events.ts`                               | Convert to re-export shim from `@cogni/ai-core`                                      |
| `src/types/usage.ts`                                   | Convert to re-export shim from `@cogni/ai-core`                                      |
| `src/types/billing.ts`                                 | Add `'langgraph_server'` to `SOURCE_SYSTEMS`                                         |
| `src/bootstrap/graph-executor.factory.ts`              | Add LangGraphServerAdapter selection logic                                           |
| `src/features/ai/services/ai_runtime.ts`               | Add thread_id derivation (tenant-scoped)                                             |
| `.dependency-cruiser.cjs`                              | Add rules: no `packages/**` → `src/**`, no `src/**` → `packages/langgraph-graphs/**` |

### Run (P2 — Production Service + Billing + Compliance)

**Goal:** LangGraph Server as a proper production service with real billing, compliance-ready deletion, and additional executor backends.

#### Production Service with Billing

| Deliverable                                                                           | Status      | Est | Work Item |
| ------------------------------------------------------------------------------------- | ----------- | --- | --------- |
| Deploy LangGraph Server to production infrastructure (Akash/Spheron)                  | Not Started | 3   | —         |
| Production LiteLLM billing reconciliation (not best-effort — customer-billable)       | Not Started | 3   | —         |
| Per-user virtual key routing through LangGraph Server → LiteLLM                       | Not Started | 3   | —         |
| Production monitoring and alerting for LangGraph Server                               | Not Started | 2   | —         |
| mTLS/JWT service auth between Next.js and LangGraph Server                            | Not Started | 2   | —         |
| Automated catalog sync (build-time `LANGGRAPH_CATALOG` → `langgraph.json` generation) | Not Started | 2   | —         |

#### Checkpoint Deletion (Compliance)

| Deliverable                                                                          | Status      | Est | Work Item |
| ------------------------------------------------------------------------------------ | ----------- | --- | --------- |
| Implement deletion for LangGraph checkpoint tables by tenant-scoped thread_id prefix | Not Started | 3   | —         |
| Coordinate artifact + checkpoint deletion for user data requests                     | Not Started | 2   | —         |
| Add stack test: delete user data → checkpoints removed                               | Not Started | 2   | —         |

#### Claude Agents SDK Adapter

| Deliverable                                                | Status      | Est | Work Item |
| ---------------------------------------------------------- | ----------- | --- | --------- |
| Create `ClaudeSdkAdapter` implementing `GraphExecutorPort` | Not Started | 3   | —         |
| Translate Claude SDK events → AiEvents                     | Not Started | 2   | —         |
| Emit `usage_report` with `executorType: 'claude_sdk'`      | Not Started | 1   | —         |

> **Note:** Claude Agents SDK Adapter — do NOT build preemptively. Only when Claude SDK is the chosen execution path.

## Constraints

- MVP must complete before P1 work begins
- P1 dependency order: Shared Contracts → Package Scaffold → Container → Postgres → LiteLLM → Graph → Adapter → Tests
- `end_user` correlation validated in MVP; reconciler implementation in progress
- P0 does NOT provide compliant user data deletion — document explicitly; implement in P1
- Server billing gap: Server currently lacks billing-grade `UsageFact` fields (`usageUnitId`, `costUsd`, resolved `model`) — cannot be customer-billable path until P1 LiteLLM header capture resolves this

### Billing via Reconciliation (Validated)

| Step | Component   | Action                                               |
| ---- | ----------- | ---------------------------------------------------- |
| 1    | `server.ts` | `configurableFields: ["model", "user"]`              |
| 2    | Provider    | `configurable.user = ${runId}/${attempt}`            |
| 3    | LiteLLM     | Stores as `end_user` in spend_logs                   |
| 4    | Reconciler  | `GET /spend/logs?end_user=...` → `commitUsageFact()` |

P0 status: `end_user` correlation validated. Reconciler implementation in progress.

### Roadmap items from LANGGRAPH_AI.md

> Source: docs/LANGGRAPH_AI.md

- Server path billing gap: Server lacks `usageUnitId` and `costUsd` from LiteLLM headers (covered by P1 Step 6 above)
- Stream controller "already closed" error — non-blocking; stream completes despite error on client disconnect
- Tool call ID architecture — P0 workaround generates UUID; P1 should propagate model's `tool_call_id`

## Dependencies

- [ ] MVP (`langgraph dev` adapter) — complete
- [ ] `packages/ai-core/` shared contracts extraction
- [ ] Docker infrastructure (`platform/infra/services/runtime/`)
- [ ] LiteLLM proxy operational with spend attribution

## As-Built Specs

- [LangGraph Server spec](../../docs/spec/langgraph-server.md)
- [LangGraph Patterns spec](../../docs/spec/langgraph-patterns.md)

## Design Notes

### Phased Implementation Overview

| Phase   | Backend              | Purpose                            | Persistence      | Billing                 |
| ------- | -------------------- | ---------------------------------- | ---------------- | ----------------------- |
| **MVP** | `langgraph dev`      | Local development, graph iteration | In-memory        | Best-effort (no parity) |
| **P1**  | `langgraph build/up` | Production-like, Docker            | Postgres + Redis | Full parity required    |

MVP Scope: Connect to `langgraph dev` server for development workflows. In-memory checkpointer. Same graphIds as InProc. Internal/experimental only — not customer-billable.

P1 Scope: Full production server with Docker, Postgres checkpointer, Redis, LiteLLM billing parity.
