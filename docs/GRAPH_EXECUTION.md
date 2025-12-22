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

## Implementation Checklist

### P0: Run-Centric Billing + GraphExecutorPort

Refactor billing for run-centric idempotency. Wrap existing LLM path behind `GraphExecutorPort`.

- [x] Create `GraphExecutorPort` interface in `src/ports/graph-executor.port.ts`
- [x] Create `InProcGraphExecutorAdapter` wrapping existing streaming/completion path
- [x] Implement `RunEventRelay` (StreamDriver + Fanout) in `AiRuntimeService` (billing-independent consumption)
- [x] Refactor `completion.ts`: remove `recordBilling()` call; return usage fields in final (litellmCallId, costUsd, tokens)
- [x] Refactor `InProcGraphExecutorAdapter`: emit `usage_report` AiEvent from final BEFORE done
- [x] Add `UsageFact` type in `src/types/usage.ts` (type only, no functions)
- [x] Add `computeIdempotencyKey(UsageFact)` in `billing.ts` (per types layer policy)
- [x] Add `UsageReportEvent` to AiEvent union
- [x] Add `commitUsageFact()` to `billing.ts` — sole ledger writer
- [x] Schema: add `run_id`, `attempt` columns; `UNIQUE(source_system, source_reference)`
- [x] Add grep test for ONE_LEDGER_WRITER (depcruise impractical—see §5)
- [x] Add idempotency test: replay with same (source_system, source_reference) → 1 row

### P1: First LangGraph Graph + Run Persistence

- [ ] Create minimal LangGraph graph (`graphs/echo.graph.ts`) to prove integration
- [ ] Route graph execution through `InProcGraphExecutorAdapter`
- [ ] Add stack test: graph emits `usage_report`, billing records charge
- [ ] Add `graph_runs` table for run persistence (enables attempt semantics)
- [ ] Add `attempt-semantics.test.ts`: resume does not change attempt

### P2: Claude Agent SDK Adapter

- [ ] Create `ClaudeGraphExecutorAdapter` implementing `GraphExecutorPort`
- [ ] Translate Claude SDK events → AiEvents
- [ ] Emit `usage_report` with `message.id`-based `usageUnitId`
- [x] Add `anthropic_sdk` to `SOURCE_SYSTEMS` enum

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
| `src/features/ai/graphs/langgraph-smoke.graph.ts`                 | New: minimal LangGraph graph (P1)                                     |
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

Wraps existing behavior behind `GraphExecutorPort`:

```typescript
export class InProcGraphExecutorAdapter implements GraphExecutorPort {
  constructor(
    private deps: InProcGraphExecutorDeps,
    private completionStream: CompletionStreamFn
  ) {}

  runGraph(req: GraphRunRequest): GraphRunResult {
    // P0_ATTEMPT_FREEZE: attempt is always 0, no persistence
    const { runId, ingressRequestId, messages, model, caller } = req;
    const attempt = 0; // P0: frozen at 0

    // Create RequestContext using ingressRequestId (delivery correlation)
    const ctx = this.createRequestContext(ingressRequestId);

    // Kick off async internally, return handles synchronously
    const completionPromise = this.completionStream({
      messages,
      model,
      caller,
      ctx,
      // ... deps pass through
    });

    // Transform stream lazily
    const stream = this.createTransformedStream(completionPromise, runId);
    const final = this.createFinalPromise(completionPromise, runId);

    return { stream, final };
  }
}
```

**Key points:**

- Enforces `GRAPH_LLM_VIA_COMPLETION` by delegating to `completion.executeStream()`
- `runId` provided by caller; `attempt` frozen at 0 in P0 (per P0_ATTEMPT_FREEZE)
- `ingressRequestId` used for RequestContext.reqId (delivery-layer correlation per RUNID_IS_CANONICAL)
- Injects run context into all emitted `UsageFact` objects for idempotency

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

**Last Updated**: 2025-12-22
**Status**: Draft (Rev 7 - bootstrap factory pattern)
