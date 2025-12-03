# payments · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-12-02
- **Status:** draft

## Purpose

Feature layer for USDC payment attempts with backend verification. Handles payment intent creation, transaction submission, verification polling, atomic settlement, and legacy widget payments.

## Pointers

- [Root AGENTS.md](../../../AGENTS.md)
- [Payments Design](../../../docs/PAYMENTS_DESIGN.md)
- [DAO Enforcement](../../../docs/DAO_ENFORCEMENT.md)
- [Billing Evolution](../../../docs/BILLING_EVOLUTION.md)

## Boundaries

```json
{
  "layer": "features",
  "may_import": ["core", "ports", "shared", "types", "components", "contracts"],
  "must_not_import": ["app", "adapters", "bootstrap", "mcp"]
}
```

## Public Surface

- **Exports (services/):**
  - `createIntent(repository, clock, input)` - Create payment intent with on-chain transfer params
  - `submitTxHash(repository, accountService, verifier, clock, log, input)` - Submit txHash for verification
  - `getStatus(repository, accountService, verifier, clock, log, input)` - Poll status with throttled verification
  - `confirmCreditsPayment(accountService, input)` - Atomic credit settlement; idempotent on clientPaymentId
  - `getCreditsSummary(accountService, input)` - Fetch balance and recent ledger entries
- **Exports (hooks/):**
  - `usePaymentFlow(options)` - React hook orchestrating USDC payment flow with wagmi + backend; uses attemptId guard to cancel stale async on reset; returns PaymentFlowState
  - `useCreditsSummary(options)` - React Query hook for fetching credits balance and ledger entries
- **Exports (api/):**
  - `paymentsClient` - Typed HTTP client for payment endpoints (discriminated union returns)
  - `creditsSummaryClient` - Typed HTTP client for credits summary endpoint (discriminated union returns)
- **Exports (utils/):**
  - `mapBackendStatus(status, errorCode)` - Maps backend status to UI phase/result
  - `formatPaymentError(error)` - Maps technical errors to user-friendly messages
- **Exports (public.ts):**
  - Types: `PaymentsFeatureError`
  - Guards: `isPaymentsFeatureError`, `mapPaymentPortErrorToFeature`
- **Routes:** none (used by app layer routes)
- **CLI:** none
- **Env/Config keys:** none
- **Files considered API:** services/_, hooks/_, api/\*, utils/mapBackendStatus.ts, errors.ts, public.ts

## Ports

- **Uses ports:** `PaymentAttemptRepository`, `OnChainVerifier`, `AccountService`, `Clock`
- **Implements ports:** none

## Responsibilities

- This directory **does**: orchestrate payment attempt lifecycle; validate state machine transitions via core/rules; enforce TTLs (30min intent, 24h verification timeout); delegate settlement to confirmCreditsPayment; compute credits from USD cents (1 cent = 10 credits); validate idempotency; aggregate balance/ledger data
- This directory **does not**: handle HTTP/session auth; access database directly; log payment events (repository owns); perform direct on-chain RPC calls; manage widget UI

## Usage

```typescript
import { confirmCreditsPayment } from "@/features/payments/services/creditsConfirm";
import { getCreditsSummary } from "@/features/payments/services/creditsSummary";

// Called by app facades with resolved billing account
const result = await confirmCreditsPayment(accountService, {
  billingAccountId: "...",
  defaultVirtualKeyId: "...",
  amountUsdCents: 1000,
  clientPaymentId: "uuid",
  metadata: { provider: "depay", txHash: "..." },
});
```

## Standards

- Payment services accept ports as first parameters (repository, accountService, verifier, clock)
- State machine transitions validated via `core/rules.isValidTransition()`
- Settlement exclusively via `confirmCreditsPayment()` for atomic ledger+balance updates
- Credit conversion: 1 cent = 10 credits (integer math only)
- Idempotency required for all payment mutations
- Composite reference for payment attempts: `${chainId}:${txHash}`
- Repository logs all events atomically with status changes
- Services return structured results (not port types directly)

## Dependencies

- **Internal:** @/core/payments, @/ports, @/shared/web3, @/shared/config
- **External:** none

## Change Protocol

- Update when adding endpoints, changing state machine, or modifying error types
- Bump **Last reviewed** date
- Ensure tests cover 9 MVP scenarios (see PAYMENTS_DESIGN.md)

## Notes

- OnChainVerifier stubbed (always VERIFIED) for MVP; Phase 3 uses Ponder indexer
- Verification throttled to 10-second intervals to reduce RPC cost
- Payment attempts remain PENDING_UNVERIFIED until confirmCreditsPayment succeeds
- Exactly-once credit enforced via DB unique constraint on credit_ledger.reference
- Metadata stored as JSONB for extensibility (txHash, blockchain, token)
- Billing account resolution happens at app layer, not here
