# Resmic Payments Integration (MVP)

Resmic is our **MVP crypto payment UI** for topping up internal credits. It sits in the **payments layer** and feeds the **billing layer** by creating `credit_ledger` entries, but does **not** replace or change the dual-cost billing system defined in:

- [ACCOUNTS_DESIGN.md](ACCOUNTS_DESIGN.md)
- [BILLING_EVOLUTION.md](BILLING_EVOLUTION.md)

Billing = how we track and charge for LLM usage (credits, provider_cost_credits, user_price_credits).
Payments = how users acquire credits (Resmic, on-chain watchers, etc).

---

## MVP Scope

**For MVP, only Sections 3 and 4 are required for the first working loop.**

- **Section 3:** Frontend Implementation (Resmic component + payment confirmation)
- **Section 4:** Backend Implementation (confirm endpoint + service logic)

**Sections 5–7** describe post-MVP hardening, security monitoring, and operational procedures. These are **not blocking** for initial Resmic integration but document future improvements.

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
  - **Note:** Component names come from the Resmic SDK and may change. This spec uses current naming as illustrative examples; always defer to official Resmic SDK documentation for exact component names and props.
- Props (EVM):
  - `Address` – our receiving wallet address (DAO / multisig)
  - `Chains` – allowed EVM chains
  - `Tokens` – allowed tokens (USDC, ETH, etc.)
  - `Amount` – **USD amount** to receive
  - `noOfBlockConformation` – how many blocks to wait
  - `setPaymentStatus` – **boolean-only** callback that fires in the browser when Resmic believes the payment is mined (no cryptographic proof, no server-side guarantee)

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
  - Adds `credit_ledger` rows with `reason = 'resmic_payment'`
  - Does **not** compute LLM costs; just funds balances

**Concretely:**

- Billing only cares: "`billing_accounts.balance_credits` increased by N with reason `'resmic_payment'`."
- Payments (Resmic) decides: "User has sent X USD worth of tokens to our address; we convert that to credits and call billing."

---

## 2.5 MVP Security Boundary

**For MVP, the ONLY trust boundary for credits is:**

1. **SIWE-authenticated session** (HttpOnly cookie, resolved by Auth.js)
2. **Resmic SDK running in an authenticated UI** (frontend-only payment widget)
3. **Our `POST /api/v1/payments/resmic/confirm` endpoint** — resolves `billing_account_id` from session, validates idempotency via `clientPaymentId`, writes `credit_ledger` + updates `billing_accounts.balance_credits`

**What is NOT in the MVP critical path:**

- ❌ On-chain verification (no tx hash passed to backend, no RPC calls to verify transfers)
- ❌ Resmic webhooks or signed callbacks (Resmic is frontend-only)
- ❌ Ponder on-chain watcher (introduced post-MVP for reconciliation; see `docs/PAYMENTS_PONDER_VERIFICATION.md`)

**Security posture:** We trust the SIWE session and treat Resmic as a soft oracle. Post-MVP hardening via Ponder is described in `docs/PAYMENTS_PONDER_VERIFICATION.md`.

---

## 3. Frontend Implementation (MVP Required)

### 3.1 Prerequisites

- [ ] User authentication via SIWE (Auth.js) working with sessions
- [ ] DAO receiving wallet address configured in environment variables

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
      - **Note:** `amountUsdCents` is our own internal billing convention for credit math, not a value provided by Resmic. The frontend computes this from Resmic's `Amount` prop before calling the confirm endpoint.
    - [ ] `clientPaymentId` (UUID for idempotency, REQUIRED)
    - [ ] Optional metadata: `chainId`, `tokenSymbol`, `timestamp`
  - [ ] Handle response:
    - [ ] Success (200): update UI with new balance, show success message
    - [ ] Error 401: redirect to login
    - [ ] Error 500: show retry option
  - [ ] Store `clientPaymentId` in localStorage to prevent double-submission

**Critical:** Do NOT send `billingAccountId` in request body. Backend resolves it from session only.

### 3.4 UI/UX Requirements

- [ ] "Buy Credits" button in header/sidebar when logged in
- [ ] Credit balance display (fetch from API, no client-side conversion needed)
- [ ] Payment amount selector (preset amounts: 10, 25, 50, 100 USD)
- [ ] Loading state during Resmic transaction
- [ ] Success confirmation with new balance
- [ ] Error messaging for failed payments

---

## 4. Backend Implementation (MVP Required)

### 4.1 API Endpoint

**Endpoint:** `POST /api/v1/payments/resmic/confirm`

**Auth:** SIWE session (HttpOnly cookie)

**Input (validated via Zod contract):**

- `amountUsdCents` (integer cents, REQUIRED, e.g., 1000 = $10.00)
- `clientPaymentId` (UUID, REQUIRED for idempotency)
- `metadata` (optional object: chain, token, timestamp)

**Behavior:**

1. Resolve `billing_account_id` from SIWE session (only source of truth)
2. Check idempotency: query `credit_ledger` for existing row with `reason = 'resmic_payment'` AND `reference = clientPaymentId`
   - If exists: return `{ billingAccountId, balanceCredits }` (no-op, idempotent)
   - If new: proceed to step 3
3. Compute credits using integer math:
   - With `1 credit = $0.001` and `1 cent = $0.01`, therefore `1 cent = 10 credits`
   - Formula: `credits = amountUsdCents * 10`
   - Alternative with CREDITS_PER_USDC: `credits = (amountUsdCents * CREDITS_PER_USDC) / 100` (integer division)
4. Insert `credit_ledger` row:
   - `billing_account_id` (from session)
   - `virtual_key_id` (default key for account)
   - `amount = credits` (BIGINT, positive value)
   - `reason = 'resmic_payment'`
   - `reference = clientPaymentId` (required for idempotency)
   - `metadata = serialized JSON` (amountUsdCents, chain, token, timestamp)
5. Update `billing_accounts.balance_credits += credits`
6. Return `{ billingAccountId, balanceCredits }`

**Implementation checklist:**

- [ ] Create route file: `src/app/api/v1/payments/resmic/confirm/route.ts`
- [ ] Add Zod contract: `src/contracts/payments.resmic.confirm.v1.contract.ts`
  - [ ] Request schema: `{ amountUsdCents: number, clientPaymentId: string, metadata?: object }`
  - [ ] Response schema: `{ billingAccountId: string, balanceCredits: number }`
  - [ ] Validate: `amountUsdCents` > 0, `clientPaymentId` is valid UUID
- [ ] Implement route handler:
  - [ ] Extract SIWE session from cookie
  - [ ] Validate session exists and is active
  - [ ] Parse and validate request body against contract
  - [ ] Resolve `billing_account_id` from session (never from body)
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
  - [ ] If exists: return existing balance (idempotent, no-op)
  - [ ] If new: proceed with credit
  - [ ] Compute credits: `amountUsdCents * 10` (integer math, 1 cent = 10 credits)
  - [ ] Resolve default `virtual_key_id` for billing account
  - [ ] Insert `credit_ledger` row:
    - [ ] `billing_account_id` from session (only source)
    - [ ] `virtual_key_id` (default key)
    - [ ] `amount` = computed credits (BIGINT)
    - [ ] `reason = 'resmic_payment'`
    - [ ] `reference` = `clientPaymentId` from request (required)
    - [ ] `metadata` = JSON with `{ amountUsdCents, chain, token, timestamp }`
  - [ ] Update `billing_accounts.balance_credits` atomically
  - [ ] Return new balance

**Files:**

- `src/features/payments/services/resmic-confirm.ts` - Service implementation
- `tests/unit/features/payments/services/resmic-confirm.test.ts` - Unit tests

### 4.3 Database Changes

- [ ] Verify `credit_ledger.reference` field exists (present in schema)
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

## 5. Post-MVP: Security & Monitoring

**Note:** This section describes future hardening. Not required for MVP.

### 5.1 Rate Limiting (Future)

- [ ] Implement rate limiting on `/payments/resmic/confirm`:
  - [ ] Max 10 payments per hour per account
  - [ ] Max $1000 USD equivalent per day per account
  - [ ] Return 429 on rate limit exceeded
- [ ] Add request logging for all payment attempts

### 5.2 Manual Reconciliation Process (Future)

- [ ] Create reconciliation script: `scripts/reconcile/resmic-payments.ts`
- [ ] Script functionality:
  - [ ] Query DAO wallet address for incoming USDC transfers (via Base RPC)
  - [ ] List all `credit_ledger` entries with `reason = 'resmic_payment'`
  - [ ] Compare on-chain totals vs credited totals
  - [ ] Flag discrepancies for manual review
  - [ ] Output CSV report with mismatches
- [ ] Add to ops runbook: `platform/runbooks/RESMIC_RECONCILIATION.md`

### 5.3 Monitoring & Alerts (Future)

- [ ] Add monitoring for:
  - [ ] Payment confirmation success rate
  - [ ] Total credits purchased per day
  - [ ] Failed payment attempts (401, 500 errors)
- [ ] Alert conditions:
  - [ ] More than 5 failed payments in 10 minutes
  - [ ] Daily credit total exceeds expected threshold

---

## 6. Post-MVP: Testing Requirements

**Note:** MVP should have basic stack tests. Comprehensive testing is post-MVP.

### 6.1 Unit Tests (MVP: Basic Coverage)

- [ ] Payment service idempotency (duplicate `clientPaymentId` handling - must return same balance)
- [ ] Credit calculation accuracy: `amountUsdCents * 10 = credits`
- [ ] Error handling for invalid session, missing fields

### 6.2 Integration Tests (Post-MVP: Full Coverage)

- [ ] Full flow with real database:
  - [ ] Create session, call confirm, verify ledger entry
  - [ ] Test idempotency: call confirm twice with same `clientPaymentId`, verify balance only credited once
  - [ ] Verify balance updates atomically
- [ ] Rate limiting enforcement

### 6.3 Stack Tests (MVP: Basic E2E)

- [ ] End-to-end API test hitting `/payments/resmic/confirm`
- [ ] Test with valid SIWE session (billing account resolved from session)
- [ ] Test unauthorized (no session) → expect 401
- [ ] Test duplicate `clientPaymentId` → expect 200 OK with existing balance

### 6.4 Manual Testing Checklist (MVP)

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

---

## 7. Post-MVP: Future Hardening

**Note:** These improvements are not part of the initial shipping loop.

### 7.1 Current Limitations (Accepted for MVP)

**No cryptographic proof:**

- ❌ Resmic does not pass transaction hash to backend
- ❌ Cannot verify on-chain transaction in confirm endpoint
- ❌ Must trust frontend `setPaymentStatus(true)` signal

**Client can lie:**

- ❌ Malicious client could call `/confirm` without Resmic payment
- ⚠️ Mitigated by: SIWE auth, rate limiting (post-MVP), manual reconciliation

**No automatic reconciliation:**

- ❌ No on-chain watcher comparing DAO wallet balance to ledger
- ⚠️ Mitigated by: manual reconciliation script (post-MVP)

### 7.2 Future Improvements

- [ ] Add on-chain watcher service (Ponder):
  - [ ] Run Ponder indexer as separate service watching Base/Base Sepolia
  - [ ] Index USDC Transfer events into DAO wallet → `onchain_payments` table
  - [ ] Periodic reconciliation job compares `onchain_payments` vs `credit_ledger` (reason='resmic_payment')
  - [ ] Auto-flag discrepancies for manual review
  - [ ] **Full spec:** See `docs/PAYMENTS_PONDER_VERIFICATION.md` for runtime topology, indexing config, and integration phases
- [ ] Implement tx hash capture:
  - [ ] Fork Resmic or use ethers.js to capture tx hash client-side
  - [ ] Pass tx hash to confirm endpoint
  - [ ] Verify tx on-chain before crediting
- [ ] Add webhook integration:
  - [ ] If Resmic adds server-side webhooks, switch to webhook model
  - [ ] Implement signature verification
  - [ ] Remove client-initiated confirm pattern

---

## 8. Integration with MVP Loop

### 8.1 Complete MVP Flow

**Status:** Sections 3-4 implement the payment integration. Sections 5-7 are future work.

Full loop with MVP pieces:

1. **Auth:** ✅ User connects wallet and logs in via SIWE → session cookie → `billing_account_id`
2. **Payments (this doc - Sections 3-4):** User uses Resmic "Buy Credits":
   - [ ] DAO multisig address receives crypto
   - [ ] Resmic sets `paymentStatus = true`
   - [ ] Frontend calls `/api/v1/payments/resmic/confirm` with `amountUsdCents` + `clientPaymentId`
   - [ ] Backend credits `billing_accounts.balance_credits` via `credit_ledger` insert
3. **Billing (Stage 6.5):** LLM usage with dual-cost accounting:
   - [ ] User calls `/api/v1/ai/completion`
   - [ ] LLM call via LiteLLM returns `response_cost_usd`
   - [ ] We convert to `provider_cost_credits`, compute `user_price_credits`
   - [ ] Enforce `user_price ≥ provider_cost`, and debit
   - [ ] `llm_usage` + `credit_ledger` record the full cost trail

### 8.2 Success Criteria (MVP)

- [ ] User can purchase credits via Resmic UI on testnet
- [ ] Credits appear in `credit_ledger` with `reason = 'resmic_payment'`
- [ ] Balance increases correctly in `billing_accounts`
- [ ] Duplicate payments prevented via `clientPaymentId` idempotency
- [ ] Integer credit math: 1 cent = 10 credits, verifiable in ledger

---

## Key Design Decisions

**Credit Math (Integer Only):**

- 1 credit = $0.001
- 1 USDC = 1,000 credits
- 1 cent = 10 credits
- Formula: `credits = amountUsdCents * 10`

**Session-Based Security:**

- `billing_account_id` resolved from SIWE session only
- No `billingAccountId` in request body
- Prevents privilege escalation attacks

**Idempotency:**

- `clientPaymentId` is REQUIRED UUID
- Stored in `credit_ledger.reference`
- Query before insert prevents double-credits

**MVP vs Post-MVP:**

- Sections 3-4: Required for first working loop
- Sections 5-7: Future hardening, not blocking

Resmic is one concrete, OSS way to complete "credits UP" for the MVP — but it remains cleanly separated from the internal billing logic and can be replaced or supplemented later (direct on-chain watchers, other payment providers, etc.).
