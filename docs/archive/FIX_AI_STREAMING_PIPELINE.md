# Fix: AI Streaming Pipeline Consolidation

> **Status**: Complete
> **Author**: Architecture Review
> **Date**: 2025-12-19

## TODO

- [x] Rename `ai.facade.ts` → `services/streaming.ts` (matches established `services/<domain>.ts` pattern)
- [x] Wire `completion.server.ts` to call `streamChat()` from `services/streaming.ts`
- [x] Add dep-cruiser rule: `_facades/ai/` cannot import `features/ai/services/*` directly
- [x] Fix stack tests to parse `assistant-stream` format instead of SSE
- [x] Split `public.ts` → `public.ts` (client-safe) + `public.server.ts` (server-only) to fix `prom-client`/`v8` bundle error

**Optional refactor (recommended but not blocking):**

- [x] Extract `completion.ts` into focused modules (see [COMPLETION_REFACTOR_PLAN.md](COMPLETION_REFACTOR_PLAN.md))

---

## Analysis: Why "Two Facades" Is Wrong

### Current Naming Creates Confusion

| File                                       | Current Name     | Actual Role                                                            |
| ------------------------------------------ | ---------------- | ---------------------------------------------------------------------- |
| `src/app/_facades/ai/completion.server.ts` | "App Facade"     | App-layer coordinator: auth, billing account resolution, error mapping |
| `src/features/ai/ai.facade.ts`             | "Feature Facade" | Feature-layer orchestrator: graph decision, UiEvent emission           |

**Problem:** Both are called "facades" but serve different architectural roles. This naming collision caused the bypass issue.

### What The Architecture Actually Says

From `ARCHITECTURE.md`:

- **`src/app/_facades/`**: "route facade helpers" - thin app-layer wrappers
- **`src/features/*/services/`**: feature business logic

From `_facades/AGENTS.md`:

> "Thin app-layer wrappers that resolve dependencies, bind request context, map DTOs, wrap telemetry, and normalize errors. **Facades never contain business logic.**"

### Established Pattern In Codebase

**App Facades** (`_facades/<feature>/<usecase>.server.ts`):

- `payments/credits.server.ts` → delegates to `features/payments/services/creditsSummary.ts`
- `payments/attempts.server.ts` → delegates to `features/payments/services/paymentService.ts`
- `ai/completion.server.ts` → should delegate to `features/ai/services/streaming.ts`

**Feature Services** (`features/<feature>/services/<domain>.ts`):

- `payments/services/paymentService.ts` - payment business logic
- `ai/services/completion.ts` - LLM execution with billing/telemetry
- `ai/services/streaming.ts` - **(proposed)** streaming orchestration

### Correct Naming

| Layer   | Pattern                                  | Role                                              |
| ------- | ---------------------------------------- | ------------------------------------------------- |
| App     | `_facades/<feature>/<usecase>.server.ts` | Auth, billing account, error mapping, DTO mapping |
| Feature | `services/<domain>.ts`                   | Business logic, orchestration, port calls         |

**Conclusion:** Keep `_facades/` naming. Rename `ai.facade.ts` to `services/streaming.ts` to match the established pattern.

---

## Proposed Architecture

### Call Graph

```
Route (route.ts)
    ↓ HTTP/protocol encoding
App Coordinator (_facades/ai/completion.server.ts)
    ↓ session → billing account, LlmCaller creation
Streaming Orchestrator (services/streaming.ts)  ← renamed from ai.facade.ts
    ↓ graph vs direct decision, UiEvent emission
Execution Service (services/completion.ts)
    ↓ credit check, billing, telemetry
LLM Port (llmService.completionStream)
```

### Layer Responsibilities

| Layer   | Component                | Owns                                                | Must Not Own                          |
| ------- | ------------------------ | --------------------------------------------------- | ------------------------------------- |
| Route   | `route.ts`               | Wire protocol (`assistant-stream`)                  | Auth, billing, business logic         |
| App     | `completion.server.ts`   | Session → billing account, LlmCaller, error mapping | Graph decision, UiEvents, LLM calls   |
| Feature | `services/streaming.ts`  | Graph vs direct, graphRunId, UiEvent emission       | Billing account lookup, wire encoding |
| Feature | `services/completion.ts` | Credit check, billing, telemetry, LLM call          | Session, wire encoding                |

### Anti-Pattern Tests (dep-cruiser)

```javascript
// These imports should FAIL:
"_facades/**" → "features/ai/services/completion.ts"  // Must go through streaming.ts
"features/ai/services/streaming.ts" → "adapters/**"   // No IO imports
"route.ts" → "features/ai/services/**"                // Must go through _facades
```

---

## File Changes

### Rename (Required)

| From                           | To                                      | Reason                                 |
| ------------------------------ | --------------------------------------- | -------------------------------------- |
| `src/features/ai/ai.facade.ts` | `src/features/ai/services/streaming.ts` | Matches `services/<domain>.ts` pattern |

### Modify (Required)

| File                                       | Change                                              |
| ------------------------------------------ | --------------------------------------------------- |
| `src/features/ai/public.ts`                | Update export path                                  |
| `src/app/_facades/ai/completion.server.ts` | Call `streamChat()` from `services/streaming.ts`    |
| `src/features/ai/services/streaming.ts`    | Delegate to `executeStream()` for billing/telemetry |

### Modify (Tests - Separate PR)

| File                                          | Change                                         |
| --------------------------------------------- | ---------------------------------------------- |
| `tests/stack/ai/chat-streaming.stack.test.ts` | Parse `assistant-stream` format instead of SSE |
| `tests/helpers/sse.ts`                        | Add `assistant-stream` parser                  |

---

## What `services/streaming.ts` Should Do

**Current `ai.facade.ts` (broken):**

- Calls `llmService.completionStream()` directly
- Missing: billing, telemetry, credit check
- Result: bypasses all business logic

**Proposed `services/streaming.ts` (correct):**

- Calls `executeStream()` from `services/completion.ts`
- Transforms `ChatDeltaEvent` → `UiEvent`
- P1: Adds graph vs direct decision, graphRunId generation
- Does NOT own billing/telemetry (delegated to execution service)

---

## Completion.ts Refactor (Optional)

The 800+ line `completion.ts` handles too many concerns. Recommended split:

| New File                          | Lines | Responsibility                      |
| --------------------------------- | ----- | ----------------------------------- |
| `services/message-preparation.ts` | ~50   | Validation, trimming, system prompt |
| `services/credit-check.ts`        | ~30   | Pre-flight cost estimation          |
| `services/billing.ts`             | ~100  | Post-call charge recording          |
| `services/telemetry.ts`           | ~150  | ai_invocation_summaries, Langfuse   |
| `services/completion.ts`          | ~150  | Thin orchestrator calling above     |

---

## Invariants (Must Preserve)

| Invariant                      | Location                | Cannot Change                  |
| ------------------------------ | ----------------------- | ------------------------------ |
| Pre-call credit check          | `prepareForExecution()` | Blocks on insufficient credits |
| Post-call billing non-blocking | `wrappedFinal`          | Never throws in prod           |
| promptHash pre-computed        | Before LLM call         | Available on error path        |
| request_id stable              | From `ctx.reqId`        | Not regenerated per LLM call   |
| invocation_id unique           | UUID per call           | Idempotency key for telemetry  |

---

## Related Documents

- [ARCHITECTURE.md](ARCHITECTURE.md) - Hexagonal layers, import rules
- [AI_SETUP_SPEC.md](AI_SETUP_SPEC.md) - P1 invariants and correlation IDs
- [LANGGRAPH_AI.md](LANGGRAPH_AI.md) - Graph architecture
- [\_facades/AGENTS.md](../src/app/_facades/AGENTS.md) - App facade pattern

---

**Last Updated:** 2025-12-19
