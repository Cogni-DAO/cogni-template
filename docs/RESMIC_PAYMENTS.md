# Resmic Payments Integration (PAYMENTS_RESMIC.md)

Resmic is our **MVP crypto payment UI** for topping up internal credits. It sits in the **payments layer** and feeds the **billing layer** by creating `credit_ledger` entries, but does **not** replace or change the dual-cost billing system defined in:

- [ACCOUNTS_DESIGN.md](ACCOUNTS_DESIGN.md)
- [BILLING_EVOLUTION.md](BILLING_EVOLUTION.md)

Billing = how we track and charge for LLM usage (credits, provider_cost_credits, user_price_credits).
Payments = how users acquire credits (Resmic, on-chain watchers, etc).

This document defines **how we use Resmic**, what it can and cannot do, and how it connects to `billing_accounts` and `credit_ledger`.

---

## 1. What Resmic Actually Provides

Resmic is a **frontend-only React SDK** that renders a crypto payment button and handles:

- Wallet connection for multiple chains
- Token selection and on-chain transfer
- Conversion from a **USD Amount** to specific token + chain
- Detection that a payment has been mined after N confirmations
- A single callback: `setPaymentStatus(boolean)` once Resmic decides the payment is complete

**Key facts:**

- Components:
  - `CryptoPayment` (newer consolidated component)
  - `EVMConnect` / `StarkNetConnect` (older per-chain components)
- Props (EVM):
  - `Address` – our receiving wallet address (DAO / multisig)
  - `Chains` – allowed EVM chains
  - `Tokens` – allowed tokens (USDC, ETH, etc.)
  - `Amount` – **USD amount** to receive
  - `noOfBlockConformation` – how many blocks to wait
  - `setPaymentStatus` – **boolean-only** callback for "payment done"

**Critically:**

- Resmic does **not** expose:
  - Transaction hash
  - On-chain amount actually sent
  - A server-side webhook or signature
- All "success" information is **frontend only** (`setPaymentStatus(true)`)

**Implication:** Resmic is a UI convenience, not a Stripe-like billing backend. We must assume:

> "If Resmic says `true`, a payment was made to our address on a supported chain/token."

For MVP, we will accept this trust assumption and treat Resmic as a **soft oracle** for incoming payments.

**Reference:** [Resmic SDK Documentation](https://docs.resmic.com/)

---

## 2. Separation of Concerns: Billing vs Payments

We keep a **hard separation**:

- **Billing layer** (already spec'd in `BILLING_EVOLUTION.md`):
  - Tables: `billing_accounts`, `credit_ledger`, `llm_usage`
  - Invariants:
    - Credits in **BIGINT** (`1 credit = $0.001`)
    - `user_price_credits ≥ provider_cost_credits` per LLM call
    - All debits/credits recorded in `credit_ledger`
- **Payments layer** (this doc):
  - Integrates **Resmic** as one source of "credits UP"
  - Adds `credit_ledger` rows with `reason = 'resmic_payment'` (or equivalent)
  - Does **not** compute LLM costs; just funds balances

**Concretely:**

- Billing only cares: "`billing_accounts.balance_credits` increased by N with reason `'resmic_payment'`."
- Payments (Resmic) decides: "User has sent X USD worth of tokens to our address; we convert that to credits and call billing."

---

## 3. Frontend Implementation

### 3.1 Prerequisites

- [ ] User authentication via SIWE (Auth.js) working with sessions
- [ ] Frontend can access `billing_account_id` from session/context
- [ ] DAO receiving wallet address configured in environment variables
- [ ] `CREDITS_PER_USDC` constant available to frontend (via API or config)

### 3.2 Resmic Component Integration

- [ ] Install Resmic SDK: `npm install @resmic/react-sdk`
- [ ] Create `BuyCreditsModal` or `PaymentWidget` component
- [ ] Implement Resmic component with props:
  - [ ] `Address` = DAO's receiving EVM address (from env)
  - [ ] `Chains` = `[Chains.Base, Chains.BaseSepolia]` for testnet/mainnet
  - [ ] `Tokens` = `[Tokens.USDC]` (or allowed set)
  - [ ] `Amount` = user-selected USD amount (10, 25, 50, 100)
  - [ ] `noOfBlockConformation` = 3-5 blocks
  - [ ] `setPaymentStatus` = React state setter
- [ ] Add loading/pending UI while `paymentStatus === false`

### 3.3 Payment Confirmation Flow

- [ ] Create `/api/v1/payments/resmic/confirm` client helper
- [ ] On `paymentStatus === true`:
  - [ ] Generate unique client-side `clientPaymentId` (UUID)
  - [ ] Call backend endpoint with payload:
    - [ ] `amountUsdCents` (Resmic `Amount` × 100, e.g., $10 → 1000 cents)
    - [ ] `clientPaymentId` (UUID for idempotency)
    - [ ] Optional: `billingAccountId` (for validation only), `chainId`, `tokenSymbol`, `timestamp`
  - [ ] Handle response:
    - [ ] Success: update UI with new balance, show success message
    - [ ] Error 409 (duplicate): treat as success, refresh balance
    - [ ] Error 401/403: redirect to login
    - [ ] Error 500: show retry option
  - [ ] Store `clientPaymentId` in localStorage to prevent double-submission
  - [ ] Do NOT send `billingAccountId` in body (let backend extract from session), or send only for validation

### 3.4 UI/UX Requirements

- [ ] "Buy Credits" button in header/sidebar when logged in
- [ ] Credit balance display showing current `balance_credits / 1000` USDC
- [ ] Payment amount selector (preset amounts: 10, 25, 50, 100 USD)
- [ ] Loading state during Resmic transaction
- [ ] Success confirmation with new balance
- [ ] Error messaging for failed payments
- [ ] Transaction history link (future: shows `credit_ledger` entries)

---

## 4. Backend Implementation

### 4.1 API Endpoint

**Endpoint:** `POST /api/v1/payments/resmic/confirm`

**Auth:** SIWE session (HttpOnly cookie)

**Input (validated via Zod contract):**

- `amountUsdCents` (integer number of US cents, e.g., 1000 = $10.00)
- `clientPaymentId` (UUID from frontend, required for idempotency)
- `metadata` (optional: chain, token, timestamp)
- `billingAccountId` (optional, only for validation - never used as source of truth)

**Behavior:**

1. Resolve `billing_account_id` from SIWE session (only source of truth)
2. If `billingAccountId` present in body: validate it equals session account, reject with 403 if mismatch
3. Check idempotency: query `credit_ledger` for existing row with `reason = 'resmic_payment'` AND `reference = clientPaymentId`
   - If exists: return `{ billingAccountId, balanceCredits }` (no-op, existing balance)
   - If new: proceed to step 4
4. Compute `credits = (amountUsdCents / 100) * CREDITS_PER_USDC` (convert cents → dollars → credits)
5. Insert `credit_ledger` row:
   - `billing_account_id` (from session)
   - `amount = credits` (BIGINT)
   - `reason = 'resmic_payment'`
   - `reference = clientPaymentId` (required for idempotency)
   - `metadata = serialized JSON` (amountUsdCents, chain, token, timestamp)
6. Update `billing_accounts.balance_credits += credits`
7. Return `{ billingAccountId, balanceCredits }`

**Implementation checklist:**

- [ ] Create route file: `src/app/api/v1/payments/resmic/confirm/route.ts`
- [ ] Add Zod contract: `src/contracts/payments.resmic.confirm.v1.contract.ts`
  - [ ] Request schema: `{ amountUsdCents: number, clientPaymentId: string, billingAccountId?: string, metadata?: object }`
  - [ ] Response schema: `{ billingAccountId, balanceCredits }`
  - [ ] Note: amountUsdCents is integer cents (1000 = $10.00), not dollars
- [ ] Implement route handler:
  - [ ] Extract SIWE session from cookie
  - [ ] Validate session exists and is active
  - [ ] Parse and validate request body against contract
  - [ ] Resolve `billing_account_id` from session (only source of truth)
  - [ ] If body includes `billingAccountId`: validate matches session, return 403 if mismatch
  - [ ] Call payment service with session-derived `billingAccountId` and validated data
  - [ ] Return response with new balance

**Files:**

- `src/app/api/v1/payments/resmic/confirm/route.ts` - Route handler
- `src/contracts/payments.resmic.confirm.v1.contract.ts` - Contract definition
- `tests/stack/api/payments/resmic.stack.test.ts` - End-to-end tests

### 4.2 Service Layer

- [ ] Create payment service: `src/features/payments/services/resmic-confirm.ts`
- [ ] Implement confirmation logic:
  - [ ] Check for existing `credit_ledger` entry: `reason = 'resmic_payment' AND reference = clientPaymentId`
  - [ ] If exists: return existing balance (no-op, idempotent)
  - [ ] If new: proceed with credit
  - [ ] Convert `(amountUsdCents / 100) * CREDITS_PER_USDC` → credits (BIGINT)
  - [ ] Insert `credit_ledger` row:
    - [ ] `billing_account_id` from session (only source)
    - [ ] `amount` = computed credits
    - [ ] `reason = 'resmic_payment'`
    - [ ] `reference` = `clientPaymentId` from request (required)
    - [ ] `metadata` = JSON with `{ amountUsdCents, chain, token, timestamp }`
  - [ ] Update `billing_accounts.balance_credits` atomically
  - [ ] Return new balance

**Files:**

- `src/features/payments/services/resmic-confirm.ts` - Service implementation
- `tests/unit/features/payments/services/resmic-confirm.test.ts` - Unit tests

### 4.3 Database Changes

- [ ] Ensure `credit_ledger.reference` field exists (should be present from billing schema)
- [ ] Add index on `credit_ledger.reference` for idempotency lookups
- [ ] Verify `credit_ledger.metadata` JSONB column can store payment metadata

### 4.4 Environment Configuration

- [ ] Add to `.env.example`:
  - [ ] `DAO_WALLET_ADDRESS_BASE` - DAO multisig address on Base mainnet
  - [ ] `DAO_WALLET_ADDRESS_BASE_SEPOLIA` - DAO address on Base Sepolia testnet
  - [ ] `RESMIC_ENABLED` - Feature flag (default: true)
- [ ] Add to `src/shared/env/server.ts`:
  - [ ] Validate DAO addresses as EVM addresses
  - [ ] Validate RESMIC_ENABLED boolean
- [ ] Add to `src/shared/env/client.ts`:
  - [ ] `NEXT_PUBLIC_DAO_WALLET_ADDRESS` - Public DAO address
  - [ ] `NEXT_PUBLIC_RESMIC_ENABLED` - Feature flag for frontend

---

## 5. Security & Monitoring

### 5.1 Security Mitigations (MVP)

- [ ] Implement rate limiting on `/payments/resmic/confirm`:
  - [ ] Max 10 credits per hour per account
  - [ ] Max 5 payment confirmations per hour per account
  - [ ] Return 429 on rate limit exceeded
- [ ] Add request logging:
  - [ ] Log all payment confirmation attempts with session ID
  - [ ] Log payment amounts, timestamps, and results
  - [ ] Include metadata for manual reconciliation
- [ ] Idempotency enforcement:
  - [ ] Query `credit_ledger` for existing row: `reason = 'resmic_payment' AND reference = clientPaymentId`
  - [ ] If found: return current balance without inserting (200 OK, no-op)
  - [ ] If not found: insert new ledger entry and update balance
  - [ ] No 409 needed - idempotent endpoints return success on duplicate

### 5.2 Manual Reconciliation Process

- [ ] Create reconciliation script: `scripts/reconcile/resmic-payments.ts`
- [ ] Script functionality:
  - [ ] Query DAO wallet address for incoming USDC transfers (via Base RPC)
  - [ ] List all `credit_ledger` entries with `reason = 'resmic_payment'`
  - [ ] Compare on-chain totals vs credited totals
  - [ ] Flag discrepancies for manual review
  - [ ] Output CSV report with mismatches
- [ ] Add to ops runbook: `platform/runbooks/RESMIC_RECONCILIATION.md`

### 5.3 Monitoring & Alerts

- [ ] Add monitoring for:
  - [ ] Payment confirmation success rate
  - [ ] Average time from UI click to backend confirm
  - [ ] Total credits purchased per day
  - [ ] Failed payment attempts (401, 403, 500 errors)
- [ ] Alert conditions:
  - [ ] More than 5 failed payments in 10 minutes
  - [ ] Daily credit total exceeds expected threshold
  - [ ] On-chain balance discrepancy > 10%

---

## 6. Testing Requirements

### 6.1 Unit Tests

- [ ] Payment service idempotency (duplicate `clientPaymentId` handling - must return same balance)
- [ ] Credit calculation accuracy (cents → USD → credits conversion: `(cents / 100) * CREDITS_PER_USDC`)
- [ ] Metadata serialization/deserialization
- [ ] Error handling for invalid session, missing fields

### 6.2 Integration Tests

- [ ] Full flow with real database:
  - [ ] Create session, call confirm, verify ledger entry
  - [ ] Test idempotency: call confirm twice with same `clientPaymentId`, verify balance only credited once
  - [ ] Verify balance updates atomically
  - [ ] Test body `billingAccountId` validation: send mismatched ID, expect 403
- [ ] Rate limiting enforcement

### 6.3 Stack Tests

- [ ] End-to-end API test hitting `/payments/resmic/confirm`
- [ ] Test with valid SIWE session (billing account resolved from session)
- [ ] Test unauthorized (no session) → expect 401
- [ ] Test body `billingAccountId` mismatch vs session → expect 403
- [ ] Test duplicate `clientPaymentId` → expect 200 OK with existing balance

### 6.4 Manual Testing Checklist

- [ ] Frontend integration:
  - [ ] Install Resmic component in dev environment
  - [ ] Connect wallet, trigger payment on testnet (Base Sepolia)
  - [ ] Verify Resmic `setPaymentStatus(true)` fires
  - [ ] Confirm backend endpoint called with correct payload
  - [ ] Check balance updated in UI
- [ ] Idempotency:
  - [ ] Call confirm endpoint twice with same `clientPaymentId`
  - [ ] Verify second call returns 200 OK with same balance (no-op)
  - [ ] Verify ledger only has one entry for that `clientPaymentId`
- [ ] Rate limiting:
  - [ ] Trigger multiple payments rapidly
  - [ ] Verify rate limit kicks in after threshold

---

## 7. Known Limitations & Future Work

### 7.1 Current Limitations

**No cryptographic proof:**

- ❌ Resmic does not pass transaction hash to backend
- ❌ Cannot verify on-chain transaction in confirm endpoint
- ❌ Must trust frontend `setPaymentStatus(true)` signal

**Client can lie:**

- ❌ Malicious client could call `/confirm` without Resmic payment
- ⚠️ Mitigated by: SIWE auth, rate limiting, manual reconciliation

**No automatic reconciliation:**

- ❌ No on-chain watcher comparing DAO wallet balance to ledger
- ⚠️ Mitigated by: manual reconciliation script (ops process)

### 7.2 Future Hardening (Post-MVP)

- [ ] Add on-chain watcher service:
  - [ ] Monitor DAO address for USDC/ETH transfers
  - [ ] Match tx amounts to `credit_ledger` entries by timestamp
  - [ ] Auto-flag suspicious credits with no matching tx
  - [ ] Document in `docs/ONCHAIN_WATCHER.md`
- [ ] Implement tx hash capture:
  - [ ] Fork Resmic or use ethers.js to capture tx hash client-side
  - [ ] Pass tx hash to confirm endpoint
  - [ ] Verify tx on-chain before crediting
- [ ] Add webhook integration:
  - [ ] If Resmic adds server-side webhooks, switch to webhook model
  - [ ] Implement signature verification
  - [ ] Remove client-initiated confirm pattern
- [ ] Multi-signature protection:
  - [ ] Require 2-of-3 DAO approval for large credit purchases (>$100)
  - [ ] Implement approval queue for high-value payments

---

## 8. Integration with MVP Loop

### 8.1 Complete MVP Flow

**Status: ⏸️ Pending Stage 7 Implementation**

Full loop with all current pieces:

1. **Auth:** ✅ User connects wallet and logs in via SIWE → session cookie → `billing_account_id`
2. **Payments (this doc):** ⏸️ User uses Resmic "Buy Credits":
   - [ ] DAO multisig address receives crypto
   - [ ] Resmic sets `paymentStatus = true`
   - [ ] Frontend calls `/api/v1/payments/resmic/confirm`
   - [ ] Backend credits `billing_accounts.balance_credits`
3. **Billing (Stage 6.5):** ⏸️ LLM usage with dual-cost accounting:
   - [ ] User calls `/api/v1/ai/completion`
   - [ ] LLM call via LiteLLM returns `response_cost_usd`
   - [ ] We convert to `provider_cost_credits`, compute `user_price_credits`
   - [ ] Enforce `user_price ≥ provider_cost`, and debit
   - [ ] `llm_usage` + `credit_ledger` record the full cost trail

### 8.2 Success Criteria

- [ ] User can purchase credits via Resmic UI on testnet
- [ ] Credits appear in `credit_ledger` with `reason = 'resmic_payment'`
- [ ] Balance increases correctly in `billing_accounts`
- [ ] Duplicate payments prevented via idempotency
- [ ] Rate limiting prevents abuse
- [ ] Manual reconciliation script detects on-chain vs ledger discrepancies

---

Resmic is one concrete, OSS way to complete "credits UP" for the MVP — but it remains cleanly separated from the internal billing logic and can be replaced or supplemented later (direct on-chain watchers, other payment providers, etc.).
