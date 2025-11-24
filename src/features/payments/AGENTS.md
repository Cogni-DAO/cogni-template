# payments · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-24
- **Status:** draft

## Purpose

Feature layer for crypto widget payments. Handles payment confirmation with idempotency and balance/ledger queries for credits page.

## Pointers

- [Root AGENTS.md](../../../AGENTS.md)
- [DePay Payments](../../../docs/DEPAY_PAYMENTS.md)
- [DAO Enforcement](../../../docs/DAO_ENFORCEMENT.md)
- [Billing Evolution](../../../docs/BILLING_EVOLUTION.md)

## Boundaries

```json
{
  "layer": "features",
  "may_import": ["core", "ports", "shared", "types"],
  "must_not_import": ["app", "adapters", "bootstrap", "contracts", "mcp"]
}
```

## Public Surface

- **Exports:**
  - `confirmCreditsPayment(accountService, input)` - Confirm widget payments; idempotent on clientPaymentId
  - `getCreditsSummary(accountService, input)` - Fetch balance and recent ledger entries
  - Types: `CreditsConfirmInput`, `CreditsConfirmResult`, `CreditsSummaryInput`, `CreditsSummaryResult`
- **Routes (if any):** none (used by app layer routes)
- **CLI (if any):** none
- **Env/Config keys:** none
- **Files considered API:** services/creditsConfirm.ts, services/creditsSummary.ts

## Ports (optional)

- **Uses ports:** `AccountService` (creditAccount, findCreditLedgerEntryByReference, listCreditLedgerEntries, getBalance)
- **Implements ports:** none
- **Contracts:** none

## Responsibilities

- This directory **does**: orchestrate payment confirmation logic; compute credits from USD cents (1 cent = 10 credits); validate idempotency via clientPaymentId; aggregate balance and ledger data
- This directory **does not**: handle HTTP/session auth; access database directly; perform on-chain verification; manage DePay widget UI

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

- All services accept AccountService port as first parameter
- Credit conversion: 1 cent = 10 credits (integer math only)
- Idempotency required for all payment mutations
- Services return structured results (not port types directly)

## Dependencies

- **Internal:** @/ports (AccountService), @/shared (constants)
- **External:** none

## Change Protocol

- Update this file when adding new payment services or changing public APIs
- Bump **Last reviewed** date
- Ensure unit tests exist for all exported services
- Update contracts if service signatures change

## Notes

- MVP trust model: frontend-only widget callbacks (soft oracle)
- No on-chain verification in critical path; Ponder reconciliation is post-MVP
- Metadata stored as JSONB for extensibility (txHash, blockchain, token)
- Billing account resolution happens at app layer, not here
