# Graph Executor Architecture Audit Report

**Date**: 2026-02-07
**Branch**: feat/sandbox-0.75
**Auditor**: Claude Opus 4.6

---

## Executive Summary

The current graph execution system demonstrates **strong separation of concerns** at the high level, with adapters emitting usage facts and the features layer processing billing. However, **critical enforcement gaps** exist:

1. ✅ **Single Ledger Writer**: Only `billing.ts` calls `accountService.recordChargeReceipt()`
2. ❌ **No Schema Validation**: UsageFact schema not enforced at adapter boundary
3. ❌ **Scattered Idempotency Logic**: Each adapter constructs keys independently
4. ❌ **No Contract Tests**: No shared compliance suite for executor implementations
5. ⚠️ **Incomplete External Executors**: Dev and Sandbox providers have billing gaps

**Recommendation**: Implement the proposed **Transport/Enforcement Split** with mechanical enforcement via dependency-cruiser rules and shared contract tests.

---

## 🚨 P0 TODO Items (Critical Before Production)

These three changes prevent the highest-risk billing failures when adding sandbox execution:

### [ ] 1. Remove Fallback usageUnitId Generation in Adapters

**File**: `src/adapters/server/ai/inproc-completion-unit.adapter.ts:114`

**Change**: Remove any fallback/placeholder `usageUnitId` generation (e.g., `MISSING:...`). Always require real `usageUnitId` from LiteLLM.

**Current Code** (Lines 113-121):

```typescript
const usageUnitId = litellmCallId ?? `MISSING:${runId}/0`;
if (!litellmCallId) {
  log.error(
    { runId, model, isFree },
    "BUG: LiteLLM response missing call ID - using fallback usageUnitId"
  );
}
```

**Required Change**: Fail fast if `litellmCallId` is missing (throw error). No silent fallback.

**Why**: Fallback keys can collide across retries/reconnects, causing duplicate charge detection to fail. Better to fail loudly than silently under-bill or double-bill.

---

### [ ] 2. Enforce usageUnitId in Sandbox Provider

**File**: `src/adapters/server/sandbox/sandbox-graph.provider.ts:215-224`

**Change**: Always emit `usage_report` with `UsageFact.usageUnitId` set (stable per runId/attempt/call).

**Current Code** (Lines 215-224):

```typescript
const usageFact: UsageFact = {
  runId,
  attempt,
  source: "litellm",
  executorType: "inproc", // TODO: add "sandbox" to ExecutorType union
  billingAccountId: caller.billingAccountId,
  virtualKeyId: caller.virtualKeyId,
  model,
  // ❌ Missing: usageUnitId (required for idempotency)
  // ❌ Missing: costUsd (deferred to P1, but breaks reconciliation)
};
```

**Required Change**:

1. Capture and propagate `x-litellm-call-id` from LiteLLM HTTP response headers (or proxy-provided metadata) into `usageUnitId`
2. Set `executorType: "sandbox"` (add to union if needed)
3. If `litellmCallId` unavailable, throw error (no silent fallback)

**Why**: Without stable `usageUnitId`, sandbox runs are not deduplicated. Retries/reconnects will double-charge users.

**P0 Scope**: Capture inline from response headers only. Do NOT build audit log queries or reconciliation flows.

---

### [ ] 3. Validate UsageFact Schema in RunEventRelay

**File**: `src/features/ai/services/ai_runtime.ts:265-277`

**Change**: At `usage_report` ingestion, validate required `UsageFact` fields; fail fast on invalid. Also enforce **done exactly once** and ignore events after done.

**Current Code** (Lines 265-277):

```typescript
private async handleBilling(event: {
  type: "usage_report";
  fact: import("@/types/usage").UsageFact;
}): Promise<void> {
  try {
    await commitUsageFact(
      event.fact,
      this.callIndex++,
      this.context,
      this.accountService,
      this.log
    );
  } catch (error) {
    // ...
  }
}
```

**Required Change**:

1. Add Zod schema validation before `commitUsageFact()`:

   ```typescript
   const UsageFactSchema = z.object({
     runId: z.string().min(1),
     attempt: z.number().int().min(0),
     source: z.string().min(1),
     billingAccountId: z.string().min(1),
     virtualKeyId: z.string().min(1),
     usageUnitId: z.string().min(1), // REQUIRED (no undefined)
     model: z.string().optional(),
     costUsd: z.number().optional(),
   });

   const validated = UsageFactSchema.parse(event.fact);
   ```

2. In `RunEventRelay.pump()`, add termination guard:

   ```typescript
   private sawDone = false;

   for await (const event of this.upstream) {
     if (this.sawDone) {
       this.log.warn({ event }, "Ignoring event after done");
       continue; // Ignore all events after done
     }

     if (event.type === "done") {
       this.sawDone = true;
     }

     // ... rest of pump logic
   }
   ```

**Why**:

- **Schema validation**: Prevents malformed facts from reaching billing (would cause silent under-billing or DB errors)
- **Done-once guard**: Prevents double-termination bugs (executor emits done twice → UI hangs or shows duplicate final message)

---

**Why These 4 Are Enough**:

These changes address the **highest-risk failures** when adding sandbox execution:

1. **Billing deduplication** (usageUnitId stability)
2. **Malformed facts** (schema validation at ingestion boundary)
3. **Protocol violations** (double termination)

Without these, sandbox execution will cause production incidents:

- Users charged twice for retries (missing usageUnitId)
- Billing reconciliation fails silently (missing required fields)
- UI hangs or shows duplicate responses (done emitted twice)

**Implementation Order**: 3 → 1 → 2 → 4 (validation first, then fix adapters, then add analytics field).

---

### [ ] 4. Add graphId to UsageFact and Fix Port Type Consistency

**Files**:

- `packages/ai-core/src/usage/usage.ts:34`
- `src/ports/graph-executor.port.ts:48`
- All adapter implementations (inproc, sandbox, dev)

**Change**: Add graph identifier to usage facts for per-agent analytics and fix type inconsistency.

**Current State**:

1. ❌ `UsageFact` has no `graphId` field (cannot track which agent was used)
2. ❌ `GraphExecutorPort.graphId` typed as `string` instead of branded `GraphId`
3. ✅ Branded type exists: `GraphId = \`${string}:${string}\``in`@cogni/ai-core`

**Required Changes**:

1. Add to `UsageFact` schema:

   ```typescript
   export interface UsageFact {
     // ... existing fields
     /** Graph identifier (e.g., "langgraph:poet", "sandbox:agent") */
     readonly graphId?: GraphId;
   }
   ```

2. Fix port type:

   ```typescript
   // src/ports/graph-executor.port.ts:48
   - readonly graphId: string;
   + readonly graphId: GraphId;
   ```

3. Propagate in adapters:
   - `InProcCompletionUnitAdapter`: Add `graphId` param, include in UsageFact emission (line 273)
   - `SandboxGraphProvider`: Include `req.graphId` in UsageFact (line 215)
   - `LangGraphDevProvider`: (Future - when usage_report implemented)

**Why**:

- Enables per-agent cost analytics ("poet used 1M tokens this month")
- Debugging ("which agent caused this spike?")
- Fixes type inconsistency (UI uses `GraphId`, port uses `string`)

**P0 Scope**: Add field, propagate from request. Analytics dashboards deferred to P1.

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
- `graphId`: string — Fully-qualified (e.g., "langgraph:poet")
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

**UsageFact Schema** (`packages/ai-core/src/usage/usage.ts:10-30`):

```typescript
export interface UsageFact {
  runId: string;
  attempt: number;
  source: string; // e.g., "litellm"
  executorType: ExecutorType; // "inproc" | "external"
  billingAccountId: string;
  virtualKeyId: string;
  inputTokens?: number;
  outputTokens?: number;
  usageUnitId?: string; // Stable ID for idempotency
  model?: string;
  costUsd?: number;
}
```

**⚠️ CRITICAL GAP**: No runtime validation enforces this schema at adapter boundaries.

---

## 2) Implementation Inventory

### GraphExecutorPort Implementations

| Component                               | Type      | Path                                                            | Responsibility                 |
| --------------------------------------- | --------- | --------------------------------------------------------------- | ------------------------------ |
| **AggregatingGraphExecutor**            | Router    | `src/adapters/server/ai/aggregating-executor.ts:41`             | Routes graphId → GraphProvider |
| **ObservabilityGraphExecutorDecorator** | Decorator | `src/adapters/server/ai/observability-executor.decorator.ts:69` | Wraps for Langfuse traces      |

### GraphProvider Implementations (Internal Interface)

**Note**: `GraphProvider` is an internal adapter interface, **not a port**. Located at `src/adapters/server/ai/graph-provider.ts:31`.

| Provider                    | Path                                                    | Line | Execution Model               | Billing Method                                                         |
| --------------------------- | ------------------------------------------------------- | ---- | ----------------------------- | ---------------------------------------------------------------------- |
| **LangGraphInProcProvider** | `src/adapters/server/ai/langgraph/inproc.provider.ts`   | 91   | In-process LangChain graphs   | Via InProcCompletionUnitAdapter → usage_report events                  |
| **LangGraphDevProvider**    | `src/adapters/server/ai/langgraph/dev/provider.ts`      | 64   | External langgraph dev server | ⚠️ **NO usage_report** (relies on external reconciliation)             |
| **SandboxGraphProvider**    | `src/adapters/server/sandbox/sandbox-graph.provider.ts` | 81   | Containerized agent execution | ⚠️ **Partial**: Emits usage_report without costUsd (P1 reconciliation) |

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

**Locations**:

1. `billing.ts:computeIdempotencyKey()` (Lines 166-172) — Canonical implementation
2. `inproc-completion-unit.adapter.ts:114` — Fallback: `MISSING:${runId}/0`
3. `billing.ts:207` — Fallback: `MISSING:${runId}/${callIndex}`

**❌ VIOLATION**: Adapters construct fallback keys independently; no shared validation ensures format correctness.

### Database Writes

| Component                      | DB Interaction                               | Path         | Line | Permission                            |
| ------------------------------ | -------------------------------------------- | ------------ | ---- | ------------------------------------- |
| `billing.ts:commitUsageFact()` | Calls `accountService.recordChargeReceipt()` | `billing.ts` | 243  | ✅ Via port                           |
| `billing.ts:recordBilling()`   | Calls `accountService.recordChargeReceipt()` | `billing.ts` | 124  | ✅ Via port (marked TODO for removal) |
| Adapters                       | **NONE** (emit events only)                  | —            | —    | ✅ No direct DB access                |

**✅ CLEAN**: No adapters bypass ports to write billing data directly.

---

## 5) Key Breakages (Top 5)

### #1: No UsageFact Schema Validation at Adapter Boundary

**Severity**: 🔴 **CRITICAL**
**Impact**: Malformed facts can pass through, causing billing failures or silent under-billing.

**Evidence**:

- `InProcCompletionUnitAdapter` emits UsageFact at line 273-287
- `SandboxGraphProvider` emits UsageFact at line 215-224
- **NO** runtime validation (Zod schema check) before emission
- **NO** contract tests enforce required fields

**File References**:

- `src/adapters/server/ai/inproc-completion-unit.adapter.ts:273-287`
- `src/adapters/server/sandbox/sandbox-graph.provider.ts:215-224`
- `packages/ai-core/src/usage/usage.ts:10-30` (schema definition only)

**Example Violation**:

```typescript
// SandboxGraphProvider:215-224 — missing costUsd, usageUnitId
const usageFact: UsageFact = {
  runId,
  attempt,
  source: "litellm",
  executorType: "inproc", // Should be "sandbox"?
  billingAccountId: caller.billingAccountId,
  virtualKeyId: caller.virtualKeyId,
  model,
  // ❌ Missing: usageUnitId (required for idempotency)
  // ❌ Missing: costUsd (deferred to P1, but breaks reconciliation)
};
```

---

### #2: Scattered Idempotency Key Construction

**Severity**: 🟠 **HIGH**
**Impact**: Inconsistent key formats risk duplicate charges or failed deduplication.

**Evidence**:

- Three separate implementations of fallback logic:
  1. `billing.ts:114` — `MISSING:${runId}/0`
  2. `billing.ts:207` — `MISSING:${runId}/${callIndex}`
  3. `inproc-completion-unit.adapter.ts:114` — Same pattern, duplicated

**File References**:

- `src/features/ai/services/billing.ts:114` (recordBilling fallback)
- `src/features/ai/services/billing.ts:207` (commitUsageFact fallback)
- `src/adapters/server/ai/inproc-completion-unit.adapter.ts:114` (adapter fallback)

**Violation**: No shared validator ensures `usageUnitId` format is stable across retries/reconnects.

---

### #3: No Contract Tests for Executor Implementations

**Severity**: 🟠 **HIGH**
**Impact**: New executors can violate invariants (e.g., emit done twice, skip usage_report) without detection.

**Evidence**:

- `LangGraphInProcProvider` tested in isolation (implied)
- `LangGraphDevProvider` tested in isolation (implied)
- `SandboxGraphProvider` tested in isolation (implied)
- **NO** shared contract test suite (`tests/contract/executors/*.test.ts`) validating:
  - Event stream shape (ordering, termination)
  - Cancellation semantics
  - Idempotency (same runId/attempt yields same usageUnitId set)
  - Usage facts presence and schema
  - Billing side effects (only via events, not direct calls)

**Missing File**: `tests/contract/graph-executors/executor-contract.test.ts`

---

### #4: LangGraphDevProvider Missing Usage Reporting

**Severity**: 🟠 **HIGH**
**Impact**: External executor usage is **invisible** to run-centric billing; relies on external reconciliation that may not happen.

**Evidence**:

- `LangGraphDevProvider` streams events but **never emits usage_report**
- Comments indicate reliance on "external billing via reconciliation" (EXTERNAL_BILLING_VIA_RECONCILIATION invariant)
- No reconciliation service implemented in P0/P0.75

**File References**:

- `src/adapters/server/ai/langgraph/dev/provider.ts:220-326` (entire stream generation, no usage_report)
- `src/adapters/server/ai/langgraph/dev/provider.ts:65` (comment references external billing)

**P0 Violation**: Run-centric billing requires **all** executors to emit usage_report. External reconciliation is a P1 feature.

---

### #5: GraphProvider Not a Port (Limits External Executors)

**Severity**: 🟡 **MEDIUM**
**Impact**: External teams cannot implement compliant executors without modifying `src/adapters/`.

**Evidence**:

- `GraphProvider` interface defined in `src/adapters/server/ai/graph-provider.ts` (adapter layer)
- **NOT** exported from `src/ports/index.ts`
- Factory (`graph-executor.factory.ts`) hardcodes provider list (no plugin system)

**File References**:

- `src/adapters/server/ai/graph-provider.ts:31` (interface definition)
- `src/ports/index.ts` (no GraphProvider export)
- `src/bootstrap/graph-executor.factory.ts:50-76` (hardcoded provider list)

**Tradeoff**: P0 design choice (avoid premature abstraction). Acceptable for now, but blocks external executor plugins.

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

| ID                                    | Invariant                                 | Owner                  | File                                  | Line | Status                      |
| ------------------------------------- | ----------------------------------------- | ---------------------- | ------------------------------------- | ---- | --------------------------- |
| `ONE_LEDGER_WRITER`                   | Only billing.ts calls recordChargeReceipt | billing.ts             | `src/features/ai/services/billing.ts` | 9    | ✅ Implemented              |
| `IDEMPOTENT_CHARGES`                  | source_reference prevents duplicates      | DB + billing.ts        | `billing.ts`                          | 12   | ⚠️ Partial (scattered keys) |
| `ZERO_CREDIT_RECEIPTS`                | Always write receipt, even $0             | billing.ts             | `billing.ts`                          | 11   | ✅ Implemented              |
| `GRAPH_LLM_VIA_COMPLETION`            | InProc graphs use completion unit         | inproc.provider.ts     | `inproc.provider.ts`                  | 10   | ✅ Implemented              |
| `BILLING_INDEPENDENT_OF_CLIENT`       | Pump continues regardless of UI           | ai_runtime.ts          | `ai_runtime.ts`                       | 10   | ✅ Implemented              |
| `GRAPH_FINALIZATION_ONCE`             | Exactly one done event per run            | graph-executor.port.ts | `graph-executor.port.ts`              | 10   | ⚠️ Not enforced             |
| `P0_ATTEMPT_FREEZE`                   | attempt always 0 in P0                    | All adapters           | Multiple                              | —    | ✅ Hardcoded everywhere     |
| `PROTOCOL_TERMINATION`                | UI stream ends on done/error              | ai_runtime.ts          | `ai_runtime.ts`                       | 12   | ✅ Implemented              |
| `EXTERNAL_BILLING_VIA_RECONCILIATION` | Dev provider defers billing               | dev/provider.ts        | `dev/provider.ts`                     | 65   | ❌ Not implemented (P1)     |

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
