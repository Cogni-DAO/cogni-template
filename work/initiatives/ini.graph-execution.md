---
work_item_id: ini.graph-execution
work_item_type: initiative
title: Graph Execution — Transport/Enforcement Split & Contract Tests
state: Active
priority: 1
estimate: 5
summary: Refactor graph executor into transport/enforcement split, add contract tests, consolidate billing reconciliation
outcome: All executor transports pass shared contract suite, billing enforcement centralized in core wrapper, dependency rules enforced
assignees: derekg1729
created: 2026-02-07
updated: 2026-02-07
labels: [ai-graphs, billing, refactoring]
---

# Graph Execution — Transport/Enforcement Split & Contract Tests

> Source: docs/GRAPH_EXECUTOR_AUDIT.md (roadmap content extracted during docs migration)

## Goal

Refactor the graph execution system to centralize billing enforcement in a core wrapper, push transport-only concerns into adapters, add a shared contract test suite for all executor implementations, and close remaining P0/P1 TODO items from the architecture audit.

## Roadmap

### Crawl (P0) — Close Audit TODOs

**Goal:** Resolve open audit findings before structural refactoring.

| Deliverable                                          | Status      | Est | Work Item |
| ---------------------------------------------------- | ----------- | --- | --------- |
| TODO #4b: Persist graphId to charge_receipts DB      | Not Started | 2   | —         |
| TODO #5: Contract tests for executor implementations | Not Started | 3   | —         |
| TODO #7: Remove legacy `recordBilling()` function    | Not Started | 1   | —         |

**TODO #4b — Persist graphId to charge_receipts DB:**

`graphId` is on `UsageFact` and validated via Zod schemas, but not yet persisted to the DB. Requires:

- Add `graphId` column to `charge_receipts` table (`packages/db-schema/src/billing.ts`)
- Add `graphId` to `ChargeReceiptParams` (`src/ports/accounts.port.ts`)
- Pass `fact.graphId` through `commitUsageFact()` → `recordChargeReceipt()` (`billing.ts`, `drizzle.adapter.ts`)
- DB migration
- Stack test: assert `graphId` appears in `charge_receipts` row after completion
- Verify `graphId` does NOT affect idempotency key (key remains `runId/attempt/usageUnitId`)

**TODO #5 — Contract Tests for Executor Implementations:**

No shared contract test suite validates executor implementations against billing/streaming invariants. Each test should be a standalone file under `tests/contract/`.

Required coverage:

- **UsageFact Zod schemas**: strict accepts valid inproc/sandbox facts, rejects missing `usageUnitId`, rejects non-namespaced `graphId`; hints accepts missing `usageUnitId`, rejects wrong `executorType`
- **RunEventRelay validation**: billing-authoritative invalid fact → hard failure (error in stream); external invalid fact → soft warning (billing skipped); `isTerminated` guard → events after done ignored; valid fact → `commitUsageFact` called
- **Executor graphId propagation**: `usage_report` events from inproc/sandbox contain correct `graphId`
- **Event stream ordering**: content → usage_report → assistant_final → done (exactly one done)

**TODO #7 — Remove Legacy `recordBilling()` Function:**

`billing.ts:recordBilling()` is the pre-graph direct billing path. Marked for removal once all execution flows through `commitUsageFact()`. Still has its own `MISSING:` fallback logic that contradicts the strict-fail policy.

### Walk (P1) — Unify Context Envelopes

**Goal:** Standardize context shapes across the executor call chain.

| Deliverable                                           | Status      | Est | Work Item            |
| ----------------------------------------------------- | ----------- | --- | -------------------- |
| TODO #6: Unify CompletionRunContext shapes            | Not Started | 2   | (create at P1 start) |
| TODO #8: Research stable context envelope unification | Not Started | 2   | (create at P1 start) |

**TODO #6 — Unify CompletionRunContext Shapes:**

`executeCompletionUnit` receives `{runId, attempt, ingressRequestId, graphId}` but `createCompletionUnitStream` receives `{runId, attempt, caller, graphId}` — inconsistent context envelope shapes throughout the call chain. Define a single `CompletionRunContext` type.

**TODO #8 — Research Stable Context Envelope Unification:**

Audit all context envelope shapes across the call chain (`RunContext`, `CompletionUnitParams.runContext`, `createCompletionUnitStream`'s inline type) and determine whether a single `CompletionRunContext` type can replace them. Consider whether `caller` (which carries `billingAccountId`/`virtualKeyId`) should be part of the context or passed separately. Check if `RunContext` from `@cogni/ai-core` can be extended rather than defining a new type.

### Run (P2) — Transport/Enforcement Split

**Goal:** Full structural refactoring of the graph executor architecture.

| Deliverable                                                | Status      | Est | Work Item            |
| ---------------------------------------------------------- | ----------- | --- | -------------------- |
| GraphExecutionTransportPort interface                      | Not Started | 2   | (create at P2 start) |
| Core-owned GraphExecutorPort wrapper (billing enforcement) | Not Started | 3   | (create at P2 start) |
| BillingReconciler service (shared across executors)        | Not Started | 3   | (create at P2 start) |
| Migrate InProc/Dev/Sandbox to transport-only adapters      | Not Started | 3   | (create at P2 start) |
| Dependency cruiser + ESLint rules for enforcement          | Not Started | 2   | (create at P2 start) |

**Proposed Target Architecture:**

```
┌─────────────────────────────────────────────────────────────────┐
│                        GraphExecutorPort                        │
│                    (Core-Owned Wrapper)                         │
│                                                                 │
│  Responsibilities:                                              │
│  ✓ Schema validation (UsageFact, AiEvent)                      │
│  ✓ Budget policy + attribution enforcement                     │
│  ✓ Idempotency key generation & validation                     │
│  ✓ Charge receipt strategy (immediate vs deferred)             │
│  ✓ Single BillingReconciler pipeline shared across executors   │
└────────────────────┬────────────────────────────────────────────┘
                     │ delegates to
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                  GraphExecutionTransportPort                    │
│                    (Adapter-Owned Interface)                    │
│                                                                 │
│  Responsibilities:                                              │
│  ✓ Start/stream/cancel execution (IO only)                     │
│  ✓ Return canonical events in strict schema                    │
│  ✓ Return usageFacts[] with stable keys                        │
│  ✗ NO direct billing writes                                    │
│  ✗ NO policy decisions (budgets, attribution)                  │
└─────────────────────────────────────────────────────────────────┘
         ▲                    ▲                    ▲
         │                    │                    │
    ┌────┴────┐          ┌────┴────┐         ┌────┴────┐
    │ InProc  │          │   Dev   │         │ Sandbox │
    │Transport│          │Transport│         │Transport│
    └─────────┘          └─────────┘         └─────────┘
```

**Concrete Refactor Moves:**

Move OUT of Adapters → INTO Core Wrapper:

1. **Billing policy decisions** (`canSpend`, budget checks, attribution rules)
2. **Receipt/ledger writes** (all `accountService.recordChargeReceipt` call sites)
3. **Canonical event mapping** (normalize adapter-specific events to AiEvent schema)
4. **Idempotency key generation** (shared `computeIdempotencyKey` validator)

Move INTO Transport Adapters ONLY:

1. **Provider-specific execution logic** (LangGraph server calls, sandbox plumbing, OpenClaw interaction)
2. **Provider-specific parsing** (raw SDK responses → canonical events + usageFacts)

Introduce NEW Components:

1. **BillingReconciler Service** — Consumes `usageFacts[]` from transports, produces charge receipts idempotently, shared by all executors, handles both immediate (in-proc) and deferred (external polling) strategies

2. **Shared Contract Test Suite** (`tests/contract/graph-executors/transport-contract.test.ts`) — Validates every transport against: event stream shape, cancellation semantics, idempotency, usage facts schema, billing side effects prohibition

**Mechanical Enforcement:**

Dependency Cruiser rules (`no-adapter-imports-in-core`, `no-db-client-in-adapters`, `no-billing-writes-in-adapters`, `executors-via-port-only`) and ESLint restricted imports to enforce the transport/enforcement split at build time.

### Validation Plan

**Pre-Refactor Baseline:**

1. Capture current behavior: `pnpm test:stack:docker`, `pnpm check:full`
2. Document current violations: files violating future dependency rules, executors without contract tests

**Post-Refactor Proofs:**

| Invariant           | Proof Command                                                          |
| ------------------- | ---------------------------------------------------------------------- |
| ONE_LEDGER_WRITER   | `git grep -r 'recordChargeReceipt' src/` → only billing.ts             |
| IDEMPOTENT_CHARGES  | `pnpm test:stack -- billing-idempotency`                               |
| SCHEMA_VALIDATION   | Inject malformed UsageFact → Zod error before billing                  |
| Contract Compliance | `pnpm test:contract -- graph-executors` → all transports pass          |
| Billing Coverage    | `pnpm test:stack -- streaming-side-effects` → all executor types write |

**Inline vs Reconciliation Strategy:**

- **Inline Billing** (P0: InProc, Sandbox): Trusted component captures `provider_call_id` + usage inline per LLM call. Commits per-call UsageFacts during execution.
- **Reconciliation Billing** (P1: External LangGraph Server): External executor outside trusted boundary. Query `/spend/logs` after stream completes. Server-controlled identity + metadata ensure correctness.

---

## Roadmap — Graph Execution Design Track

> Source: docs/GRAPH_EXECUTION.md (roadmap content extracted during docs migration)

### Crawl (P0) — Remaining Tests & Graph #2

**Goal:** Close remaining test gaps and enable multi-graph support.

| Deliverable                                                                     | Status      | Est | Work Item |
| ------------------------------------------------------------------------------- | ----------- | --- | --------- |
| Grep test for ONE_LEDGER_WRITER (depcruise impractical)                         | Not Started | 1   | —         |
| Idempotency test: replay same (source_system, source_reference) → 1 row         | Not Started | 1   | —         |
| Define/retain exactly one `CompletionFinalResult` union (`ok:true \| ok:false`) | Not Started | 1   | —         |
| Ensure failures use the union, not fake usage/finishReason patches              | Not Started | 1   | —         |
| Verify single run streaming event contract (InProc + future Server)             | Not Started | 1   | —         |
| Graph #2: Create `packages/langgraph-graphs/src/graphs/research/` factory       | Not Started | 1   | —         |
| Graph #2: Implement `createResearchGraph()` in package                          | Not Started | 1   | —         |
| Graph #2: Add `research` entry to catalog (`@cogni/langgraph-graphs`)           | Not Started | 1   | —         |
| Graph #2: Expose via `listGraphs()` on aggregator                               | Not Started | 1   | —         |
| Graph #2: UI adds graph selector → sends `graphId`                              | Not Started | 1   | —         |
| Graph #2: E2E test for graph switching                                          | Not Started | 1   | —         |

### Walk (P1) — Run Persistence, Compiled Graphs, Node Config

**Goal:** Add run persistence, complete compiled graph migration, enable per-node model/tool overrides.

#### P1: Run Persistence + Attempt Semantics

| Deliverable                                                             | Status      | Est | Work Item            |
| ----------------------------------------------------------------------- | ----------- | --- | -------------------- |
| Add `graph_runs` table for run persistence (enables attempt semantics)  | Not Started | 3   | (create at P1 start) |
| Add `attempt-semantics.test.ts`: resume does not change attempt         | Not Started | 1   | (create at P1 start) |
| Add stack test: graph emits `usage_report`, billing records charge      | Not Started | 1   | (create at P1 start) |
| Replace hardcoded UI agent list with API fetch from `/api/v1/ai/agents` | Not Started | 1   | (create at P1 start) |

**Note:** Graph-specific integration tests are documented in [LangGraph Patterns](../../docs/spec/langgraph-patterns.md).

#### P1: Compiled Graph Execution (remaining items)

| Deliverable                                                                         | Status      | Est | Work Item            |
| ----------------------------------------------------------------------------------- | ----------- | --- | -------------------- |
| Refactor Cogni provider to import from `cogni-exec.ts` entrypoints                  | Not Started | 2   | (create at P1 start) |
| Verify billing: cogni-exec path emits `usage_report` with `litellmCallId`/`costUsd` | Not Started | 1   | (create at P1 start) |
| Stack test: both entrypoints produce identical graph output for same input          | Not Started | 2   | (create at P1 start) |

#### P1: Node-Keyed Model & Tool Configuration

Per-node model/tool overrides via flat configurable keys: `<nodeKey>__model`, `<nodeKey>__toolIds`. Resolution: override ?? default.

**File Pointers (planned changes):**

| File                                                                | Change                                                     |
| ------------------------------------------------------------------- | ---------------------------------------------------------- |
| `packages/langgraph-graphs/src/runtime/config-resolvers.ts`         | New: `resolveModel()`, `resolveToolIds()` shared resolvers |
| `packages/langgraph-graphs/src/runtime/cogni/completion-adapter.ts` | Accept optional `nodeKey`; use resolver in `invoke()`      |
| `packages/langgraph-graphs/src/runtime/langchain-tools.ts`          | Use `resolveToolIds()` for allowlist check                 |

| Deliverable                                                               | Status      | Est | Work Item            |
| ------------------------------------------------------------------------- | ----------- | --- | -------------------- |
| Create `config-resolvers.ts` with shared resolvers                        | Not Started | 1   | (create at P1 start) |
| Update `CogniCompletionAdapter` to accept `nodeKey`, use `resolveModel()` | Not Started | 1   | (create at P1 start) |
| Update tool wrappers to use `resolveToolIds()`                            | Not Started | 1   | (create at P1 start) |
| Unit tests: resolver edge cases (missing config, override precedence)     | Not Started | 1   | (create at P1 start) |
| Integration test: two-node graph with `planner__model` override           | Not Started | 1   | (create at P1 start) |

### Run (P2+) — External Adapters

**Goal:** Add external execution adapters for Claude Agent SDK, n8n, and future engines.

| Deliverable                                                                                   | Status      | Est | Work Item            |
| --------------------------------------------------------------------------------------------- | ----------- | --- | -------------------- |
| Claude Agent SDK Adapter (see [ini.claude-sdk-adapter.md](ini.claude-sdk-adapter.md))         | Not Started | 5   | (create at P2 start) |
| n8n Workflow Adapter (see [ini.n8n-integration.md](ini.n8n-integration.md))                   | Not Started | 5   | (create at P2 start) |
| OpenClaw/Clawdbot Adapter (superseded by ini.sandboxed-agents.md; original: Clawdbot/Moltbot) | Superseded  | —   | —                    |
| Future external adapters (Flowise/custom) — build only if demand materializes                 | Not Started | —   | (create if needed)   |

**P2 Adapter Checklists (from source):**

**Claude Agent SDK:**

- [ ] Create `ClaudeAgentExecutor` implementing `GraphExecutorPort`
- [ ] Map SDK `SDKMessage` stream → `AiEvent` stream
- [ ] Bridge tools via in-process MCP server (`createSdkMcpServer`)
- [ ] Emit `usage_report` with `session_id`-based `usageUnitId`
- [ ] Add `anthropic_sdk` to `SOURCE_SYSTEMS` enum

**n8n Workflow:**

- [ ] Create `N8nWorkflowExecutor` implementing `GraphExecutorPort`
- [ ] Invoke n8n workflows via webhook POST
- [ ] Support sync response mode (wait for completion)
- [ ] Reconcile billing via LiteLLM spend logs (LLM routed through gateway)
- [ ] Emit `usage_report` with `execution_id`-based `usageUnitId`

**Clawdbot/Moltbot (superseded by OpenClaw sandbox integration):**

- [ ] Create `ClawdbotExecutorAdapter` implementing `GraphExecutorPort`
- [ ] Invoke Moltbot Gateway via `/v1/chat/completions` with SSE streaming
- [ ] Route all LLM calls through LiteLLM (DAO billing via virtual key)
- [ ] Containment: sandboxing enabled, elevated disabled, egress allowlist
- [ ] Privileged integrations via Cogni bridge tool (toolRunner.exec)
- [ ] Reconcile billing via LiteLLM spend logs (end_user correlation)

> Note: Clawdbot/Moltbot adapter has been superseded by the OpenClaw sandbox integration. See [openclaw-sandbox-spec.md](../../docs/spec/openclaw-sandbox-spec.md) and [ini.sandboxed-agents.md](ini.sandboxed-agents.md). These checklist items are preserved for NO_DATA_LOSS but should be considered historical.

### Known Issues & Risk Flags

**Known Issues:**

- [ ] `usage_report` only emitted on success; error/abort with partial usage not billed (P1: add optional `usage` to error result)

**LangGraph Server Adapter — Billing Parity Gap (P0 Gated):**

`langgraph_server` executor is internal/experimental only in P0. Cannot be a customer-billable path until it achieves billing-grade `UsageFact` parity.

| Field         | InProc | Server | Notes                                |
| ------------- | ------ | ------ | ------------------------------------ |
| `usageUnitId` | Yes    | No     | Requires `x-litellm-call-id` capture |
| `costUsd`     | Yes    | No     | Requires `x-litellm-response-cost`   |
| `model`       | Yes    | No     | Requires resolved model from LiteLLM |

**Fix path (if server must be paid in P0):** `langgraph-server` must capture LiteLLM response headers (`call-id`, `response-cost`, `model`, tokens) and emit `usage_report` with `usageUnitId=litellmCallId`. Without this, billing idempotency relies on `callIndex` fallback which is unsafe.

**Risk Flags:**

1. **callIndex fallback is nondeterministic under concurrency/resume** — Must remain error-only path and not become normal operation. If `callIndex` fallback frequency exceeds threshold, investigate root cause.

2. **USAGE_EMIT_ON_FINAL_ONLY implies partial failures are unbilled** — Explicitly accepted for P0. If graph fails mid-execution after N LLM calls, those calls are not billed. Add partial-usage reporting in P1 if revenue leakage is material.

3. **Server path without usageUnitId breaks idempotency** — If server path is exposed to customers without fix, duplicate charges are possible on retry. Gate behind feature flag until resolved.

---

## Constraints

- ONE_LEDGER_WRITER: Only `billing.ts` calls `recordChargeReceipt()`
- IDEMPOTENT_CHARGES: `source_reference` prevents duplicates; key = `${runId}/${attempt}/${usageUnitId}`
- ZERO_CREDIT_RECEIPTS: Always write receipt, even $0
- GRAPH_LLM_VIA_COMPLETION: InProc graphs use completion unit
- BILLING_INDEPENDENT_OF_CLIENT: Pump continues regardless of UI disconnect
- GRAPH_FINALIZATION_ONCE: Exactly one `done` event per run
- USAGE_FACT_VALIDATED: Zod schema at ingestion boundary (strict for inproc/sandbox, hints for external)
- GRAPHID_REQUIRED: `graphId` on UsageFact, typed as GraphId in port
- EXTERNAL_BILLING_VIA_RECONCILIATION: Dev/external providers defer billing to reconciliation

## Invariants Registry (from Audit)

| ID                                    | Invariant                                 | Owner                  | Status                                                          |
| ------------------------------------- | ----------------------------------------- | ---------------------- | --------------------------------------------------------------- |
| `ONE_LEDGER_WRITER`                   | Only billing.ts calls recordChargeReceipt | billing.ts             | ✅ Implemented                                                  |
| `IDEMPOTENT_CHARGES`                  | source_reference prevents duplicates      | DB + billing.ts        | ✅ Enforced (strict schema, no fallback)                        |
| `ZERO_CREDIT_RECEIPTS`                | Always write receipt, even $0             | billing.ts             | ✅ Implemented                                                  |
| `GRAPH_LLM_VIA_COMPLETION`            | InProc graphs use completion unit         | inproc.provider.ts     | ✅ Implemented                                                  |
| `BILLING_INDEPENDENT_OF_CLIENT`       | Pump continues regardless of UI           | ai_runtime.ts          | ✅ Implemented                                                  |
| `GRAPH_FINALIZATION_ONCE`             | Exactly one done event per run            | graph-executor.port.ts | ⚠️ isTerminated guard in relay, not in port                     |
| `P0_ATTEMPT_FREEZE`                   | attempt always 0 in P0                    | All adapters           | ✅ Hardcoded everywhere                                         |
| `PROTOCOL_TERMINATION`                | UI stream ends on done/error              | ai_runtime.ts          | ✅ Implemented                                                  |
| `USAGE_FACT_VALIDATED`                | Zod schema at ingestion boundary          | RunEventRelay          | ✅ Strict for inproc/sandbox, hints for ext                     |
| `GRAPHID_REQUIRED`                    | graphId on UsageFact, typed in port       | ai-core + port         | ⚠️ In UsageFact + Zod; NOT in charge_receipts DB yet (TODO #4b) |
| `GRAPHNAME_REQUIRED`                  | graphName required at all boundaries      | contracts + facade     | ✅ No defaults, fail fast                                       |
| `EXTERNAL_BILLING_VIA_RECONCILIATION` | Dev provider defers billing               | dev/provider.ts        | ⚠️ Emits hints-only fact, reconciliation P1                     |

## Dependencies

- [x] GraphExecutorPort (existing)
- [x] UsageFact Zod schemas (existing)
- [x] RunEventRelay billing pipeline (existing)
- [ ] charge_receipts graphId column (TODO #4b)

## As-Built Specs

- [Graph Execution](../../docs/spec/graph-execution.md)

## Design Notes

- Audit report: (deleted, content preserved in this initiative — point-in-time, 2026-02-07)
- GraphProvider is an internal adapter interface, NOT a port — acceptable for current executor count (3)
- ⚠️ BYPASS RISK: No architectural enforcement prevents facades from importing adapters directly (only convention + arch_probes)
- Dev provider emits hints-only UsageFact (no usageUnitId); full reconciliation deferred to P1
- Sandbox billing: header capture, executorType "sandbox", graphId in UsageFact — DB persistence pending

### File Reference Index (from Audit)

**Core Port Definitions:**

- `src/ports/graph-executor.port.ts` — GraphExecutorPort interface
- `src/ports/accounts.port.ts` — AccountService interface (recordChargeReceipt)
- `src/types/ai-events.ts` — AiEvent schema
- `packages/ai-core/src/usage/usage.ts` — UsageFact schema

**Executor Implementations:**

- `src/adapters/server/ai/aggregating-executor.ts:41` — AggregatingGraphExecutor
- `src/adapters/server/ai/observability-executor.decorator.ts:69` — ObservabilityGraphExecutorDecorator
- `src/adapters/server/ai/langgraph/inproc.provider.ts:91` — LangGraphInProcProvider
- `src/adapters/server/ai/langgraph/dev/provider.ts:64` — LangGraphDevProvider
- `src/adapters/server/sandbox/sandbox-graph.provider.ts:81` — SandboxGraphProvider

**Billing & Usage:**

- `src/features/ai/services/billing.ts:67` — recordBilling() (legacy, marked TODO)
- `src/features/ai/services/billing.ts:190` — commitUsageFact() (run-centric)
- `src/features/ai/services/billing.ts:166` — computeIdempotencyKey()
- `src/features/ai/services/ai_runtime.ts:182` — RunEventRelay (pump + fanout)

**Composition & Wiring:**

- `src/bootstrap/graph-executor.factory.ts:50` — createGraphExecutor()
- `src/bootstrap/container.ts` — Dependency injection container

**Tests:**

- `tests/stack/ai/billing-idempotency.stack.test.ts` — Idempotency validation
- `tests/stack/ai/streaming-side-effects.stack.test.ts` — Billing coverage
- `tests/stack/ai/one-ledger-writer.stack.test.ts` — Single writer validation
