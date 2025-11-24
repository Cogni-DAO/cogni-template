# Payments Widget Decision: DePay vs Resmic

## Context

We need a browser-based crypto payment UI for **user → DAO** top-ups that:

- Works with our **hexagonal Next.js** app.
- Aligns with our long-term **Base + USDC** treasury story.
- Does **not** bloat the dependency tree or sneak in hidden SaaS dependencies.

We originally spiked **Resmic** based on a recommendation, then refactored to **DePay**.

---

## Why We Rejected Resmic

Resmic's React SDK pulled in an excessive runtime dependency set:

- Full multi-chain SDKs: `ethers`, `@solana/web3.js`, `@solana/spl-token`, `starknet`, `get-starknet`.
- Full UI framework + tooling: `antd`, `react-scripts`, `@testing-library/*`, `web-vitals`.
- Result: ~4,500 extra packages and a massive lockfile jump.

Architecturally:

- It behaves like a bundled **demo app** (UI + all chains + CRA) published as a dependency.
- It still only exposes a **frontend boolean** (`setPaymentStatus(true)`) with no signed server payload, tx hash, or webhook.
- Our backend trust boundary was effectively:
  "If the client calls `/payments/resmic/confirm`, we mint credits."

Conclusion: huge dependency cost, **no stronger backend guarantee** than any other widget.

---

## Why We Chose DePay

DePay widgets:

- Support **many chains** (including Base) and stablecoins like **USDC** via a focused internal stack.
- Rely on **`ethers` + small DePay libs** (`web3-payments`, `web3-wallets`, `web3-blockchains`) instead of every chain's full SDK.
- Are published as **lean, MIT-licensed widgets**, not a CRA app.

This matches our goals:

- Smaller, EVM-centric dependency footprint.
- Better alignment with **Base + USDC** for DAO treasury and OpenRouter billing.
- Cleaner fit into our hexagonal architecture (thin adapter, not a framework).

---

## How We Use DePay (MVP)

For MVP we use **DePay in OSS "widget-only" mode**:

- Frontend:
  - Render `DePayWidgets.Payment` with a single `accept` config (one chain + one stablecoin).
  - Once the widget reports a successful tx, we:
    - Compute `amountUsdCents` on the client.
    - Generate `clientPaymentId` (UUID).
    - Call our own `POST /api/v1/payments/credits/confirm`.

- Backend:
  - Require **SIWE session** (Auth.js) → resolve `billing_account_id` via `getOrCreateBillingAccountForUser`.
  - Check **idempotency** by `clientPaymentId` (`credit_ledger.reference`).
  - Compute credits (`1 cent = 10 credits`) and write:
    - A positive `credit_ledger` row (reason=`widget_payment`).
    - Updated `billing_accounts.balance_credits`.

DePay is **not** a provider-of-record in MVP:

- No DePay integration ID.
- No DePay API keys.
- No DePay tracking API or callbacks.
- All credit minting decisions happen in our backend.

---

## MVP Security Boundary

MVP security assumptions:

- **Client is a soft oracle.**
  - Any authenticated client can call `/payments/credits/confirm` with arbitrary `amountUsdCents`.
  - We rely on SIWE session + idempotency + rate limiting (future) to control abuse.
- DePay/Resmic choice does **not** change the backend guarantee:
  - Until we verify on-chain, all widgets are "user claims a payment happened."

We explicitly accept this as a **known weak point** for the initial loop.

---

## Future Hardening

We have two upgrade paths:

1. **On-chain watcher (preferred):**
   - Run a Ponder indexer watching the DAO wallet on Base.
   - Write `onchain_payments` rows for USDC inflows.
   - Reconcile `onchain_payments` vs `credit_ledger` (reason=`widget_payment`) and flag discrepancies.

2. **DePay tracking API (optional):**
   - Switch from widget-only to DePay's tracked payments:
     - Widget emits a trace/secret.
     - Backend forwards tx details to DePay's tracking API.
     - We only mint credits when DePay confirms the tx on-chain.
   - This introduces DePay as a true **payment provider**, with fees and API keys, in exchange for stronger guarantees.

Design principle:
**Start with DePay OSS widget-only for minimal friction; add Ponder and/or DePay tracking once we need hardened proof-of-payment.**

---

## Migration Notes

### What Changed from Resmic → DePay

**Frontend:**

- `import { CryptoPayment } from 'resmic'` → `import { DePayWidgets } from '@depay/widgets'`
- `setPaymentStatus(true)` callback → `succeeded: (transaction) => { ... }` callback
- API calls: `/api/v1/payments/resmic/confirm` → `/api/v1/payments/credits/confirm`

**Backend:**

- Routes: `/api/v1/payments/resmic/*` → `/api/v1/payments/credits/*`
- Contracts: `payments.resmic.*.v1.contract` → `payments.credits.*.v1.contract`
- Services: `resmicConfirm/Summary` → `creditsConfirm/Summary`
- Ledger reason: `'resmic_payment'` → `'widget_payment'`
- Metadata: now includes `provider: 'depay'` field

**No changes:**

- Security model (soft oracle + SIWE session)
- Credit math (1 cent = 10 credits)
- Idempotency (clientPaymentId in credit_ledger.reference)
- Billing layer integration (credit_ledger + billing_accounts)

### Why "Credits" Routes Not "DePay" Routes

We chose `/api/v1/payments/credits/*` over `/api/v1/payments/depay/*` because:

- **Provider-agnostic:** If we switch from DePay to another widget (or Stripe, or Ponder), routes stay the same.
- **Semantic clarity:** Routes describe _what_ they do (credit accounts) not _how_ (via DePay).
- **Less churn:** Future payment integrations (on-chain watchers, other widgets) can reuse the same endpoint.

The provider (`depay`) is recorded in `credit_ledger.metadata.provider`, not in route paths or ledger reason strings.

---

## Decision Record

**Date:** 2025-01
**Status:** Accepted
**Deciders:** Core team

**Decision:**
Use DePay widgets in OSS widget-only mode for MVP crypto payments.

**Consequences:**

- ✅ Cleaner dependency tree (~4,500 fewer packages vs Resmic)
- ✅ Better Base + USDC alignment
- ✅ Same security model as Resmic (no regression)
- ⚠️ Must add Ponder or DePay tracking API for production hardening
- ⚠️ Frontend still trusted for payment amounts (mitigated by SIWE + idempotency)

**Alternatives Considered:**

1. Keep Resmic → Rejected: excessive dependencies, no stronger guarantees
2. Build custom on-chain watcher first → Deferred: adds complexity before MVP validation
3. Use DePay managed mode → Deferred: 1.5% fees, not needed until production scale
