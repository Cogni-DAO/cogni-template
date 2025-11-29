# core · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-29
- **Status:** draft

## Purpose

Pure domain logic with entities, rules, and business invariants. No I/O, time, or RNG dependencies. Includes account models, credit pricing calculations, chat message validation, and payment attempt state machine for USDC credit top-ups.

## Pointers

- [Root AGENTS.md](../../AGENTS.md)
- [Architecture](../../docs/ARCHITECTURE.md)
- [Billing Evolution](../../docs/BILLING_EVOLUTION.md)

## Boundaries

```json
{
  "layer": "core",
  "may_import": ["core"],
  "must_not_import": [
    "app",
    "features",
    "ports",
    "adapters/server",
    "adapters/worker",
    "shared"
  ]
}
```

## Public Surface

- **Exports:**
  - Account entities (Account, BillingAccount)
  - Payment entities (PaymentAttempt, PaymentAttemptStatus, ClientVisibleStatus, PaymentErrorCode)
  - Business rules (credit pricing, message validation, payment state transitions, amount bounds, TTLs)
  - Domain errors (InsufficientCreditsError, PaymentIntentExpiredError, PaymentVerificationError, etc.)
  - Utilities (USDC conversion, message builders, payment state checkers)
- **Routes:** none
- **CLI:** none
- **Env/Config keys:** none
- **Files considered API:** public.ts, payments/public.ts, billing/public.ts, chat/public.ts, accounts/public.ts

## Ports (optional)

- **Uses ports:** none
- **Implements ports:** none
- **Contracts (required if implementing):** none

## Responsibilities

- This directory **does**: Define domain entities (Account, Message, PaymentAttempt), business rules (credit sufficiency, message trimming, payment state machine), validation logic (message length, role normalization, amount bounds, TTL checks), pricing calculations (USD to credits with markup, USDC conversions)
- This directory **does not**: Perform I/O, access external services, handle UI concerns, read env vars, persist data

## Usage

Minimal local commands:

```bash
pnpm test tests/unit/core/
pnpm typecheck
```

## Standards

- Pure functions only
- Unit tests required for all business rules

## Dependencies

- **Internal:** core/ only
- **External:** None (pure domain logic)

## Change Protocol

- Update this file when **Exports**, **Routes**, or **Env/Config** change
- Bump **Last reviewed** date
- Update ESLint boundary rules if **Boundaries** changed
- Ensure boundary lint + (if Ports) **contract tests** pass

## Notes

- Inject Clock/Rng via ports for deterministic testing
- Pricing helpers use BigInt for credit amounts to prevent rounding errors
- All credit calculations round up (Math.ceil) to ensure minimum 1 credit for non-zero costs
- Payment state machine: CREATED_INTENT → PENDING_UNVERIFIED → CREDITED | REJECTED | FAILED
- USDC conversions use 6 decimals (1 USDC = 1,000,000 raw units, 1 cent = 10,000 raw units)
- Payment constants: MIN_PAYMENT_CENTS (100), MAX_PAYMENT_CENTS (1,000,000), PAYMENT_INTENT_TTL_MS (30min), PENDING_UNVERIFIED_TTL_MS (24h)
