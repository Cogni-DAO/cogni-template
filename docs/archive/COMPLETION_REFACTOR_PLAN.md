# Refactor Plan: completion.ts Modularization

> **Status**: Complete (P3 done)
> **Scope**: Extract `completion.ts` (826→414 lines) into focused modules
> **Goal**: Clean architecture, DRY, testable, LangGraph-ready

> [!CRITICAL]
> Each extraction step must leave all tests green. Public API (`execute`, `executeStream`) never changes. Strangler fig pattern: extract → wire → verify → repeat.

## Core Invariants

1. **INCREMENTAL_GREEN**: After each module extraction, `pnpm check` and all tests pass
2. **API_FROZEN**: `execute()` and `executeStream()` signatures unchanged throughout
3. **BEHAVIOR_IDENTICAL**: All 12 invariants in the Invariants table preserved exactly

---

## Implementation Checklist

### P0: Foundation (Tests First)

- [x] Add regression test for **STREAMING_SIDE_EFFECTS_ONCE** (billing/telemetry/metrics fire exactly once on success/error/abort)
- [x] Verify existing tests cover current behavior (baseline)
- [x] Create empty module files with type stubs only (no implementation)

### P1: Extract Pure Modules (No Ports)

- [x] Extract `message-preparation.ts` - move `prepareForExecution()` logic, return `PreparedMessages`
- [x] Wire into `completion.ts` - call `prepareMessages()`, keep all other code unchanged
- [x] Verify: `pnpm check` passes, all tests green
- [x] Extract `metrics.ts` - move Prometheus metric calls to `recordMetrics()`
- [x] Wire into `completion.ts` - call `recordMetrics()` in both paths
- [x] Verify: `pnpm check` passes, all tests green

### P2: Extract Port-Dependent Modules

- [x] Extract `preflight-credit-check.ts` - move credit estimation + balance check
- [x] Wire into `completion.ts` - call `validateCreditsUpperBound()`
- [x] Verify: `pnpm check` passes, all tests green
- [x] Extract `billing.ts` - unify billing logic from `execute()` and `executeStream().wrappedFinal`
- [x] Wire into `completion.ts` - call `recordBilling()` in both paths
- [x] Verify: `pnpm check` passes, all tests green
- [x] Extract `telemetry.ts` - unify success/error telemetry from both paths
- [x] Wire into `completion.ts` - call `recordTelemetry()` in both paths (4 call sites)
- [x] Verify: `pnpm check` passes, all tests green

### P3: Consolidate Orchestrator

- [x] Remove duplicated code via internal `handleLlmSuccess`/`handleLlmError` helpers
- [x] Zero duplication between `execute()` and `executeStream()` post-call handling
- [x] All tests pass (unit, contract, stack)
- [ ] ~~Verify `completion.ts` < 150 lines~~ (decided against: helpers kept internal for cohesion)

**P3 Decision:** Helpers (`PostCallContext`, `handleLlmSuccess`, `handleLlmError`) remain in `completion.ts` rather than extracted to separate file. Rationale: they're tightly coupled to the orchestrator and only used internally. Extracting would add file overhead without architectural benefit.

**Final metrics:**
| File | Lines |
|------|-------|
| `completion.ts` | 414 |
| `message-preparation.ts` | 107 |
| `metrics.ts` | 80 |
| `preflight-credit-check.ts` | 86 |
| `billing.ts` | 141 |
| `telemetry.ts` | 212 |

#### Chores

- [x] Update `features/ai/AGENTS.md` with new module descriptions
- [x] Run `/document` to update file headers

---

## File Pointers

| File                                                          | Lines | Change                                            |
| ------------------------------------------------------------- | ----- | ------------------------------------------------- |
| `src/features/ai/services/completion.ts`                      | 414   | Orchestrator + internal DRY helpers               |
| `src/features/ai/services/message-preparation.ts`             | 107   | Message filtering, validation, fallbackPromptHash |
| `src/features/ai/services/preflight-credit-check.ts`          | 86    | Upper-bound credit estimation                     |
| `src/features/ai/services/billing.ts`                         | 141   | Non-blocking charge receipt recording             |
| `src/features/ai/services/telemetry.ts`                       | 212   | DB + Langfuse writes with dual promptHash         |
| `src/features/ai/services/metrics.ts`                         | 80    | Prometheus metric recording                       |
| `tests/stack/ai/streaming-side-effects.stack.test.ts`         | —     | STREAMING_SIDE_EFFECTS_ONCE regression test       |
| `tests/unit/features/ai/services/message-preparation.test.ts` | 44    | Unit tests for hash determinism, system prompt    |
| `tests/unit/features/ai/services/metrics.test.ts`             | 83    | Unit tests for success/error metric paths         |

---

## Problem Statement

`src/features/ai/services/completion.ts` is a monolith handling 6+ concerns:

1. Message preparation (filtering, validation, trimming, system prompt)
2. Cost estimation and pre-flight credit check
3. LLM execution orchestration
4. Post-call billing (charge receipt recording)
5. Telemetry recording (DB + Langfuse)
6. Prometheus metrics

**Code duplication**: `execute()` and `executeStream()` share ~80% identical logic for billing, telemetry, and error handling.

---

## Final Module Structure

```
src/features/ai/services/
├── completion.ts              # Orchestrator + internal DRY helpers (414 lines)
├── message-preparation.ts     # Message processing (107 lines)
├── preflight-credit-check.ts  # Pre-flight gating (86 lines)
├── billing.ts                 # Post-call charge recording (141 lines)
├── telemetry.ts               # ai_invocation_summaries + Langfuse (212 lines)
├── metrics.ts                 # Prometheus metrics (80 lines)
├── ai_runtime.ts              # Existing: graph vs direct decision
├── llmPricingPolicy.ts        # Existing: unchanged
├── activity.ts                # Existing: unchanged
└── mappers.ts                 # Existing: unchanged
```

**Note:** `completion.ts` includes internal helpers (`PostCallContext`, `handleLlmSuccess`, `handleLlmError`) for DRY between `execute()` and `executeStream()`. These are not extracted to a separate file as they're tightly coupled to the orchestrator.

---

## Module Specifications

### 1. `message-preparation.ts` (~60 lines)

**Purpose**: Transform raw messages into LLM-ready format.

**Exports**:

```typescript
export interface PreparedMessages {
  readonly messages: Message[];
  readonly fallbackPromptHash: string; // See note below
  readonly estimatedTokensUpperBound: number;
}

export function prepareMessages(
  rawMessages: Message[],
  model: string
): PreparedMessages;
```

**Responsibilities**:

- Filter system messages (defense-in-depth)
- Validate message length per `MAX_MESSAGE_CHARS`
- Trim conversation history to fit context window
- Prepend baseline system prompt
- Compute **fallback** `promptHash` for error path availability
- Estimate token count for credit check

**promptHash Pattern (Preserves Existing Behavior)**:

- Per `AI_SETUP_SPEC.md`: promptHash must be available on error paths
- This module computes a **fallback** hash before LLM call
- Adapter computes canonical hash and returns in `result.promptHash`
- `telemetry.ts` prefers `result.promptHash` when available: `resolvedPromptHash = result.promptHash ?? fallbackPromptHash`
- This matches the current `completion.ts` pattern (lines 401, 667)

**Does NOT**:

- Perform credit checks (separate module)
- Interact with any ports

---

### 2. `preflight-credit-check.ts` (~40 lines)

**Purpose**: Pre-flight credit validation using conservative upper-bound estimate.

**Exports**:

```typescript
export async function validateCreditsUpperBound(
  billingAccountId: string,
  estimatedTokensUpperBound: number,
  model: string,
  accountService: AccountService
): Promise<void>; // throws InsufficientCreditsPortError
```

**Responsibilities**:

- Estimate cost using `ESTIMATED_USD_PER_1K_TOKENS` (conservative upper bound)
- Free models return 0n immediately
- Check balance via `AccountService.getBalance()`
- Throw `InsufficientCreditsPortError` if insufficient

**Invariants** (per CREDIT_ESTIMATE_UPPER_BOUND):

- Uses same USD→credits pipeline as post-call billing
- Estimate includes `max_tokens` and **cannot underestimate**
- Free models always pass (0n cost)

---

### 3. `billing.ts` (~80 lines)

**Purpose**: Post-call charge recording (non-blocking).

**Exports**:

```typescript
export interface BillingContext {
  readonly billingAccountId: string;
  readonly virtualKeyId: string;
  readonly requestId: string;
  readonly model: string;
  readonly providerCostUsd: number | undefined;
  readonly litellmCallId: string | undefined;
  readonly provenance: "response" | "stream";
}

export async function recordBilling(
  context: BillingContext,
  accountService: AccountService,
  log: Logger
): Promise<void>;
```

**Responsibilities**:

- Check if model is free (chargedCredits = 0n if so)
- Calculate user charge via `llmPricingPolicy` for paid models
- Record charge receipt via `AccountService.recordChargeReceipt()`
- Log critical errors but **never throw** in prod (non-blocking)
- Re-throw in test env for debugging (per TEST_ENV_RETHROWS_BILLING)

**Invariants**:

- Post-call billing NEVER blocks user response
- **ZERO_CREDIT_RECEIPTS_WRITTEN**: Always record receipt even when `chargedCredits = 0n`
- **LITELLM_CALL_ID_FALLBACK**: `sourceReference = litellmCallId ?? requestId` with error log on fallback
- **TEST_ENV_RETHROWS_BILLING**: `APP_ENV === "test"` re-throws for test visibility

---

### 4. `telemetry.ts` (~120 lines)

**Purpose**: Record AI invocation to DB and Langfuse.

**Exports**:

```typescript
export interface TelemetryContext {
  readonly invocationId: string;
  readonly requestId: string;
  readonly traceId: string;
  readonly fallbackPromptHash: string;
  readonly canonicalPromptHash: string | undefined; // from adapter result
  readonly model: string;
  readonly latencyMs: number;
  readonly status: "success" | "error";
  readonly errorCode?: LlmErrorKind;
  // Success fields
  readonly resolvedProvider?: string;
  readonly resolvedModel?: string;
  readonly usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  readonly providerCostUsd?: number;
  readonly litellmCallId?: string;
  // Graph fields (P1-ready)
  readonly graphRunId?: string;
  readonly graphName?: string;
  readonly graphVersion?: string;
}

export async function recordTelemetry(
  context: TelemetryContext,
  aiTelemetry: AiTelemetryPort,
  langfuse: LangfusePort | undefined,
  log: Logger
): Promise<string | undefined>; // returns langfuseTraceId
```

**Responsibilities**:

- Create Langfuse trace if port available
- Record generation metrics to Langfuse
- Write to `ai_invocation_summaries` via `AiTelemetryPort`
- Return `langfuseTraceId` for DB record join
- **Never throw** - telemetry should not block response

**Invariants**:

- Called on BOTH success AND error paths
- **PROMPTHASH_DUAL_RESOLUTION**: `resolvedPromptHash = canonicalPromptHash ?? fallbackPromptHash`
- Langfuse flush is fire-and-forget (never awaited)
- P1-ready: If `graphRunId` present, `graphName`/`graphVersion` required

---

### 5. `metrics.ts` (~60 lines)

**Purpose**: Prometheus metrics recording for LLM calls.

**Exports**:

```typescript
export interface MetricsContext {
  readonly model: string;
  readonly durationMs: number;
  readonly tokensUsed?: number;
  readonly providerCostUsd?: number;
  readonly isError: boolean;
  readonly errorCode?: string;
}

export async function recordMetrics(context: MetricsContext): Promise<void>;
```

**Responsibilities**:

- Record `ai_llm_call_duration_ms` histogram
- Increment `ai_llm_tokens_total` counter
- Increment `ai_llm_cost_usd_total` counter
- Increment `ai_llm_errors_total` on error path
- Resolve model class via `getModelClass()`

**Does NOT**:

- Handle any business logic
- Interact with billing or telemetry

---

### 6. `completion.ts` (Refactored ~100 lines)

**Purpose**: Thin orchestrator for LLM execution flows.

**Exports** (unchanged public API):

```typescript
export async function execute(...): Promise<{ message: Message; requestId: string }>;
export async function executeStream(...): Promise<{ stream: AsyncIterable<ChatDeltaEvent>; final: Promise<StreamFinalResult> }>;
```

**New internal structure**:

```typescript
import { prepareMessages } from "./message-preparation";
import { validateCreditsUpperBound } from "./preflight-credit-check";
import { recordBilling } from "./billing";
import { recordTelemetry } from "./telemetry";
import { recordMetrics } from "./metrics";

async function execute(...) {
  // 1. Prepare messages + get fallbackPromptHash
  const { messages, fallbackPromptHash, estimatedTokensUpperBound } = prepareMessages(rawMessages, model);

  // 2. Pre-flight credit check (upper-bound estimate)
  await validateCreditsUpperBound(caller.billingAccountId, estimatedTokensUpperBound, model, accountService);

  // 3. Execute LLM
  const result = await llmService.completion({ messages, model, caller });

  // 4. Record metrics
  await recordMetrics({ model: result.model, durationMs, tokensUsed, ... });

  // 5. Record billing (non-blocking, per ZERO_CREDIT_RECEIPTS_WRITTEN always writes)
  recordBilling({ ... }, accountService, log).catch(err => log.error(...));

  // 6. Record telemetry (per PROMPTHASH_DUAL_RESOLUTION: prefer canonical)
  recordTelemetry({
    fallbackPromptHash,
    canonicalPromptHash: result.promptHash,
    ...
  }, aiTelemetry, langfuse, log).catch(err => log.error(...));

  return { message: result.message, requestId };
}
```

---

## DRY Improvements

### Current Duplication (Before)

| Code Block               | `execute()`   | `executeStream().wrappedFinal` |
| ------------------------ | ------------- | ------------------------------ |
| Prompt hash computation  | Lines 167-176 | Lines 523-532                  |
| Model resolution logging | Lines 260-273 | Lines 557-570                  |
| Billing logic            | Lines 307-395 | Lines 603-661                  |
| Telemetry success        | Lines 403-468 | Lines 669-736                  |
| Telemetry error          | Lines 199-252 | Lines 763-813                  |
| Metrics recording        | Lines 288-305 | Lines 584-601                  |

### After Refactor

- **Single implementation** of each concern in dedicated module
- Both `execute()` and `executeStream()` call same helper functions
- Error handling paths unified with shared `recordTelemetry()` call

---

## Dependency Graph

```
completion.ts (orchestrator)
├── message-preparation.ts (pure: @/core, @/shared/ai)
├── preflight-credit-check.ts (uses: AccountService port)
├── billing.ts (uses: AccountService port, llmPricingPolicy)
├── telemetry.ts (uses: AiTelemetryPort, LangfusePort)
└── metrics.ts (uses: @/shared/observability)
```

**Import rules preserved**:

- All modules may import: `@/core`, `@/ports`, `@/shared`
- None may import: `@/app`, `@/adapters`, `@/contracts`

---

## Testing Requirements

| Module                      | Test Type   | What to Test                                       |
| --------------------------- | ----------- | -------------------------------------------------- |
| `message-preparation.ts`    | Unit        | Message filtering, validation, trimming with mocks |
| `preflight-credit-check.ts` | Unit        | Credit estimation with mock AccountService         |
| `billing.ts`                | Integration | Charge receipt recording via port                  |
| `telemetry.ts`              | Integration | DB + Langfuse writes via ports                     |
| `metrics.ts`                | Integration | Prometheus counter increments                      |
| `completion.ts`             | Contract    | Existing tests unchanged (API frozen)              |

**P0 regression test** (see Implementation Checklist): **STREAMING_SIDE_EFFECTS_ONCE**

---

## Invariants (Must Preserve)

| Invariant                        | Source                | Implementation                                                                                                                    |
| -------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Pre-call credit check            | `ACTIVITY_METRICS.md` | `preflight-credit-check.ts` throws before LLM call                                                                                |
| Post-call billing non-blocking   | `ACTIVITY_METRICS.md` | `billing.ts` catches all errors in prod                                                                                           |
| promptHash pre-computed          | `AI_SETUP_SPEC.md`    | `message-preparation.ts` returns fallback hash                                                                                    |
| request_id stable                | `AI_SETUP_SPEC.md`    | Passed through from `ctx.reqId`                                                                                                   |
| invocation_id unique             | `AI_SETUP_SPEC.md`    | Generated in `completion.ts` per LLM call                                                                                         |
| Telemetry on both paths          | `AI_SETUP_SPEC.md`    | `telemetry.ts` called in try/catch                                                                                                |
| **STREAMING_SIDE_EFFECTS_ONCE**  | Current code          | In `executeStream()`, billing/telemetry/metrics are triggered **only** from the `final` promise path; never from stream iteration |
| **ZERO_CREDIT_RECEIPTS_WRITTEN** | Current code          | `billing.ts` always writes `charge_receipts` even when `chargedCredits = 0n`                                                      |
| **CREDIT_ESTIMATE_UPPER_BOUND**  | Current code          | `preflight-credit-check.ts` uses `ESTIMATED_USD_PER_1K_TOKENS` conservative upper bound                                           |
| **TEST_ENV_RETHROWS_BILLING**    | Current code          | `billing.ts`: `APP_ENV === "test"` re-throws; prod swallows                                                                       |
| **PROMPTHASH_DUAL_RESOLUTION**   | Current code          | `telemetry.ts`: `resolvedPromptHash = canonicalPromptHash ?? fallbackPromptHash`                                                  |
| **LITELLM_CALL_ID_FALLBACK**     | Current code          | `billing.ts`: `sourceReference = litellmCallId ?? requestId` with error log                                                       |

---

## P1 LangGraph Readiness

These modules are designed to support P1 graph integration:

| Module          | P1 Change                                                 |
| --------------- | --------------------------------------------------------- |
| `telemetry.ts`  | Already accepts `graphRunId`, `graphName`, `graphVersion` |
| `billing.ts`    | No change needed (billing is per-LLM-call)                |
| `completion.ts` | Will accept `GraphLlmCaller` with required graph fields   |
| `ai_runtime.ts` | Already generates `graphRunId`, decides graph vs direct   |

---

## Architecture Compliance

### Import Boundaries (Verified)

| Module                      | Imports                         | Boundary Check               |
| --------------------------- | ------------------------------- | ---------------------------- |
| `message-preparation.ts`    | `@/core`, `@/shared/ai`         | ✓ features → core, shared    |
| `preflight-credit-check.ts` | `@/ports`                       | ✓ features → ports           |
| `billing.ts`                | `@/ports`, `./llmPricingPolicy` | ✓ features → ports, features |
| `telemetry.ts`              | `@/ports`                       | ✓ features → ports           |
| `metrics.ts`                | `@/shared/observability`        | ✓ features → shared          |
| `completion.ts`             | All above modules               | ✓ features → features        |

### Public Surface (Unchanged)

Per `FEATURE_DEVELOPMENT_GUIDE.md`, feature services export `execute`. The new modules are **internal helpers** - not added to `public.server.ts`. Public API remains:

- `execute()` - non-streaming completion
- `executeStream()` - streaming completion
- `createAiRuntime()` - already exists, delegates to `executeStream()`

### AGENTS.md Alignment

- `features/ai/AGENTS.md`: "Does NOT: compute promptHash (owned by litellm.adapter.ts)"
  - **Clarification**: Feature computes **fallback** hash for error paths; adapter's canonical hash is preferred when available. This matches existing code pattern.

---

## Success Criteria

- [x] ~~`completion.ts` reduced to <150 lines~~ → 414 lines (helpers kept internal; see P3 Decision)
- [x] Each new module <150 lines (except `telemetry.ts` at 212 - acceptable for Langfuse complexity)
- [x] Zero code duplication between `execute()` and `executeStream()`
- [x] All existing tests pass
- [x] `pnpm check` passes
- [x] No new lint/type errors
- [x] Public API unchanged (`execute`, `executeStream` signatures)
- [x] Import boundaries verified (no adapters, app, bootstrap imports)
- [x] Regression test for **STREAMING_SIDE_EFFECTS_ONCE** added and passing
- [x] Unit tests added for `message-preparation.ts` and `metrics.ts`

---

## Related Documents

- [AI_SETUP_SPEC.md](AI_SETUP_SPEC.md) - P1 invariants
- [FIX_AI_STREAMING_PIPELINE.md](FIX_AI_STREAMING_PIPELINE.md) - Original refactor recommendation
- [LANGGRAPH_AI.md](LANGGRAPH_AI.md) - Graph architecture
- [ARCHITECTURE.md](ARCHITECTURE.md) - Hexagonal layers

---

**Last Updated**: 2025-12-21
**Status**: Complete
