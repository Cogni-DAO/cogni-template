---
id: payments-design-spec
type: spec
title: "Payments: USDC with Backend Verification"
status: draft
spec_state: draft
trust: draft
summary: Production payment system — USDC on EVM chains, durable state machine, two-port architecture (PaymentAttemptRepository + OnChainVerifier), real EVM RPC verification via viem.
read_when: Working on payment flows, OnChainVerifier, credit settlement, or payment_attempts schema.
implements:
owner: derekg1729
created: 2026-02-07
verified:
tags: [billing, web3, payments]
---

# Payments: USDC with Backend Verification

## Context

Production payment system with durable state machine, two-port architecture (PaymentAttemptRepository + OnChainVerifier). Real EVM RPC verification implemented via viem.

**MVP Chain:** Ethereum Sepolia (11155111) — **Production Chain:** Base mainnet (8453)

**Chain Policy:** Sepolia is test-only for development and temporary test fixtures. Production deployments MUST use Base mainnet. The `RepoSpecChainName` enum supports both chains during the transition period; Sepolia support will be removed once the DAO is fully deployed on Base.

## Goal

Accept USDC payments with OnChainVerifier port abstraction and direct RPC verification via viem. Single chain, single token (USDC), single payment type (credit_topup). Flow: Client creates attempt → executes on-chain USDC transfer → submits txHash → backend calls OnChainVerifier → credits balance.

## Non-Goals

- Multi-chain support
- Refunds
- Partial fills
- Subscriptions
- Multiple token types

## Core Invariants

### Security Invariants

1. **SENDER_BINDING**: MUST capture `from_address` from SIWE session wallet at attempt creation (checksum via `getAddress()`)
2. **RECEIPT_VALIDATION**: MUST call OnChainVerifier port before crediting (real EVM RPC verification via viem)
3. **TOKEN_MATCH**: MUST match token_address to canonical USDC on configured chain
4. **AMOUNT_VERIFICATION**: MUST require `amount >= expected_usdc_amount` (enforced by OnChainVerifier)
5. **NO_CLIENT_TRUST**: MUST never trust client-supplied txHash for crediting - verification is backend-only

### Ownership Invariants

6. **BILLING_ACCOUNT_SCOPE**: MUST filter all queries by `billing_account_id === session.billing_account_id` (prevents privilege escalation)
7. **NOT_OWNED_404**: MUST return 404 if attempt not owned by session user

### Idempotency Invariants

8. **EXACTLY_ONCE_CREDIT**: MUST apply credits exactly-once per payment reference (DB constraint enforced)
9. **NO_DOUBLE_TXHASH**: MUST NOT allow same txHash to credit twice (partial unique index on attempts + unique constraint on ledger)
10. **ATOMIC_PENDING**: MUST keep attempt PENDING_UNVERIFIED until atomic credit transaction commits
11. **ATOMIC_SETTLEMENT**: Settlement MUST be atomic across: credit_ledger insert, billing_accounts update, payment_attempts CREDITED transition

### TTL Invariants

12. **INTENT_EXPIRY**: MUST enforce `expires_at` ONLY in `CREATED_INTENT` state (30 min TTL)
13. **CLEAR_EXPIRY_ON_SUBMIT**: MUST set `expires_at = NULL` on txHash submission
14. **PENDING_TIMEOUT**: MUST terminate stuck PENDING_UNVERIFIED attempts after 24 hours from submission (or N verification attempts) → transition to FAILED with error_code `RECEIPT_NOT_FOUND`

## Schema

### payment_attempts Table

**Location:** `src/shared/db/schema.billing.ts`

| Column                   | Type      | Constraints                     | Description                                            |
| ------------------------ | --------- | ------------------------------- | ------------------------------------------------------ |
| `id`                     | UUID      | PK, default gen_random_uuid()   | attemptId                                              |
| `billing_account_id`     | TEXT      | NOT NULL, FK → billing_accounts | owner                                                  |
| `from_address`           | TEXT      | NOT NULL                        | SIWE wallet checksummed via `getAddress()`             |
| `chain_id`               | INTEGER   |                                 | Ethereum Sepolia (11155111) or Base mainnet (8453)     |
| `tx_hash`                | TEXT      | nullable                        | bound on submit                                        |
| `token`                  | TEXT      |                                 | USDC token address                                     |
| `to_address`             | TEXT      |                                 | DAO receiving address                                  |
| `amount_raw`             | BIGINT    |                                 | USDC raw units (6 decimals)                            |
| `amount_usd_cents`       | INTEGER   |                                 | USD cents                                              |
| `status`                 | TEXT      |                                 | state enum                                             |
| `error_code`             | TEXT      | nullable                        | stable error enum                                      |
| `expires_at`             | TIMESTAMP | nullable                        | NULL after submit (only for CREATED_INTENT)            |
| `submitted_at`           | TIMESTAMP | nullable                        | set when txHash bound (for PENDING_UNVERIFIED timeout) |
| `last_verify_attempt_at` | TIMESTAMP | nullable                        | for GET throttle                                       |
| `verify_attempt_count`   | INTEGER   | NOT NULL, default 0             | incremented on each verification attempt               |
| `created_at`             | TIMESTAMP | NOT NULL, default now()         |                                                        |

**Indexes:**

- `payment_attempts_chain_tx_unique` — Partial unique: `(chain_id, tx_hash) WHERE tx_hash IS NOT NULL`
- `payment_attempts_billing_account_idx` — `(billing_account_id, created_at)` for user history
- `payment_attempts_status_idx` — `(status, created_at)` for polling

### payment_events Table

**Purpose:** Append-only audit log (critical for reconciliation + disputes)

| Column        | Type      | Constraints                     | Description                                                                  |
| ------------- | --------- | ------------------------------- | ---------------------------------------------------------------------------- |
| `id`          | UUID      | PK, default gen_random_uuid()   |                                                                              |
| `attempt_id`  | UUID      | NOT NULL, FK → payment_attempts |                                                                              |
| `event_type`  | TEXT      | NOT NULL                        | `INTENT_CREATED`, `TX_SUBMITTED`, `VERIFICATION_ATTEMPTED`, `STATUS_CHANGED` |
| `from_status` | TEXT      | nullable                        | Previous status (null for INTENT_CREATED)                                    |
| `to_status`   | TEXT      | NOT NULL                        | New status                                                                   |
| `error_code`  | TEXT      | nullable                        | PaymentErrorCode for failure events                                          |
| `metadata`    | JSONB     | nullable                        | txHash, blockNumber, validation details                                      |
| `created_at`  | TIMESTAMP | NOT NULL, default now()         |                                                                              |

**Index:** `payment_events_attempt_idx` — `(attempt_id, created_at)` for audit log queries

### credit_ledger Unique Constraint

```sql
CREATE UNIQUE INDEX credit_ledger_payment_ref_unique
ON credit_ledger(reference)
WHERE reason = 'widget_payment';
```

**Reference format:** `"${chainId}:${txHash}"` (e.g., `"11155111:0xabc123..."`)

### Exactly-Once Summary

**Three layers:**

1. **Partial unique index** on `payment_attempts(chain_id, tx_hash)` — prevents same txHash across attempts
2. **Unique constraint** on `credit_ledger(reference)` for payments — DB-level exactly-once with composite reference
3. **FOR UPDATE lock** in settlement transaction — prevents race conditions

## Design

### State Machine

**Canonical States:** `CREATED_INTENT` → `PENDING_UNVERIFIED` → `CREDITED` (+ terminal: `REJECTED`, `FAILED`)

**Client-Visible States:** `PENDING_VERIFICATION` | `CONFIRMED` | `FAILED` (maps from internal states)

**Allowed Transitions:**

```
CREATED_INTENT -> PENDING_UNVERIFIED (on submit)
CREATED_INTENT -> FAILED (on intent expiration)
PENDING_UNVERIFIED -> CREDITED (on successful verification)
PENDING_UNVERIFIED -> REJECTED (on validation failure)
PENDING_UNVERIFIED -> FAILED (on tx revert OR receipt not found after 24h)
```

**State Transition Ownership:** `confirmCreditsPayment()` MUST be the single owner of the CREDITED transition. Attempt MUST NOT become CREDITED unless ledger+balance update commits.

### API Contracts

#### POST /api/v1/payments/intents

**Purpose:** Create intent, return on-chain params

**Request:** `{ amountUsdCents: number }` — MUST reject if `< 100` or `> 1_000_000`

**Response:**

```json
{
  "attemptId": "uuid",
  "chainId": 11155111,
  "token": "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  "to": "0x070...",
  "amountRaw": "string",
  "amountUsdCents": 500,
  "expiresAt": "ISO8601"
}
```

**Backend:** Resolve `billing_account_id` from session, capture `from_address = getAddress(sessionWallet)`, calculate `amountRaw = BigInt(amountUsdCents) * 10_000n`, set `expires_at = now() + 30min`, get DAO wallet from `getWidgetConfig().receivingAddress`.

#### POST /api/v1/payments/attempts/:id/submit

**Purpose:** Submit txHash, verify, settle if valid

**Request:** `{ txHash: string }`

**Backend:** Enforce ownership, check expiration, bind txHash (idempotent), set `expires_at = NULL`, set `submitted_at = now()`, transition to PENDING_UNVERIFIED, attempt verification.

**Idempotency:** Same txHash + same attemptId → 200 existing status. Same txHash + different attemptId → 409 conflict.

#### GET /api/v1/payments/attempts/:id

**Purpose:** Poll status (with throttled verification)

**Backend:** Enforce ownership, check expiration (CREATED_INTENT only), check PENDING_UNVERIFIED timeout (24h), throttle verification (10s interval), return current status.

### OnChainVerifier Port

**Interface:** `verify(chainId, txHash, expectedTo, expectedToken, expectedAmount) → { status, actualFrom, actualTo, actualAmount, errorCode }`

**Status values:** `VERIFIED` | `PENDING` | `FAILED`

**Production (EvmRpcOnChainVerifierAdapter):** Direct RPC verification with canonical config validation:

1. **Validate caller params against canonical config:** chainId from `getPaymentConfig().chainId`, receivingAddress from `getPaymentConfig().receivingAddress`, tokenAddress from `USDC_TOKEN_ADDRESS`
2. **Query chain via EvmOnchainClient:** Fetch transaction and receipt, decode ERC20 Transfer log, compute confirmations. Return `PENDING` if confirmations < MIN_CONFIRMATIONS. Return `FAILED` with specific error code for: TX_NOT_FOUND, TX_REVERTED, TOKEN_TRANSFER_NOT_FOUND, SENDER_MISMATCH, RECIPIENT_MISMATCH, AMOUNT_MISMATCH
3. **Return VERIFIED:** All validations passed

**Atomic settlement:** Implemented exclusively inside `confirmCreditsPayment()` which performs ledger insert + balance update + attempt CREDITED transition in one DB transaction. Pass composite reference: `clientPaymentId = "${chainId}:${txHash}"` for chain-aware idempotency.

**DI Wiring:**

- `APP_ENV=test` → FakeOnChainVerifierAdapter (in-memory, no RPC)
- `APP_ENV=production|preview|dev` → EvmRpcOnChainVerifierAdapter with ViemEvmOnchainClient

**Invariants:**

- FakeOnChainVerifierAdapter NEVER used in production/preview/dev
- Production verification ONLY runs on chain + receiving address from `getWidgetConfig()`
- EvmRpcOnChainVerifierAdapter MUST use EvmOnchainClient (never call viem/RPC directly)
- Unit tests MUST use FakeEvmOnchainClient (no RPC calls in unit tests)
- Payment service NEVER grants credits unless `status === 'VERIFIED'`

### Key Decisions

#### 1. MVP Summary

Single chain (from repo-spec.yaml), single token (USDC), single payment type (credit_topup). Three invariants: sender binding, receipt validation, exactly-once credit.

#### 2. Endpoints

Three endpoints: POST intents, POST submit, GET status. Internal 5-state machine (CREATED_INTENT, PENDING_UNVERIFIED, CREDITED, REJECTED, FAILED) maps to 3 client-visible states.

#### 3. Error Codes

`TX_NOT_FOUND`, `TX_REVERTED`, `TOKEN_TRANSFER_NOT_FOUND`, `SENDER_MISMATCH`, `RECIPIENT_MISMATCH`, `AMOUNT_MISMATCH`, `INSUFFICIENT_CONFIRMATIONS`, `RECEIPT_NOT_FOUND`, `INTENT_EXPIRED`, `RPC_ERROR`

#### 4. Unit Conversions

- `amount_raw` = USDC raw units (6 decimals, 1 USDC = 1,000,000 raw)
- `amount_usd_cents` = USD cents (1 USD = 100 cents)
- `credits` = internal accounting (1 cent = 10 credits per `CREDITS_PER_CENT` constant)
- Conversion: 1 USDC = 100 cents = 1,000 credits

### File Pointers

| File                                                               | Purpose                                                                        |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `src/core/payments/model.ts`                                       | PaymentAttempt entity                                                          |
| `src/core/payments/rules.ts`                                       | State transition validation, constants                                         |
| `src/core/payments/errors.ts`                                      | Error types + error_code enum                                                  |
| `src/core/payments/util.ts`                                        | Conversion utilities                                                           |
| `src/ports/payment-attempt.port.ts`                                | PaymentAttemptRepository interface                                             |
| `src/ports/onchain-verifier.port.ts`                               | OnChainVerifier interface                                                      |
| `src/adapters/server/payments/drizzle-payment-attempt.adapter.ts`  | PaymentAttemptRepository                                                       |
| `src/adapters/server/payments/evm-rpc-onchain-verifier.adapter.ts` | OnChainVerifier — real EVM RPC via viem                                        |
| `src/adapters/test/payments/fake-onchain-verifier.adapter.ts`      | OnChainVerifier — deterministic fake                                           |
| `src/features/payments/services/paymentService.ts`                 | Payment service (createIntent, submitTxHash, getStatus)                        |
| `src/features/payments/services/creditsConfirm.ts`                 | `confirmCreditsPayment()` — atomic settlement                                  |
| `src/features/payments/hooks/usePaymentFlow.ts`                    | Frontend hook (intent → submit → poll)                                         |
| `src/components/kit/payments/UsdcPaymentFlow.tsx`                  | Presentational component (3 states)                                            |
| `src/contracts/payments.intent.v1.contract.ts`                     | Zod schema — create intent                                                     |
| `src/contracts/payments.submit.v1.contract.ts`                     | Zod schema — submit txHash                                                     |
| `src/contracts/payments.status.v1.contract.ts`                     | Zod schema — poll status                                                       |
| `src/app/api/v1/payments/intents/route.ts`                         | POST intents endpoint                                                          |
| `src/app/api/v1/payments/attempts/[id]/submit/route.ts`            | POST submit endpoint                                                           |
| `src/app/api/v1/payments/attempts/[id]/route.ts`                   | GET status endpoint                                                            |
| `src/shared/db/schema.billing.ts`                                  | payment_attempts + payment_events tables                                       |
| `src/shared/web3/chain.ts`                                         | Chain constants (CHAIN_ID, USDC_TOKEN_ADDRESS, MIN_CONFIRMATIONS)              |
| `src/shared/config/repoSpec.server.ts`                             | `getPaymentConfig()` from repo-spec.yaml                                       |
| `.cogni/repo-spec.yaml`                                            | Governance-managed config (chain_id, receiving_address, allowed_chains/tokens) |

## Acceptance Checks

**Automated (9 critical scenarios):**

- `pnpm test src/features/payments` — sender mismatch, wrong token/recipient/amount, missing receipt, PENDING timeout, insufficient confirmations, duplicate submit, same txHash different attempt, atomic settle, ownership

## Open Questions

(none)

## Related

- [Billing Evolution](./billing-evolution.md) — Credit accounting
- [On-Chain Readers](./onchain-readers.md) — On-chain data intelligence (treasury, ownership)
- [DAO Enforcement](./dao-enforcement.md) — DAO financial rails
- [Payments & Billing Initiative](../../work/initiatives/ini.payments-enhancements.md)
- [Payments Setup Guide](../guides/payments-setup.md)
