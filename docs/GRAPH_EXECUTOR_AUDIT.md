# Graph Executor Architecture Audit Report

**Date**: 2026-02-07 (updated 2026-02-07)
**Branch**: feat/billing-validation (was feat/sandbox-0.75)
**Auditor**: Claude Opus 4.6

---

## Executive Summary

The current graph execution system demonstrates **strong separation of concerns** at the high level, with adapters emitting usage facts and the features layer processing billing. However, **critical enforcement gaps** exist:

1. ✅ **Single Ledger Writer**: Only `billing.ts` calls `accountService.recordChargeReceipt()`
2. ✅ **Schema Validation**: Zod schemas (strict/hints) enforce UsageFact at ingestion boundary
3. ✅ **Idempotency Consolidated**: Fallback removed; usageUnitId required for billing-authoritative executors
4. ❌ **No Contract Tests**: No shared compliance suite for executor implementations
5. ⚠️ **Sandbox Billing**: Header capture, executorType "sandbox", graphId in UsageFact — DB persistence pending (TODO #4b)
6. ⚠️ **Dev Provider**: Still defers billing to P1 reconciliation (emits hints-only usage_report)

**Recommendation**: Implement shared contract tests for executor implementations. Transport/Enforcement split deferred to P1.

---

## P0 TODO Items — Status

### [x] 1. Remove Fallback usageUnitId Generation in Adapters

**Commit**: `ce00dd10` — InProc adapter throws on missing `litellmCallId` instead of using `MISSING:${runId}/0` fallback. `callIndex` tracking removed from `commitUsageFact`. "sandbox" added to `ExecutorType` union.

### [x] 2. Enforce usageUnitId in Sandbox Provider

**Commit**: `b4bbb559` — Nginx passes `x-litellm-call-id` response header to sandbox agent. `run.mjs` captures and includes in output envelope meta. Sandbox provider reads `litellmCallId`, throws if missing. `executorType: "sandbox"` set.

### [x] 3. Validate UsageFact Schema in RunEventRelay

**Commit**: `e17e50a6` — Per-executor Zod validation policy: `UsageFactStrictSchema` (hard fail) for inproc/sandbox, `UsageFactHintsSchema` (soft warning) for external. `isTerminated` guard ignores events after done/error. Billing-authoritative validation failures propagate as run errors.

### [x] 4. Add graphId to UsageFact and Fix Port Type Consistency

**Commits**: `9a07f4a3`, `83f1aa75` — `graphId: GraphId` required on `UsageFact` with namespaced validation in strict schema. `GraphRunRequest.graphId` typed as `GraphId` (not `string`). `graphName` required across all contracts (chat, completion) and facade — `.default("poet")` removed. All executors propagate graphId. Internal route validates format at boundary.

**⚠️ Partial**: graphId flows through UsageFact but is NOT yet persisted to `charge_receipts` DB. See TODO #4b.

---

## Remaining TODO Items

### [ ] 4b. Persist graphId to charge_receipts DB

**Priority**: P0 (post-stabilization)

`graphId` is on `UsageFact` and validated via Zod schemas, but not yet persisted to the DB. Requires:

- Add `graphId` column to `charge_receipts` table (`packages/db-schema/src/billing.ts`)
- Add `graphId` to `ChargeReceiptParams` (`src/ports/accounts.port.ts`)
- Pass `fact.graphId` through `commitUsageFact()` → `recordChargeReceipt()` (`billing.ts`, `drizzle.adapter.ts`)
- DB migration
- Stack test: assert `graphId` appears in `charge_receipts` row after completion
- Verify `graphId` does NOT affect idempotency key (key remains `runId/attempt/usageUnitId`)

### [ ] 5. Contract Tests for Executor Implementations

**Priority**: P0 (pre-production gate)

No shared contract test suite validates executor implementations against billing/streaming invariants. Each test below should be a standalone test file under `tests/contract/`.

Required coverage:

- **UsageFact Zod schemas**: strict accepts valid inproc/sandbox facts, rejects missing `usageUnitId`, rejects non-namespaced `graphId`; hints accepts missing `usageUnitId`, rejects wrong `executorType`
- **RunEventRelay validation**: billing-authoritative invalid fact → hard failure (error in stream); external invalid fact → soft warning (billing skipped); `isTerminated` guard → events after done ignored; valid fact → `commitUsageFact` called
- **Executor graphId propagation**: `usage_report` events from inproc/sandbox contain correct `graphId`
- **Event stream ordering**: content → usage_report → assistant_final → done (exactly one done)

### [ ] 6. Unify CompletionRunContext Shapes

**Priority**: P1

`executeCompletionUnit` receives `{runId, attempt, ingressRequestId, graphId}` but `createCompletionUnitStream` receives `{runId, attempt, caller, graphId}` — inconsistent context envelope shapes throughout the call chain. Define a single `CompletionRunContext` type.

### [ ] 8. Research Stable Context Envelope Unification

**Priority**: P1

Audit all context envelope shapes across the call chain (`RunContext`, `CompletionUnitParams.runContext`, `createCompletionUnitStream`'s inline type) and determine whether a single `CompletionRunContext` type can replace them. Consider whether `caller` (which carries `billingAccountId`/`virtualKeyId`) should be part of the context or passed separately. Check if `RunContext` from `@cogni/ai-core` can be extended rather than defining a new type. Overlaps with TODO #6 but broader scope — covers the full call chain from facade through relay to adapter.

### [ ] 7. Remove Legacy `recordBilling()` Function

**Priority**: P1

`billing.ts:recordBilling()` is the pre-graph direct billing path. Marked TODO for removal once all execution flows through `commitUsageFact()`. Still has its own `MISSING:` fallback logic that contradicts the strict-fail policy.

---

### Inline vs Reconciliation: When to Use Each

**Inline Billing** (P0: InProc, Sandbox):

- ✅ Trusted component captures `provider_call_id` + usage inline per LLM call (response headers/body)
- ✅ Server enforces identity injection (in-process adapter, trusted proxy)
- ✅ Commits per-call UsageFacts during execution (streaming is incidental to capture)
- ✅ Works for multi-call graphs as long as every call yields a stable call-id

**Reconciliation Billing** (P1: External LangGraph Server):

- ⚠️ External executor outside trusted boundary
- ⚠️ Cannot reliably capture trusted `provider_call_id` + usage inline
- ⚠️ Streaming events unreliable (disconnects, retries, partial streams)
- ✅ Authoritative: query `/spend/logs` after stream completes
- ✅ Server-controlled identity + metadata ensure correctness

**P0 Scope**: Sandbox uses inline capture (trusted proxy injects headers). Long-running multi-call OpenClaw agents bill inline per call. External executors (LangGraph Server) deferred to P1 reconciliation. Schema validation (#3) allows telemetry-hint facts from external sources but enforces strict schema for committed inline facts.

---

## 1) Current GraphExecutorPort Contract

### Port Definition

**Location**: `src/ports/graph-executor.port.ts` (Lines 107-116)

```typescript
export interface GraphExecutorPort {
  /**
   * Execute a graph with the given request.
   * Returns stream handle immediately; consume stream to drive execution.
   */
  runGraph(req: GraphRunRequest): GraphRunResult;
}
```

### Request/Response Types

**GraphRunRequest** (`src/ports/graph-executor.port.ts:30-62`):

- `runId`: string — Unique run ID (caller-provided)
- `ingressRequestId`: string — Delivery correlation (P0: equals runId)
- `messages`: Message[] — Conversation history
- `model`: string — Model identifier
- `caller`: LlmCaller — Billing/telemetry context
- `abortSignal?`: AbortSignal — Cancellation
- `graphId`: GraphId — Fully-qualified, typed as `` `${string}:${string}` ``
- `toolIds?`: readonly string[] — Tool allowlist
- `stateKey?`: string — Multi-turn conversation state

**GraphRunResult** (`src/ports/graph-executor.port.ts:91-96`):

- `stream`: AsyncIterable<AiEvent> — Real-time events
- `final`: Promise<GraphFinal> — Completion result

**GraphFinal** (`src/ports/graph-executor.port.ts:67-85`):

- `ok`: boolean — Success indicator
- `runId`: string — Correlation
- `requestId`: string — Correlation
- `usage?`: { promptTokens, completionTokens } — Token totals
- `finishReason?`: string — How graph finished
- `error?`: AiExecutionErrorCode — Error type if !ok
- `content?`: string — Final assistant response

### AiEvent Schema

**Location**: `src/types/ai-events.ts` (primary), `packages/ai-core/src/events/ai-events.ts` (package)

**Key Event Types**:

- `text_delta` — Text chunk from LLM
- `tool_call_start/delta/end` — Tool execution lifecycle
- `assistant_final` — Complete response (for history)
- `usage_report` — **CRITICAL**: Contains UsageFact for billing
- `done` — Stream termination
- `error` — Execution failure

**UsageFact Schema** (`packages/ai-core/src/usage/usage.ts`):

- `runId`, `attempt`, `source`, `executorType`, `billingAccountId`, `virtualKeyId` — required
- `graphId: GraphId` — required, namespaced validation in strict schema
- `usageUnitId` — required for billing-authoritative (inproc/sandbox), optional for external
- `ExecutorType`: `"inproc" | "sandbox" | "langgraph_server" | "claude_sdk"`
- Two Zod schemas: `UsageFactStrictSchema` (hard fail), `UsageFactHintsSchema` (soft warning)
- Validated at ingestion boundary in `RunEventRelay.handleBilling()`

---

## 2) Implementation Inventory

### GraphExecutorPort Implementations

| Component                               | Type      | Path                                                            | Responsibility                 |
| --------------------------------------- | --------- | --------------------------------------------------------------- | ------------------------------ |
| **AggregatingGraphExecutor**            | Router    | `src/adapters/server/ai/aggregating-executor.ts:41`             | Routes graphId → GraphProvider |
| **ObservabilityGraphExecutorDecorator** | Decorator | `src/adapters/server/ai/observability-executor.decorator.ts:69` | Wraps for Langfuse traces      |

### GraphProvider Implementations (Internal Interface)

**Note**: `GraphProvider` is an internal adapter interface, **not a port**. Located at `src/adapters/server/ai/graph-provider.ts:31`.

| Provider                    | Path                                                    | Execution Model               | Billing Status                                                 |
| --------------------------- | ------------------------------------------------------- | ----------------------------- | -------------------------------------------------------------- |
| **LangGraphInProcProvider** | `src/adapters/server/ai/langgraph/inproc.provider.ts`   | In-process LangChain graphs   | ✅ Inline: litellmCallId required, strict validation           |
| **LangGraphDevProvider**    | `src/adapters/server/ai/langgraph/dev/provider.ts`      | External langgraph dev server | ⚠️ Hints-only usage_report (no usageUnitId, reconciliation P1) |
| **SandboxGraphProvider**    | `src/adapters/server/sandbox/sandbox-graph.provider.ts` | Containerized agent execution | ✅ Inline: nginx header capture, litellmCallId required        |

### Supporting Adapters

| Adapter                         | Path                                                       | Line | Role                                                    |
| ------------------------------- | ---------------------------------------------------------- | ---- | ------------------------------------------------------- |
| **InProcCompletionUnitAdapter** | `src/adapters/server/ai/inproc-completion-unit.adapter.ts` | 128  | LLM execution for in-process graphs; emits usage_report |

---

## 3) Wiring/Composition Root

### Factory: `graph-executor.factory.ts`

**Location**: `src/bootstrap/graph-executor.factory.ts:50-76`

**Flow**:

```
createGraphExecutor(completionStreamFn, userId)
  ├─> Choose provider (Dev XOR InProc based on LANGGRAPH_DEV_URL)
  ├─> new AggregatingGraphExecutor([provider])
  └─> new ObservabilityGraphExecutorDecorator(aggregator, langfuse, config, log)
```

**Mutual Exclusion** (Line 58-61):

```typescript
const devUrl = serverEnv().LANGGRAPH_DEV_URL;
const langGraphProvider = devUrl
  ? createDevProvider(devUrl)
  : createInProcProvider(deps, completionStreamFn);
```

**Provider Registration**:

- **P0**: Only one LangGraph provider (Dev XOR InProc)
- **P0.75**: Sandbox provider **NOT wired** in factory (needs addition)

### Usage in Facades

**Location**: `src/app/_facades/ai/chat.server.ts` (implied, not shown in audit)

Facades call `createGraphExecutor()` → inject into `createAiRuntime()` → use `runChatStream()`.

**⚠️ BYPASS RISK**: No architectural enforcement prevents facades from importing adapters directly (only convention + arch_probes).

---

## 4) Invariant Ownership Map

### Billing Invariants

| Invariant                         | Owner                          | Location                                | Enforcement                                      |
| --------------------------------- | ------------------------------ | --------------------------------------- | ------------------------------------------------ |
| **ONE_LEDGER_WRITER**             | `billing.ts`                   | `src/features/ai/services/billing.ts:9` | ✅ Convention only (no import ban)               |
| **IDEMPOTENT_CHARGES**            | Adapters (construct keys) + DB | Each adapter + `billing.ts:166`         | ⚠️ Scattered: no shared validator                |
| **ZERO_CREDIT_RECEIPTS**          | `billing.ts`                   | `billing.ts:11`                         | ✅ Implemented                                   |
| **GRAPH_LLM_VIA_COMPLETION**      | InProc provider                | `inproc.provider.ts:10`                 | ✅ Implemented                                   |
| **BILLING_INDEPENDENT_OF_CLIENT** | RunEventRelay                  | `ai_runtime.ts:10`                      | ✅ Implemented (pump continues regardless of UI) |

### Event Streaming Invariants

| Invariant                   | Owner                      | Location                    | Enforcement                                    |
| --------------------------- | -------------------------- | --------------------------- | ---------------------------------------------- |
| **GRAPH_FINALIZATION_ONCE** | GraphExecutorPort contract | `graph-executor.port.ts:10` | ⚠️ Not enforced; relies on adapter correctness |
| **P0_ATTEMPT_FREEZE**       | All adapters               | Multiple                    | ✅ Hardcoded `attempt = 0` everywhere          |
| **PROTOCOL_TERMINATION**    | RunEventRelay              | `ai_runtime.ts:12`          | ✅ Terminates on done/error events             |

### Idempotency Key Construction

**Pattern**: `${runId}/${attempt}/${usageUnitId}`

**Single canonical implementation**: `billing.ts:computeIdempotencyKey()`

Fallback generation removed from adapters and `commitUsageFact`. Adapters must provide real `usageUnitId` or validation fails. Legacy `recordBilling()` still has fallback (TODO #7).

### Database Writes

| Component                      | DB Interaction                               | Path         | Line | Permission                            |
| ------------------------------ | -------------------------------------------- | ------------ | ---- | ------------------------------------- |
| `billing.ts:commitUsageFact()` | Calls `accountService.recordChargeReceipt()` | `billing.ts` | 243  | ✅ Via port                           |
| `billing.ts:recordBilling()`   | Calls `accountService.recordChargeReceipt()` | `billing.ts` | 124  | ✅ Via port (marked TODO for removal) |
| Adapters                       | **NONE** (emit events only)                  | —            | —    | ✅ No direct DB access                |

**✅ CLEAN**: No adapters bypass ports to write billing data directly.

---

## 5) Key Breakages — Current Status

### #1: ~~No UsageFact Schema Validation at Adapter Boundary~~ — RESOLVED

Zod schemas (`UsageFactStrictSchema`, `UsageFactHintsSchema`) enforce at ingestion boundary in `RunEventRelay.handleBilling()`. Per-executor policy: strict for inproc/sandbox (hard fail), hints for external (soft warning).

### #2: ~~Scattered Idempotency Key Construction~~ — RESOLVED

Fallback `MISSING:` generation removed from adapters and `commitUsageFact`. `usageUnitId` required for billing-authoritative executors (enforced by strict Zod schema). Legacy `recordBilling()` still has its own fallback (marked for removal, TODO #7).

### #3: No Contract Tests for Executor Implementations — OPEN

**Severity**: 🟠 **HIGH** — See TODO #5 above.

### #4: LangGraphDevProvider Usage Reporting — PARTIALLY RESOLVED

Dev provider now emits `usage_report` with hints-only UsageFact (no `usageUnitId`, validated via `UsageFactHintsSchema`). Billing commit skipped for facts without `usageUnitId`. Full reconciliation deferred to P1.

### #5: GraphProvider Not a Port — ACCEPTED (P0 design choice)

Internal adapter interface by design. Acceptable for current executor count (3). Revisit if external plugins needed.

---

## 6) Proposed Target Design

### Architecture: Transport/Enforcement Split

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

### Concrete Refactor Moves

#### Move OUT of Adapters → INTO Core Wrapper

1. **Billing policy decisions** (`canSpend`, budget checks, attribution rules)
2. **Receipt/ledger writes** (all `accountService.recordChargeReceipt` call sites)
3. **Canonical event mapping** (normalize adapter-specific events to AiEvent schema)
4. **Idempotency key generation** (shared `computeIdempotencyKey` validator)

#### Move INTO Transport Adapters ONLY

1. **Provider-specific execution logic** (LangGraph server calls, sandbox plumbing, OpenClaw interaction)
2. **Provider-specific parsing** (raw SDK responses → canonical events + usageFacts)

#### Introduce NEW Components

1. **BillingReconciler Service**
   - Consumes `usageFacts[]` from transports
   - Produces charge receipts idempotently
   - Shared by all executors (in-process, external, async)
   - Handles both immediate (in-proc) and deferred (external polling) strategies

2. **Shared Contract Test Suite**
   - `tests/contract/graph-executors/transport-contract.test.ts`
   - Validates every transport implementation against:
     - Event stream shape (ordering, termination, error propagation)
     - Cancellation semantics (cancel → no further events, stable final state)
     - Idempotency (same runId/attempt yields same usageUnitId set)
     - Usage facts schema (required keys present, attribution non-empty)
     - Billing side effects prohibition (transports cannot call recordChargeReceipt)

---

## 7) Mechanical Enforcement Plan

### 7.1) Dependency Cruiser Rules

**File**: `.dependency-cruiser.js` (or new `dependency-cruiser/executor-rules.js`)

```javascript
module.exports = {
  forbidden: [
    {
      name: "no-adapter-imports-in-core",
      severity: "error",
      from: { path: "^src/(core|domain|app)/" },
      to: { path: "^src/adapters/" },
      comment:
        "Core packages cannot import from adapters (hexagonal architecture)",
    },
    {
      name: "no-db-client-in-adapters",
      severity: "error",
      from: { path: "^src/adapters/(?!server/accounts|server/ai-telemetry)" },
      to: { pathNot: "^(drizzle-orm|pg)" },
      comment: "Only db-adapter packages may import DB clients",
    },
    {
      name: "no-billing-writes-in-adapters",
      severity: "error",
      from: { path: "^src/adapters/" },
      to: {
        path: "^src/ports/accounts.port",
        reachable: [{ path: "recordChargeReceipt" }],
      },
      comment:
        "Adapters cannot call accountService.recordChargeReceipt directly",
    },
    {
      name: "executors-via-port-only",
      severity: "warn",
      from: { path: "^src/(app|features)/" },
      to: {
        path: "^src/adapters/.*/(executor|provider)",
        pathNot: "^src/ports/graph-executor.port",
      },
      comment: "App/features must use GraphExecutorPort, not concrete adapters",
    },
  ],
};
```

**Validation**: `pnpm depcruise src --config .dependency-cruiser.js`

---

### 7.2) ESLint + TypeScript Rules

**File**: `eslint.config.mjs` (add to existing config)

```javascript
{
  files: ['src/adapters/**/*.ts'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: '@/ports/accounts.port',
            importNames: ['AccountService', 'recordChargeReceipt'],
            message: 'Adapters cannot import AccountService or call recordChargeReceipt. Use events instead.',
          },
          {
            name: 'drizzle-orm',
            message: 'Only db-adapter packages may import DB clients.',
          },
        ],
      },
    ],
  },
},
{
  files: ['src/adapters/**/graph-*.ts', 'src/adapters/**/*-executor.ts'],
  rules: {
    '@typescript-eslint/consistent-type-exports': [
      'error',
      {
        fixMixedExportsWithInlineTypeSpecifier: true,
      },
    ],
  },
}
```

**Validation**: `pnpm eslint src/adapters`

---

### 7.3) Contract Test Suite

**File**: `tests/contract/graph-executors/transport-contract.test.ts`

**Template**:

```typescript
import { describe, it, expect } from "vitest";
import type { GraphExecutionTransportPort } from "@/ports";

export function testTransportContract(
  name: string,
  createTransport: () => GraphExecutionTransportPort
) {
  describe(`Transport Contract: ${name}`, () => {
    it("emits events in correct order: content → usage → done", async () => {
      const transport = createTransport();
      const { stream } = transport.runGraph({
        /* ... */
      });

      const events = [];
      for await (const event of stream) {
        events.push(event.type);
      }

      expect(events).toEqual([
        "text_delta", // content events first
        "usage_report", // billing second
        "assistant_final", // final content
        "done", // termination last
      ]);
    });

    it("terminates with exactly one done event", async () => {
      const transport = createTransport();
      const { stream } = transport.runGraph({
        /* ... */
      });

      let doneCount = 0;
      for await (const event of stream) {
        if (event.type === "done") doneCount++;
      }

      expect(doneCount).toBe(1);
    });

    it("emits usage_report with required fields", async () => {
      const transport = createTransport();
      const { stream } = transport.runGraph({
        /* ... */
      });

      let usageFact: UsageFact | undefined;
      for await (const event of stream) {
        if (event.type === "usage_report") {
          usageFact = event.fact;
          break;
        }
      }

      expect(usageFact).toBeDefined();
      expect(usageFact.runId).toBeTruthy();
      expect(usageFact.usageUnitId).toBeTruthy(); // MUST be present
      expect(usageFact.billingAccountId).toBeTruthy();
      expect(usageFact.source).toBeTruthy();
    });

    it("handles cancellation gracefully", async () => {
      const transport = createTransport();
      const abort = new AbortController();
      const { stream } = transport.runGraph({
        abortSignal: abort.signal,
        /* ... */
      });

      let eventCount = 0;
      abort.abort(); // Cancel immediately

      for await (const event of stream) {
        eventCount++;
        // Should terminate quickly, not hang
      }

      expect(eventCount).toBeLessThan(10); // Sanity check
    });

    it("does NOT call accountService.recordChargeReceipt directly", async () => {
      // This is a negative assertion; requires DI mocking
      const mockAccountService = {
        recordChargeReceipt: vi.fn(),
      };

      const transport = createTransport(/* inject mock */);
      await transport.runGraph({
        /* ... */
      });

      // Transports emit events; core calls recordChargeReceipt
      expect(mockAccountService.recordChargeReceipt).not.toHaveBeenCalled();
    });

    it("produces idempotent usageUnitIds for same runId/attempt", async () => {
      const transport = createTransport();
      const runId = "test-run-123";
      const attempt = 0;

      // Run twice with same runId/attempt
      const run1 = await collectUsageFacts(transport, { runId, attempt });
      const run2 = await collectUsageFacts(transport, { runId, attempt });

      expect(run1.usageUnitIds).toEqual(run2.usageUnitIds);
    });
  });
}

// Usage in specific transport tests:
describe("LangGraphInProcProvider", () => {
  testTransportContract("InProc", () => new LangGraphInProcProvider(/* ... */));
});

describe("LangGraphDevProvider", () => {
  testTransportContract("Dev", () => new LangGraphDevProvider(/* ... */));
});

describe("SandboxGraphProvider", () => {
  testTransportContract("Sandbox", () => new SandboxGraphProvider(/* ... */));
});
```

**Validation**: `pnpm test:contract` (runs all contract tests)

---

## 8) Validation Plan

### Pre-Refactor Baseline

1. **Capture Current Behavior**:
   - Run `pnpm test:stack:docker` and save output
   - Run `pnpm check:full` and save baseline metrics
   - Capture billing receipts for known runs (runId → receipt count)

2. **Document Current Violations**:
   - List files violating future dependency-cruiser rules
   - Count executor implementations without contract tests
   - Identify usage_report events missing required fields

### During Refactor: Incremental Validation

1. **After Schema Validation**:
   - Add Zod validator for UsageFact at adapter boundary
   - Run contract tests: all should **fail** with schema errors
   - Fix adapters one by one until green

2. **After Idempotency Consolidation**:
   - Replace scattered key construction with shared validator
   - Run billing-idempotency stack test (`tests/stack/ai/billing-idempotency.stack.test.ts`)
   - Verify DB constraint catches duplicates

3. **After Dependency Rules**:
   - Run `pnpm depcruise src`
   - Fix violations (move billing calls to core)
   - Verify: `git grep -r 'recordChargeReceipt' src/adapters` → zero results

### Post-Refactor: Proof of Invariants

1. **ONE_LEDGER_WRITER Proof**:

   ```bash
   git grep -r 'recordChargeReceipt' src/ | grep -v 'src/features/ai/services/billing.ts'
   # Should return: 0 results (only billing.ts calls it)
   ```

2. **IDEMPOTENT_CHARGES Proof**:
   - Run: `pnpm test:stack -- billing-idempotency`
   - Expected: Same runId/attempt → single DB row (constraint blocks duplicates)

3. **SCHEMA_VALIDATION Proof**:
   - Inject malformed UsageFact in test
   - Expected: Zod validation error at adapter boundary (before billing)

4. **Contract Compliance Proof**:
   - Run: `pnpm test:contract -- graph-executors`
   - Expected: All transports pass (event ordering, cancellation, schema, no side effects)

5. **Billing Coverage Proof**:
   - Run: `pnpm test:stack -- streaming-side-effects`
   - Expected: All executor types (inproc, dev, sandbox) write receipts
   - Query DB: `SELECT source_system, COUNT(*) FROM charge_receipts GROUP BY source_system`

---

## Appendix A: File Reference Index

### Core Port Definitions

- `src/ports/graph-executor.port.ts` — GraphExecutorPort interface
- `src/ports/accounts.port.ts` — AccountService interface (recordChargeReceipt)
- `src/types/ai-events.ts` — AiEvent schema
- `packages/ai-core/src/usage/usage.ts` — UsageFact schema

### Executor Implementations

- `src/adapters/server/ai/aggregating-executor.ts:41` — AggregatingGraphExecutor
- `src/adapters/server/ai/observability-executor.decorator.ts:69` — ObservabilityGraphExecutorDecorator
- `src/adapters/server/ai/langgraph/inproc.provider.ts:91` — LangGraphInProcProvider
- `src/adapters/server/ai/langgraph/dev/provider.ts:64` — LangGraphDevProvider
- `src/adapters/server/sandbox/sandbox-graph.provider.ts:81` — SandboxGraphProvider

### Billing & Usage

- `src/features/ai/services/billing.ts:67` — recordBilling() (legacy, marked TODO)
- `src/features/ai/services/billing.ts:190` — commitUsageFact() (run-centric)
- `src/features/ai/services/billing.ts:166` — computeIdempotencyKey()
- `src/features/ai/services/ai_runtime.ts:182` — RunEventRelay (pump + fanout)
- `src/adapters/server/ai/inproc-completion-unit.adapter.ts:128` — InProcCompletionUnitAdapter

### Composition & Wiring

- `src/bootstrap/graph-executor.factory.ts:50` — createGraphExecutor()
- `src/bootstrap/container.ts` — Dependency injection container

### Tests

- `tests/stack/ai/billing-idempotency.stack.test.ts` — Idempotency validation
- `tests/stack/ai/streaming-side-effects.stack.test.ts` — Billing coverage
- `tests/stack/ai/one-ledger-writer.stack.test.ts` — Single writer validation

---

## Appendix B: Invariants Registry

| ID                                    | Invariant                                 | Owner                  | File                                  | Status                                                          |
| ------------------------------------- | ----------------------------------------- | ---------------------- | ------------------------------------- | --------------------------------------------------------------- |
| `ONE_LEDGER_WRITER`                   | Only billing.ts calls recordChargeReceipt | billing.ts             | `src/features/ai/services/billing.ts` | ✅ Implemented                                                  |
| `IDEMPOTENT_CHARGES`                  | source_reference prevents duplicates      | DB + billing.ts        | `billing.ts`                          | ✅ Enforced (strict schema, no fallback)                        |
| `ZERO_CREDIT_RECEIPTS`                | Always write receipt, even $0             | billing.ts             | `billing.ts`                          | ✅ Implemented                                                  |
| `GRAPH_LLM_VIA_COMPLETION`            | InProc graphs use completion unit         | inproc.provider.ts     | `inproc.provider.ts`                  | ✅ Implemented                                                  |
| `BILLING_INDEPENDENT_OF_CLIENT`       | Pump continues regardless of UI           | ai_runtime.ts          | `ai_runtime.ts`                       | ✅ Implemented                                                  |
| `GRAPH_FINALIZATION_ONCE`             | Exactly one done event per run            | graph-executor.port.ts | `graph-executor.port.ts`              | ⚠️ isTerminated guard in relay, not in port                     |
| `P0_ATTEMPT_FREEZE`                   | attempt always 0 in P0                    | All adapters           | Multiple                              | ✅ Hardcoded everywhere                                         |
| `PROTOCOL_TERMINATION`                | UI stream ends on done/error              | ai_runtime.ts          | `ai_runtime.ts`                       | ✅ Implemented                                                  |
| `USAGE_FACT_VALIDATED`                | Zod schema at ingestion boundary          | RunEventRelay          | `ai_runtime.ts`                       | ✅ Strict for inproc/sandbox, hints for ext                     |
| `GRAPHID_REQUIRED`                    | graphId on UsageFact, typed in port       | ai-core + port         | `usage.ts`, `graph-executor.port.ts`  | ⚠️ In UsageFact + Zod; NOT in charge_receipts DB yet (TODO #4b) |
| `GRAPHNAME_REQUIRED`                  | graphName required at all boundaries      | contracts + facade     | `ai.chat.v1`, `ai.completion.v1`      | ✅ No defaults, fail fast                                       |
| `EXTERNAL_BILLING_VIA_RECONCILIATION` | Dev provider defers billing               | dev/provider.ts        | `dev/provider.ts`                     | ⚠️ Emits hints-only fact, reconciliation P1                     |

---

## Appendix C: Other Ports (Secondary Audit)

### ToolRunnerPort / ToolSourcePort

**Location**: `packages/ai-core/src/index.ts` (implied from imports)

**Audit Finding**: ✅ **CLEAN**

- Tool execution via `createToolRunner(source, emit, { policy, ctx })`
- Adapters inject `BoundToolRuntime` via `ToolSourcePort.getBoundTool(toolId)`
- Policy enforcement in core (`createToolAllowlistPolicy`)
- **No domain logic in adapters** (adapters provide runtime bindings only)

**Evidence**: `src/adapters/server/ai/langgraph/inproc.provider.ts:166-204`

### ScheduleManagerPort

**Location**: `packages/scheduler-core/src/ports/` (implied)

**Audit Finding**: ⚠️ **Potential Issue** (not reviewed in detail)

- Similar pattern: port in packages, adapters in src/adapters/server/temporal
- Recommendation: Apply same contract test approach (not critical for P0)

### LlmService Port

**Location**: `src/ports/llm.port.ts`

**Audit Finding**: ✅ **CLEAN**

- Adapters (`litellm.adapter.ts`) emit usage events
- Features layer (`completion.ts`) processes billing
- **No billing writes in adapters**

---

**End of Report**
