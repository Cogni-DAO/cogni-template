# Error Handling Architecture

This codebase uses a **layered error translation pattern** that maintains clean boundaries while preserving type safety and structured error information across all layers.

## Error Types by Layer

**Domain Errors (`core/*/errors.ts`)**

- Business rule violations: `UnknownApiKeyError`, `InsufficientCreditsError`, `AccountNotFoundError`
- Rich contextual data: account IDs, required amounts, previous balances, etc.
- **Used by**: Core domain logic, feature services (via `core/*/public.ts`)
- **Never used by**: App layer, adapters

**Port Errors (`ports/*`)**

- Errors defined at the port boundary: `InsufficientCreditsPortError`, `AccountNotFoundPortError`
- Structured data emitted by adapters and consumed by features
- **Used by**: Adapters (thrown), feature services (caught and translated)
- **Not thrown by**: Core domain (core does not talk directly to infra in this architecture)

**Feature Errors (`features/*/errors.ts`)**

- Cross-boundary contracts: e.g. `AccountsFeatureError` with a `kind` discriminator
- Stable error algebra: `{ kind: "UNKNOWN_API_KEY" }`, `{ kind: "INSUFFICIENT_CREDITS"; accountId; required; available }`
- **Used by**: Feature services (returned), app layer (for HTTP mapping)
- **Never used by**: Adapters, ports

## Error Flow Pattern

```txt
Adapter → Port Error → Feature Service → Feature Error → App Route → HTTP Response
```

**Example:**

1. **Adapter**: `throw new InsufficientCreditsPortError(accountId, cost, balance)`
2. **Feature**: catches port error → returns `{ ok: false, error: { kind: "INSUFFICIENT_CREDITS", accountId, required: cost, available: balance } }`
3. **App Route**: matches `error.kind === "INSUFFICIENT_CREDITS"` → returns `NextResponse.json({ error: "Insufficient credits" }, { status: 402 })`

## Implementation Guidelines

**Adapters (`src/adapters/**/\*.adapter.ts`)\*\*

```typescript
import { InsufficientCreditsPortError } from "@/ports/accounts.port";

// ✅ Throw structured port errors
throw new InsufficientCreditsPortError(accountId, cost, balance);

// ❌ Never throw domain errors
// throw new InsufficientCreditsError(accountId, cost, balance);

// ❌ Avoid generic errors for domain-relevant conditions
// throw new Error("Insufficient credits");
```

**Feature Services (`src/features/*/services/*.ts`)**

```typescript
import { isInsufficientCreditsPortError } from "@/ports/accounts.port";
import type { AccountsFeatureError } from "@/features/accounts/errors";

try {
  await accountPort.debitCredits(params);
} catch (error) {
  // Translate port errors to feature errors
  if (isInsufficientCreditsPortError(error)) {
    return {
      ok: false,
      error: {
        kind: "INSUFFICIENT_CREDITS",
        accountId: error.accountId,
        required: error.cost,
        available: error.previousBalance,
      } satisfies AccountsFeatureError,
    };
  }

  throw error; // let unexpected errors bubble
}
```

**App Routes (`src/app/api/**/route.ts`)\*\*

```typescript
import type { AccountsFeatureError } from "@/features/accounts/errors";

try {
  const result = await featureService.operation(params);

  if (!result.ok) {
    const error = result.error as AccountsFeatureError;

    if (error.kind === "UNKNOWN_API_KEY") {
      return NextResponse.json({ error: "Invalid API key" }, { status: 403 });
    }

    if (error.kind === "INSUFFICIENT_CREDITS") {
      return NextResponse.json(
        { error: "Insufficient credits" },
        { status: 402 }
      );
    }
  }

  // handle success...
} catch (error) {
  // generic fallback error handling
}
```

## Benefits

- **Type Safety**: Structured errors with rich context at every layer
- **Boundary Respect**: Each layer only imports error types from allowed dependencies
- **Maintainability**: Error details and domain internals can change without breaking app routes
- **Debugging**: Full error context preserved from adapter to HTTP response
- **Testing**: Easy to mock and assert specific error conditions at each layer

## AI Execution Errors

AI/LLM errors follow a specialized pattern with **single-point normalization** to stable error codes.

**Error Types (all in `@cogni/ai-core`):**

- `LlmError` — Thrown by adapters; captures `kind` (timeout, rate_limited, provider_4xx, etc.) and optional HTTP `status`
- `AiExecutionError` — Carries structured `code` field through call chains (thrown by CompletionUnitLLM)
- `AiExecutionErrorCode` — Stable contract: `invalid_request`, `not_found`, `timeout`, `aborted`, `rate_limit`, `internal`, `insufficient_credits`

**Error Flow:**

1. Adapter throws `LlmError` with kind + status at HTTP/SSE boundary
2. `CompletionUnitLLM` catches, throws `AiExecutionError` with structured code
3. Graph runner catches, calls `normalizeErrorToExecutionCode()` for any error type
4. `completion.ts` catches connection-time errors, normalizes via same function
5. Returns `{ ok: false, error: AiExecutionErrorCode }` to all consumers
6. Metrics, logs, and responses consume the pre-normalized code

**Invariants:**

- **ERROR_NORMALIZATION_ONCE:** `normalizeErrorToExecutionCode()` is the single source of truth
- **NO_RAW_THROW_PAST_COMPLETION:** `completion.ts` catches all errors, normalizes, returns structured result
- **METRICS_NO_HEURISTICS:** Metrics receive pre-normalized codes, never introspect error objects

**Normalization Priority:** AbortError → AiExecutionError.code → LlmError (status 429/408 → kind fallback) → "internal"

**Structured Boundary Logging:** Adapters emit `adapter.litellm.http_error` / `adapter.litellm.sse_error` with `{statusCode, kind, requestId, traceId, model}`. Raw provider messages stay in Langfuse only.

**Import Paths:**

| Consumer | Import From                                                                        |
| -------- | ---------------------------------------------------------------------------------- |
| Packages | `@cogni/ai-core` — canonical source for all error types and normalization          |
| Features | `@cogni/ai-core` — `normalizeErrorToExecutionCode`, `isLlmError`, `LlmError`       |
| Adapters | `@/ports` — re-exports from `@cogni/ai-core` (arch constraint: adapters use ports) |
| Metrics  | Receives `AiExecutionErrorCode` directly (no error introspection)                  |

---

## Notes

- Core should not depend on port errors — core domain logic remains infrastructure-agnostic
- Ports + port errors are used exclusively between adapters and features
- Feature error algebras provide stable contracts that isolate app routes from domain changes
- AI errors use `AiExecutionErrorCode` as the stable contract across the system
