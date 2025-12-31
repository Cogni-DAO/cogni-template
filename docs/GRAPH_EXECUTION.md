# Graph Execution Design

> [!CRITICAL]
> All graph execution flows through `GraphExecutorPort`. Billing is run-centric with idempotency enforced by `(source_system, source_reference)` where `source_reference` includes `run_id/attempt`.

## Core Invariants

1. **UNIFIED_GRAPH_EXECUTOR**: All graphs (in-proc LangGraph, Claude SDK, future n8n/Flowise) execute via `GraphExecutorPort.runGraph()`. No execution path bypasses this interface.

2. **ONE_LEDGER_WRITER**: Only `billing.ts` can call `accountService.recordChargeReceipt()`. Enforced by depcruise rule + stack test.

3. **IDEMPOTENT_CHARGES**: `idempotency_key = ${run_id}/${attempt}/${usage_unit_id}`. Stored in `source_reference`. DB unique constraint on `(source_system, source_reference)`. Adapters own `usage_unit_id` stability.

4. **RUN_SCOPED_USAGE**: `UsageFact` includes `run_id` and `attempt`. Billing ingestion uses these for attribution and idempotency.

5. **GRAPH_LLM_VIA_COMPLETION**: In-proc graphs (executed via `InProcGraphExecutorAdapter`) call `completion.executeStream()` for billing/telemetry centralization. External adapters emit `UsageFact` directly.

6. **GRAPH_FINALIZATION_ONCE**: Graph emits exactly one `done` event and resolves `final` exactly once per run attempt.

7. **USAGE_REPORT_AT_MOST_ONCE_PER_USAGE_UNIT**: Adapter emits at most one `usage_report` per `(runId, attempt, usageUnitId)`. DB uniqueness constraint is a safety net, not a substitute for correct event semantics.

8. **BILLING_INDEPENDENT_OF_CLIENT**: Billing commits occur server-side regardless of client connection state. `AiRuntimeService` uses a StreamDriver + Fanout pattern via `RunEventRelay`: a StreamDriver consumes the upstream `AsyncIterable` to completion, broadcasting events to subscribers (UI + billing). UI disconnect or slow consumption does not stop the StreamDriver. Billing subscriber never drops events.

9. **P0_ATTEMPT_FREEZE**: In P0, `attempt` is always 0. No code path increments attempt. Full attempt/retry semantics require run persistence (P1). The `attempt` field exists in schema and `UsageFact` for forward compatibility but is frozen at 0.

10. **RUNID_IS_CANONICAL**: `runId` is the canonical execution identity. `ingressRequestId` is optional delivery-layer correlation (HTTP/SSE/worker/queue). P0: they coincidentally equal (no run persistence). P1: many `ingressRequestId`s per `runId` (reconnect/resume). No business logic relies on `ingressRequestId == runId`. Never use `ingressRequestId` for idempotency.

11. **BILLABLE_AI_THROUGH_EXECUTOR**: Production code paths that emit `UsageFact` must execute via `AiRuntimeService` → `GraphExecutorPort`. Direct `completion.executeStream()` calls outside executor internals bypass billing/telemetry pipeline and are prohibited. Enforced by stack test (`no-direct-completion-executestream.stack.test.ts`).

---

## MVP Invariants (LangGraph InProc)

These invariants govern the in-process LangGraph execution path:

- **GRAPH_FINALIZATION_ONCE**: Exactly one `done` per runId; completion-units never emit `done`.
- **USAGE_EMIT_ON_FINAL_ONLY**: Emit exactly one `usage_report` per run; aggregate multi-call usage internally for P0.
- **BILLING_SEAM_IS_EXECUTE_COMPLETION_UNIT**: No direct provider/LiteLLM SDK calls from langgraph graphs; all billable calls go through `executeCompletionUnit`.
- **REQUEST_ID_FLOW_REQUIRED**: `CompletionResult` must carry `requestId` (or define deterministic mapping) to satisfy `GraphFinal.requestId` + tracing.
- **MODEL_CONSISTENCY**: Model string must be the same through request→LiteLLM→`UsageFact.model`; never infer later.
- **NO_LANGCHAIN_IN_SRC**: `src/**` must not import `@langchain/*`; all LangChain conversions stay in `packages/langgraph-graphs`.
- **ERROR_NORMALIZATION**: Errors normalized to `timeout|aborted|internal` at GraphExecutor boundary (no freeform string leakage).
- **DOCS_MATCH_REALITY**: AGENTS.md/docs must be updated or explicitly marked stale to avoid churn.

---

## Implementation Checklist

### P0: Run-Centric Billing + GraphExecutorPort

Refactor billing for run-centric idempotency. Wrap existing LLM path behind `GraphExecutorPort`.

- [ ] Create `GraphExecutorPort` interface in `src/ports/graph-executor.port.ts`
- [ ] Create `InProcGraphExecutorAdapter` wrapping existing streaming/completion path
- [ ] Implement `RunEventRelay` (StreamDriver + Fanout) in `AiRuntimeService` (billing-independent consumption)
- [ ] Refactor `completion.ts`: remove `recordBilling()` call; return usage fields in final (litellmCallId, costUsd, tokens)
- [ ] Refactor `InProcGraphExecutorAdapter`: emit `usage_report` AiEvent from final BEFORE done
- [ ] Add `UsageFact` type in `src/types/usage.ts` (type only, no functions)
- [ ] Add `computeIdempotencyKey(UsageFact)` in `billing.ts` (per types layer policy)
- [ ] Add `UsageReportEvent` to AiEvent union
- [ ] Add `commitUsageFact()` to `billing.ts` — sole ledger writer
- [ ] Schema: add `run_id`, `attempt` columns; `UNIQUE(source_system, source_reference)`
- [ ] Add grep test for ONE_LEDGER_WRITER (depcruise impractical—see §5)
- [ ] Add idempotency test: replay with same (source_system, source_reference) → 1 row

### P1: Run Persistence + Attempt Semantics

- [ ] Add `graph_runs` table for run persistence (enables attempt semantics)
- [ ] Add `attempt-semantics.test.ts`: resume does not change attempt
- [ ] Add stack test: graph emits `usage_report`, billing records charge

**Note:** Graph-specific integration tests are documented in [LANGGRAPH_AI.md](LANGGRAPH_AI.md) and [LANGGRAPH_TESTING.md](LANGGRAPH_TESTING.md).

### P2: Claude Agent SDK Adapter

- [ ] Create `ClaudeGraphExecutorAdapter` implementing `GraphExecutorPort`
- [ ] Translate Claude SDK events → AiEvents
- [ ] Emit `usage_report` with `message.id`-based `usageUnitId`
- [ ] Add `anthropic_sdk` to `SOURCE_SYSTEMS` enum

### Future: External Engine Adapters

n8n/Flowise adapters — build only if demand materializes and engines route LLM through our gateway.

---

## File Pointers (P0 Scope)

| File                                                              | Change                                                                |
| ----------------------------------------------------------------- | --------------------------------------------------------------------- |
| `src/ports/graph-executor.port.ts`                                | New: `GraphExecutorPort`, `GraphRunRequest`, `GraphRunResult`         |
| `src/ports/index.ts`                                              | Re-export `GraphExecutorPort`                                         |
| `src/adapters/server/ai/inproc-graph.adapter.ts`                  | New: `InProcGraphExecutorAdapter`; emits `usage_report` before `done` |
| `src/types/usage.ts`                                              | New: `UsageFact` type (no functions per types layer policy)           |
| `src/types/billing.ts`                                            | Add `'anthropic_sdk'` to `SOURCE_SYSTEMS`                             |
| `src/features/ai/types.ts`                                        | Add `UsageReportEvent` (contains `UsageFact`)                         |
| `src/features/ai/services/completion.ts`                          | Remove `recordBilling()`; return usage in final (no AiEvent emission) |
| `src/features/ai/services/billing.ts`                             | Add `commitUsageFact()`, `computeIdempotencyKey()` (functions here)   |
| `src/features/ai/services/ai_runtime.ts`                          | Add `RunEventRelay` (StreamDriver + Fanout)                           |
| `src/shared/db/schema.billing.ts`                                 | Add `run_id`, `attempt` columns; change uniqueness constraints        |
| `src/bootstrap/container.ts`                                      | Wire `InProcGraphExecutorAdapter`                                     |
| `src/bootstrap/graph-executor.factory.ts`                         | Factory for adapter creation with `GraphResolverFn`                   |
| `.dependency-cruiser.cjs`                                         | Add ONE_LEDGER_WRITER rule                                            |
| `tests/ports/graph-executor.port.spec.ts`                         | New: port contract test                                               |
| `tests/stack/ai/one-ledger-writer.test.ts`                        | New: grep for `.recordChargeReceipt(` call sites                      |
| `tests/stack/ai/billing-idempotency.test.ts`                      | New: replay usage_report twice, assert 1 row                          |
| `tests/stack/ai/billing-disconnect.test.ts`                       | New: StreamDriver completes billing even if UI subscriber disconnects |
| `tests/stack/ai/no-direct-completion-executestream.stack.test.ts` | New: grep test for BILLABLE_AI_THROUGH_EXECUTOR                       |

---

## Schema

**Evolve `charge_receipts`** (no new table):

**New columns:**

| Column    | Type | Notes               |
| --------- | ---- | ------------------- |
| `run_id`  | text | NOT NULL            |
| `attempt` | int  | NOT NULL, default 0 |

**Constraint changes:**

- Remove: `UNIQUE(request_id)`
- Add: `UNIQUE(source_system, source_reference)`

**Index changes:**

- Keep: non-unique index on `request_id` (for correlation queries)
- Add: index on `(run_id, attempt)` (for run-level queries and analytics)

**Column semantics:**

| Column             | Semantics                                                                 |
| ------------------ | ------------------------------------------------------------------------- |
| `source_system`    | Adapter source identifier (e.g., `'litellm'`, `'anthropic_sdk'`)          |
| `source_reference` | Idempotency key within source: `${run_id}/${attempt}/${usage_unit_id}`    |
| `run_id`           | Explicit column for joins/queries (duplicated from source_reference)      |
| `attempt`          | Explicit column for retry analysis (duplicated from source_reference)     |
| `request_id`       | Original request correlation; no longer unique; multiple receipts allowed |

**Why explicit columns?** Burying `run_id` and `attempt` only in `source_reference` makes queries hard. Explicit columns enable:

```sql
-- Easy: explicit columns
SELECT * FROM charge_receipts WHERE run_id = 'run123' AND attempt = 0;

-- Hard: parsing source_reference
SELECT * FROM charge_receipts WHERE source_reference LIKE 'run123/0/%';
```

**Why multiple receipts per request?** A graph can make N LLM calls. Each call = one receipt. Idempotency is now scoped to usage unit, not request.

**Adapter responsibility:** Each adapter must provide a stable `usage_unit_id` in `UsageFact`. Billing does not know or care how adapters derive this ID. See adapter-specific notes for mapping details.

---

## Design Decisions

### 1. GraphExecutorPort Scope

| Executor Type  | Adapter                      | LLM Path                    |
| -------------- | ---------------------------- | --------------------------- |
| **In-proc**    | `InProcGraphExecutorAdapter` | `completion.executeStream`  |
| **Claude SDK** | `ClaudeGraphExecutorAdapter` | Direct to Anthropic API     |
| **n8n**        | Future adapter               | Via our LLM gateway (ideal) |

**Rule:** All graphs go through `GraphExecutorPort`. In-proc adapter wraps existing code; external adapters emit `UsageFact` directly.

---

### 2. Execution + Billing Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ AiRuntimeService.runGraph(request)                                  │
│ ─────────────────────────────────────                               │
│ 1. Generate run_id; set attempt=0 (P0: no persistence)              │
│ 2. Select adapter from GraphRegistry by graph name                  │
│ 3. Call adapter.runGraph(request) → get stream                      │
│ 4. Start RunEventRelay.pump() to consume upstream to completion     │
│ 5. Fanout events to subscribers:                                    │
│    ├── UI subscriber → returned to route (may disconnect)           │
│    └── Billing subscriber → commits charges (never drops events)    │
│ 6. Return { uiStream, final }                                       │
└─────────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌──────────────────────────────┐ ┌────────────────────────────────────┐
│ UI Subscriber                │ │ Billing Subscriber                 │
│ ──────────────               │ │ ──────────────────                 │
│ - Receives broadcast events  │ │ - Receives broadcast events        │
│ - Client disconnect = stops  │ │ - Runs to completion (never stops) │
│   receiving, driver continues│ │ - On usage_report → commitUsageFact│
│                              │ │ - On done/error → finalize         │
└──────────────────────────────┘ └────────────────────────────────────┘
                                              │
                                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ GraphExecutorAdapter (in-proc or external)                          │
│ ───────────────────────────────────────────                         │
│ - Emit AiEvents (text_delta, tool_call_*, usage_report, done)       │
│ - usage_report carries UsageFact with run_id/attempt/usageUnitId    │
│ - Resolve final with usage_totals                                   │
└─────────────────────────────────────────────────────────────────────┘
                                              │
                                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ BillingService (billing.ts) — never blocking                        │
│ ─────────────────────────────────────────                           │
│ - commitUsageFact(fact) called by billing sink                      │
│ - Apply pricing policy: chargedCredits = llmPricingPolicy(costUsd)  │
│ - Compute source_reference = computeIdempotencyKey(fact)            │
│ - Call recordChargeReceipt with source_reference                    │
│ - DB constraint handles duplicates (no-op on conflict)              │
└─────────────────────────────────────────────────────────────────────┘
```

**Pricing policy:** `commitUsageFact()` applies the markup via `llmPricingPolicy.ts`. See [BILLING_EVOLUTION.md](BILLING_EVOLUTION.md) for credit unit standard (`CREDITS_PER_USD = 10_000_000`) and markup factor.

**Why StreamDriver + Fanout?** AsyncIterable cannot be safely consumed by two independent readers. The StreamDriver (internal `pump()` loop in `RunEventRelay`) is a single consumer that reads upstream to completion, broadcasting each event to subscribers via internal queues. Per BILLING_INDEPENDENT_OF_CLIENT: if UI subscriber disconnects, the driver continues and billing subscriber still receives all events.

**Why run-centric?** Graphs have multiple LLM calls. Billing must be attributed to usage units, not requests. Idempotency key includes run context to prevent cross-run collisions.

---

### 3. Idempotency Key Format

```
source_reference = "${run_id}/${attempt}/${usage_unit_id}"
```

**Note:** `source` is NOT duplicated in `source_reference` — the `source_system` column already identifies the source. This reduces entropy and simplifies queries.

**Full uniqueness:** `UNIQUE(source_system, source_reference)` enforces global uniqueness.

**Examples:**

| source_system   | source_reference   | Meaning                                      |
| --------------- | ------------------ | -------------------------------------------- |
| `litellm`       | `r1/0/call-abc123` | LiteLLM call (usage_unit_id = litellmCallId) |
| `anthropic_sdk` | `r2/0/msg_xyz`     | Claude SDK (usage_unit_id = message.id)      |
| `anthropic_sdk` | `r3/1/msg_abc`     | Claude SDK retry (attempt=1)                 |
| `external`      | `r4/0/run-456`     | External engine (usage_unit_id = run ID)     |

**Single computation point:** `computeIdempotencyKey(UsageFact)` — used by billing.ts only.

```typescript
// In billing.ts (functions not allowed in types layer)
function computeIdempotencyKey(fact: UsageFact): string {
  return `${fact.runId}/${fact.attempt}/${fact.usageUnitId}`;
}
```

---

### 4. UsageFact Type (src/types/usage.ts)

```typescript
export interface UsageFact {
  // Required for idempotency key computation (usageUnitId resolved at commit time)
  readonly runId: string;
  readonly attempt: number;
  readonly usageUnitId?: string; // Adapter-provided stable ID; billing.ts assigns fallback if missing

  // Required for source_system column (NOT in idempotency key)
  readonly source: SourceSystem; // "litellm" | "anthropic_sdk" | ...

  // Required billing context
  readonly billingAccountId: string;
  readonly virtualKeyId: string;

  // Required executor type
  readonly executorType: ExecutorType; // "langgraph_server" | "claude_sdk" | "inproc"

  // Optional provider details
  readonly provider?: string;
  readonly model?: string;

  // Optional usage metrics
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly cacheReadTokens?: number;
  readonly cacheWriteTokens?: number;
  readonly costUsd?: number;

  // Raw payload for debugging (adapter can stash native IDs here)
  readonly usageRaw?: Record<string, unknown>;
}
```

**Adapter contract:** Adapters SHOULD set `usageUnitId` to a stable identifier when available. If missing (`undefined`), `billing.ts` assigns a deterministic fallback at commit time (see Adapter-Specific Notes). Billing uses this field solely for idempotency.

---

### 5. ONE_LEDGER_WRITER Enforcement

**Enforcement:** Stack test (grep-based). Depcruise rule is impractical because other features legitimately import `AccountService` for read operations (`getBalance`, `creditAccount`, `listCreditLedgerEntries`). The grep test precisely targets `recordChargeReceipt()` call sites.

**Stack test** (`tests/stack/ai/one-ledger-writer.stack.test.ts`):

```typescript
import { execSync } from "child_process";

test("only billing.ts calls recordChargeReceipt", () => {
  // grep for actual call sites (not interface definitions)
  const result = execSync(
    "grep -rn '\\.recordChargeReceipt(' src/ --include='*.ts' || true",
    { encoding: "utf-8" }
  );
  const callSites = result
    .split("\n")
    .filter(Boolean)
    .filter((line) => !line.includes("billing.ts"))
    .filter((line) => !line.includes(".port.ts")) // interface def
    .filter((line) => !line.includes(".adapter.ts")); // implementation

  expect(callSites).toEqual([]);
});
```

---

### 6. GraphExecutorPort Interface

```typescript
export interface GraphExecutorPort {
  // Non-async: returns immediately with stream + final promise
  runGraph(req: GraphRunRequest): GraphRunResult;
}

export interface GraphRunResult {
  readonly stream: AsyncIterable<AiEvent>;
  readonly final: Promise<GraphFinal>;
}
```

**Why non-async?** The method returns a stream handle immediately; actual execution happens as the stream is consumed. Avoids nested `Promise<Promise<...>>`.

---

### 7. InProcGraphExecutorAdapter (P0)

Wraps existing behavior behind `GraphExecutorPort` with optional graph runner delegation:

```typescript
export class InProcGraphExecutorAdapter implements GraphExecutorPort {
  constructor(
    private deps: InProcGraphExecutorDeps,
    private completionStream: CompletionStreamFn,
    private graphResolver?: GraphResolverFn // Optional: routes to custom runners
  ) {}

  runGraph(req: GraphRunRequest): GraphRunResult {
    const { runId, graphName } = req;

    // Check for custom graph runner (e.g., LangGraph, future agents)
    if (this.graphResolver && graphName) {
      const runner = this.graphResolver(graphName, this);
      if (runner) return runner(req);
    }

    // Default: single completion path (no graph orchestration)
    // ... transform stream, emit usage_report before done
    return { stream, final };
  }

  // Exposed for graph runners that need multiple LLM calls
  executeCompletionUnit(params: CompletionUnitParams): CompletionUnitResult {
    // Transforms stream, emits usage_report, but NO done event
    // Caller (graph runner) controls when to emit done
  }
}
```

**Key points:**

- `GraphResolverFn` enables routing to custom graph runners by name
- `executeCompletionUnit()` exposes LLM execution for multi-step runners
- Graph runners receive `CompletionUnitExecutor` interface (not full adapter)
- Enforces `GRAPH_LLM_VIA_COMPLETION` — all LLM calls go through adapter
- `runId` provided by caller; `attempt` frozen at 0 in P0 (per P0_ATTEMPT_FREEZE)

---

### 8. executeCompletionUnit Contract

The `executeCompletionUnit()` method must provide a **unified execution boundary** with normalized errors:

1. **Stream never throws** — errors become `ErrorEvent` yields
2. **Final never rejects** — errors become `{ok: false, ...}` results
3. **Single authority** — both derive from same operation, error normalized once

This restores the invariant: `stream + final = unified execution boundary with normalized errors`.

The `CompletionUnitLLM` in the package layer then doesn't need any special error handling — it just consumes a well-behaved stream/final from the adapter boundary.

**Working Billing Flow (Non-LangGraph InProc Path):**

```
AiRuntime.runChatStream()
        ↓
graphExecutor.runGraph() [InProcGraphExecutorAdapter]
        ↓
createTransformedStream() [lines 448-512]
        │
        ├─ for await (event of innerStream) { yield events }
        ├─ await final ← AFTER stream completes
        ├─ yield usage_report { fact: UsageFact } ← WITH costUsd, litellmCallId
        └─ yield done
        ↓
RunEventRelay.pump()
        │
        ├─ on usage_report → commitUsageFact() → recordChargeReceipt()
        └─ on other events → queue to UI
```

**Key insight:** In the working path, `createTransformedStream()`:

1. Fully drains the inner stream
2. THEN awaits final (no dual failure channels)
3. Builds `UsageFact` from final result (has litellmCallId, costUsd, model)
4. Emits `usage_report` then `done`
5. Stream never throws to caller — it's self-contained

---

## Adapter-Specific Notes

### InProcGraphExecutorAdapter (P0)

**usage_unit_id source:** `litellmCallId` from LLM response header (`x-litellm-call-id`)

**Ownership clarity:**

| Component                    | Responsibility                                                                                           |
| ---------------------------- | -------------------------------------------------------------------------------------------------------- |
| `completion.ts`              | Returns usage fields in final (litellmCallId, costUsd, tokens); yields `ChatDeltaEvent` only             |
| `InProcGraphExecutorAdapter` | Emits `usage_report` AiEvent from final BEFORE `done`; owns `UsageFact` construction                     |
| `billing.ts`                 | Sole ledger writer. Owns `callIndex` counter. Computes fallback `usageUnitId` at commit time if missing. |

**Fallback policy (STRICT):** If `usageUnitId` is missing at `commitUsageFact()` time:

1. **Billing subscriber** maintains a per-run `callIndex` counter (starts at 0)
2. **At commit time**, if `fact.usageUnitId` is undefined:
   - Log ERROR with metric `billing.missing_usage_unit_id`
   - Set `usageUnitId = MISSING:${runId}/${callIndex++}`
3. **This is an ERROR PATH** — investigate and fix provider integration
4. **Do NOT** silently accept missing IDs as normal operation

```typescript
// In billing.ts commitUsageFact() — billing subscriber owns callIndex
// callIndex is per-run state maintained by the billing subscriber
function commitUsageFact(fact: UsageFact, callIndex: number): void {
  let usageUnitId = fact.usageUnitId;

  if (!usageUnitId) {
    log.error(
      { runId: fact.runId, model: fact.model, callIndex },
      "billing.missing_usage_unit_id"
    );
    metrics.increment("billing.missing_usage_unit_id");
    usageUnitId = `MISSING:${fact.runId}/${callIndex}`;
  }

  const sourceReference = computeIdempotencyKey({ ...fact, usageUnitId });
  // ... record charge receipt
}
```

**Why billing-subscriber-assigned callIndex?**

- `usageUnitId` is formed at emission time (in adapter), but the provider may not have returned the ID yet
- Fallback must be computed at commit time by billing.ts (the sole ledger writer)
- `callIndex` is deterministic within a run: same run replayed = same callIndex = same idempotency key = no double billing
- Using `Date.now()` would break idempotency on replay

#### Known Issues

- [ ] `usage_report` only emitted on success; error/abort with partial usage not billed (P1: add optional `usage` to error result)

### LangGraphServerAdapter (P0 Gated)

**P0 Constraint:** `langgraph_server` executor is **internal/experimental only** in P0. It cannot be a customer-billable path until it achieves billing-grade `UsageFact` parity.

**Missing for billing parity:**

| Field         | InProc | Server | Notes                                |
| ------------- | ------ | ------ | ------------------------------------ |
| `usageUnitId` | Yes    | No     | Requires `x-litellm-call-id` capture |
| `costUsd`     | Yes    | No     | Requires `x-litellm-response-cost`   |
| `model`       | Yes    | No     | Requires resolved model from LiteLLM |

**Fix path (if server must be paid in P0):** `langgraph-server` must capture LiteLLM response headers (`call-id`, `response-cost`, `model`, tokens) and emit `usage_report` with `usageUnitId=litellmCallId`. Without this, billing idempotency relies on `callIndex` fallback which is unsafe.

---

## P0 Scope Constraints

### Billable Executor Scope

**P0 ships with `inproc` as the only customer-billable executor.** The `langgraph_server` executor is gated as internal/experimental until it can emit stable `usageUnitId` (prefer `litellmCallId`) + `costUsd` + resolved model.

### Graph Contract Requirement

**Required seam:** Define/enforce a per-graph contract — graphs are pure functions over injected dependencies:

```typescript
interface GraphDeps {
  llm: BaseChatModel; // Injected, not instantiated
  tools: StructuredTool[]; // Injected, not hardcoded
  runContext: RunContext; // Caller, tracing, billing
  policy: GraphPolicy; // Model selection, rate limits
  abortSignal?: AbortSignal; // Cancellation propagation
}
```

**Invariant:** No env reads or provider SDKs in graph code. Event semantics + billing guarantee must be tested per-graph.

### Risk Flags

1. **callIndex fallback is nondeterministic under concurrency/resume** — Must remain error-only path and not become normal operation. If `callIndex` fallback frequency exceeds threshold, investigate root cause.

2. **USAGE_EMIT_ON_FINAL_ONLY implies partial failures are unbilled** — Explicitly accepted for P0. If graph fails mid-execution after N LLM calls, those calls are not billed. Add partial-usage reporting in P1 if revenue leakage is material.

3. **Server path without usageUnitId breaks idempotency** — If server path is exposed to customers without fix, duplicate charges are possible on retry. Gate behind feature flag until resolved.

---

## Related Documents

- [ACCOUNTS_DESIGN.md](ACCOUNTS_DESIGN.md) — Owner vs Actor tenancy rules (`account_id` in relay context)
- [AI_SETUP_SPEC.md](AI_SETUP_SPEC.md) — P1 invariants, telemetry
- [LANGGRAPH_AI.md](LANGGRAPH_AI.md) — Graph architecture, anti-patterns
- [TOOL_USE_SPEC.md](TOOL_USE_SPEC.md) — Tool execution within graphs
- [BILLING_EVOLUTION.md](BILLING_EVOLUTION.md) — Credit unit standard, pricing policy, markup
- [ACTIVITY_METRICS.md](ACTIVITY_METRICS.md) — Activity dashboard join
- [USAGE_HISTORY.md](USAGE_HISTORY.md) — Message artifact persistence (parallel stream consumer)

---

**Last Updated**: 2025-12-31
**Status**: Draft (Rev 9 - P0 scope constraints + risk flags)
