# Repository State Summary

**Branch:** `feat/resmic` (ahead of `origin/staging`)
**Assessment Date:** 2025-11-24
**Core Mission:** Crypto-metered AI infrastructure where users pay DAO wallet → get credits → consume LLM → billing tracked in ledger

**Related Documentation:**

- [Accounts Design](./ACCOUNTS_DESIGN.md) - Identity & billing model
- [Security & Auth Spec](./SECURITY_AUTH_SPEC.md) - SIWE authentication architecture
- [DePay Payments](./DEPAY_PAYMENTS.md) - Payment widget integration
- [Billing Evolution](./BILLING_EVOLUTION.md) - Dual-cost accounting (Stage 6.5)
- [Payments Ponder Verification](./PAYMENTS_PONDER_VERIFICATION.md) - On-chain watcher spec
- [DAO Enforcement](./DAO_ENFORCEMENT.md) - Binding enforcement rules
- [Wallet & Credits Integration](./INTEGRATION_WALLETS_CREDITS.md) - Wallet integration flow
- [API Key Endpoints](./ACCOUNTS_API_KEY_ENDPOINTS.md) - LiteLLM virtual key management

---

## ✅ What's COMPLETE (Code Exists & Working)

### 1. Authentication Infrastructure ✅

**Auth.js + SIWE:** Full wallet-first authentication with session management

- **Files:**
  - [`src/auth.ts`](../src/auth.ts) - Credentials provider with SIWE verification
  - [`src/shared/auth/`](../src/shared/auth/) - Session types and wallet-session consistency helpers
  - [`src/app/(app)/layout.tsx`](<../src/app/(app)/layout.tsx>) - Protected route guard
  - [`src/components/kit/auth/WalletConnectButton.tsx`](../src/components/kit/auth/WalletConnectButton.tsx) - Wallet connection UI
- **Status:** Auth.js manages identity; SIWE proves wallet ownership; sessions resolve to billing accounts
- **Reference:** [Security & Auth Spec](./SECURITY_AUTH_SPEC.md)

### 2. Wallet Integration ✅

**wagmi + RainbowKit:** Client-side wallet connection

- **Files:**
  - [`src/app/providers/`](../src/app/providers/) - Provider composition (Auth → Query → Wallet)
  - [`src/shared/web3/chain.ts`](../src/shared/web3/chain.ts) - Hardcoded Base mainnet (8453), validation enforced
  - [`scripts/validate-chain-config.ts`](../scripts/validate-chain-config.ts) - Build-time validator matching repo-spec
- **Status:** Chain locked to Base mainnet; wallet connects in browser; RainbowKit themed
- **Reference:** [Wallet & Credits Integration](./INTEGRATION_WALLETS_CREDITS.md)

### 3. DePay Payment Widget (Frontend) ✅

**OSS Mode (0% fees, no DePay backend):** Frontend-only payment UI

- **Files:**
  - [`src/components/vendor/depay/DePayWidget.client.tsx`](../src/components/vendor/depay/DePayWidget.client.tsx) - CDN-based widget wrapper
  - [`src/app/(app)/credits/page.tsx`](<../src/app/(app)/credits/page.tsx>) - Credits page with purchase flow
- **Implementation:**
  - Amount selection ($0.10, $10, $25, $50, $100)
  - DePay widget fires `succeeded` callback client-side
  - Generates `clientPaymentId` from txHash (UUID fallback)
  - Calls `POST /api/v1/payments/credits/confirm` with metadata
- **Status:** Widget loads, renders, handles callbacks; idempotency keys generated
- **Reference:** [DePay Payments](./DEPAY_PAYMENTS.md) - Sections 3-4

### 4. Payment Confirmation Backend ✅

**Endpoints:** Session-authenticated credit top-up

- **Routes:**
  - `POST /api/v1/payments/credits/confirm` - Credits billing account after widget success
  - `GET /api/v1/payments/credits/summary` - Fetches balance + recent ledger entries
- **Implementation:**
  - Resolves `billing_account_id` from SIWE session (never from request body)
  - Idempotent via `clientPaymentId` lookup in `credit_ledger.reference`
  - Conversion: `credits = amountUsdCents * 10` (1 cent = 10 credits)
  - Inserts `credit_ledger` row with `reason='widget_payment'`
  - Updates `billing_accounts.balance_credits`
- **Files:**
  - [`src/features/payments/services/creditsConfirm.ts`](../src/features/payments/services/creditsConfirm.ts) - Service logic
  - [`src/app/_facades/payments/credits.server.ts`](../src/app/_facades/payments/credits.server.ts) - App-layer wiring
  - [`src/app/api/v1/payments/credits/confirm/route.ts`](../src/app/api/v1/payments/credits/confirm/route.ts) - Confirm endpoint
  - [`src/app/api/v1/payments/credits/summary/route.ts`](../src/app/api/v1/payments/credits/summary/route.ts) - Summary endpoint
  - [`tests/stack/payments/credits-confirm.stack.test.ts`](../tests/stack/payments/credits-confirm.stack.test.ts) - Stack tests
- **Status:** Backend logic complete; idempotency working; balance updates atomically
- **Reference:** [DePay Payments](./DEPAY_PAYMENTS.md) - Section 4

### 5. Database Schema (Billing Layer) ✅

**Tables:**

- `users` (Auth.js identity) - `wallet_address` indexed
- `billing_accounts` - `balance_credits` (BIGINT), `owner_user_id` FK
- `virtual_keys` - `litellm_virtual_key`, `is_default`, `active`
- `credit_ledger` - append-only audit log (`amount`, `balance_after`, `reason`, `reference`, `metadata` JSONB)
- **Migration:** [`0001_resmic_reference_index.sql`](../src/adapters/server/db/migrations/0001_resmic_reference_index.sql) - Index on `(reference, reason)` for idempotency

**Status:** Schema migrated; BIGINT credits in place; ledger supports widget payments

**Reference:** [Accounts Design](./ACCOUNTS_DESIGN.md) - Database Schema section

### 6. Billing Integration (Partial) ⚠️

**Working:**

- [`src/lib/auth/mapping.ts`](../src/lib/auth/mapping.ts) - `getOrCreateBillingAccountForUser()` provisions accounts + default virtual keys
- [`src/adapters/server/accounts/drizzle.adapter.ts`](../src/adapters/server/accounts/drizzle.adapter.ts) - AccountService implementation
- [`src/app/api/v1/ai/completion/route.ts`](../src/app/api/v1/ai/completion/route.ts) - Uses session auth + resolves virtual keys
- Credits deducted from balance on LLM calls

**NOT Working:**

- ❌ Dual-cost accounting (Stage 6.5) - `provider_cost_credits` vs `user_price_credits`
- ❌ `llm_usage` table doesn't exist yet
- ❌ LiteLLM response cost not being extracted
- ❌ Markup factor not applied

**Reference:** [Billing Evolution](./BILLING_EVOLUTION.md) - Stage 6.5 (not implemented)

---

## ⚠️ What's PARTIALLY COMPLETE (Code Exists, Needs Work)

### 7. Credits Page UI ⚠️

**Working:**

- ✅ Balance display
- ✅ "Buy Credits" button with amount selection
- ✅ DePay widget integration
- ✅ Payment confirmation flow
- ✅ Loading/error states

**Missing:**

- ❌ Recent transactions table shows mock data (needs live `credit_ledger` query)
- ❌ No link to full usage history
- ❌ "Crypto-only" messaging implied but not explicit

**Status:** 80% complete; needs live data hookup

**Reference:** [DePay Payments](./DEPAY_PAYMENTS.md) - Section 3.6

### 8. Documentation ⚠️

**Working:**

- ✅ All file TSDoc headers complete (202 files pass validation)
- ✅ AGENTS.md files exist for all new modules (web3, payments)
- ✅ Updated `providers/AGENTS.md` for Base mainnet
- ✅ Comprehensive docs ([DEPAY_PAYMENTS.md](./DEPAY_PAYMENTS.md), [ACCOUNTS_DESIGN.md](./ACCOUNTS_DESIGN.md), [BILLING_EVOLUTION.md](./BILLING_EVOLUTION.md))

**Missing:**

- ❌ Stage 6.5 implementation not documented (because not implemented)

**Status:** Docs are thorough but reflect incomplete billing layer

---

## ❌ What's NOT STARTED

### 9. Stage 6.5: Dual-Cost Accounting ❌

**From [BILLING_EVOLUTION.md](./BILLING_EVOLUTION.md) - ALL UNCHECKED:**

- [ ] 6.5.1 - Migrate to integer credits (schema done, migration not run)
- [ ] 6.5.2 - Add `llm_usage` table (not created)
- [ ] 6.5.3 - Environment config (`USER_PRICE_MARKUP_FACTOR`, `CREDITS_PER_USDC`)
- [ ] 6.5.4 - Pricing helpers (`usdToCredits`, `calculateUserPriceCredits`)
- [ ] 6.5.5 - Atomic billing operation (`recordLlmUsage` port method)
- [ ] 6.5.6 - Wire dual-cost into completion flow
- [ ] 6.5.7 - Documentation updates

**Impact:** LLM calls currently deduct credits but don't track provider cost vs user price; no profit margin enforcement.

### 10. RainbowKit → Auth.js Integration ❌

**From [ACCOUNTS_DESIGN.md](./ACCOUNTS_DESIGN.md) Phase 1-2:**

- [ ] Wire RainbowKit to Auth.js `signIn()` (wallet connects but doesn't trigger SIWE auth automatically)

**Impact:** User must manually trigger sign-in after wallet connection.

### 11. Route Protection & Cleanup ❌

**From [ACCOUNTS_DESIGN.md](./ACCOUNTS_DESIGN.md) Phase 4-5:**

- [ ] Add middleware for route protection (currently using layout guards only)
- [ ] Remove any localStorage apiKey code (may still exist)
- [ ] Update all tests for new schema (only payment tests updated)

### 12. Post-MVP Hardening ❌

**All deferred (Sections 5-7 in [DEPAY_PAYMENTS.md](./DEPAY_PAYMENTS.md)):**

- [ ] Rate limiting on `/payments/confirm`
- [ ] Manual reconciliation script
- [ ] Monitoring & alerts
- [ ] DePay Tracking API integration (1.5% fees)
- [ ] Ponder on-chain watcher (0% fees, full spec in [PAYMENTS_PONDER_VERIFICATION.md](./PAYMENTS_PONDER_VERIFICATION.md))

---

## 🔍 Current Trust Model (MVP)

**Security Boundary:**

1. ✅ SIWE-authenticated session (HttpOnly cookie)
2. ✅ DePay widget running in authenticated UI
3. ✅ Backend resolves `billing_account_id` from session only
4. ⚠️ **Soft oracle:** Trust widget `succeeded` callback (no on-chain verification in critical path)

**Known Limitations:**

- ❌ No cryptographic proof of payment in backend
- ❌ No tx hash verification server-side
- ❌ Client could fabricate confirm calls (mitigated by session auth only)
- ❌ No automatic reconciliation with on-chain data

**Post-MVP Hardening Options:**

- **DePay Tracking API:** 1.5% fees, server-side validation
- **Ponder Watcher:** 0% fees, self-hosted on-chain indexer (full spec in [PAYMENTS_PONDER_VERIFICATION.md](./PAYMENTS_PONDER_VERIFICATION.md))

**Reference:** [DePay Payments](./DEPAY_PAYMENTS.md) - Section 1.5 (Security Model)

---

## 📊 Success Criteria Status

**From [DEPAY_PAYMENTS.md](./DEPAY_PAYMENTS.md) Section 8.2:**

| Criterion                                                        | Status                            |
| ---------------------------------------------------------------- | --------------------------------- |
| User can purchase credits via DePay widget                       | ⚠️ **Code ready, not E2E tested** |
| Credits appear in `credit_ledger` with `reason='widget_payment'` | ✅ **Backend logic complete**     |
| Balance increases in `billing_accounts`                          | ✅ **Atomic update working**      |
| Duplicate payments prevented via `clientPaymentId`               | ✅ **Idempotency implemented**    |
| Integer credit math: 1 cent = 10 credits                         | ✅ **Formula correct**            |

**Overall MVP Completion:** ~75% (core loop exists, needs E2E validation + billing layer finishing)

---

## 🚀 Next Steps to Complete MVP

### Immediate (Required for First User Flow)

#### 1. Wire Credits Page to Live Data

- [ ] Replace mock transactions with `GET /api/v1/payments/credits/summary` call
- [ ] Invalidate React Query cache after payment confirm
- [ ] Add link to full usage page (or remove if not MVP)

#### 2. E2E Testing

- [ ] Test full flow: wallet connect → DePay widget → payment → balance update
- [ ] Test idempotency: duplicate `clientPaymentId` returns same balance
- [ ] Test unauthorized access: no session → 401

#### 3. RainbowKit Auth Integration

- [ ] Wire `onConnect` to trigger Auth.js `signIn()` with SIWE

### Short-Term (Needed for Profit Tracking)

#### 4. Stage 6.5 - Dual-Cost Accounting

- [ ] Create `llm_usage` table migration
- [ ] Add `USER_PRICE_MARKUP_FACTOR` (default 2.0)
- [ ] Implement `recordLlmUsage()` port method
- [ ] Extract LiteLLM response cost in adapter
- [ ] Apply markup in completion service
- [ ] Test profit invariant: `user_price ≥ provider_cost`

**Reference:** [Billing Evolution](./BILLING_EVOLUTION.md) - Stage 6.5 complete spec

### Medium-Term (Operational Readiness)

#### 5. Route Protection & Cleanup

- [ ] Add route protection middleware
- [ ] Remove localStorage API key code
- [ ] Update remaining tests

#### 6. Monitoring & Reconciliation

- [ ] Add payment monitoring dashboard
- [ ] Create reconciliation script
- [ ] Set up alerts

**Reference:** [DePay Payments](./DEPAY_PAYMENTS.md) - Sections 5-7

---

## 💰 Current Economics

**Credit Unit Standard:**

- 1 credit = $0.001 USD
- 1 USDC = 1,000 credits
- 1 cent = 10 credits

**Payment Flow (Working):**

- User pays via DePay widget → DAO wallet receives crypto → frontend calls confirm → backend credits account

**LLM Billing (Incomplete):**

- ❌ Provider cost not tracked
- ❌ User price not separated
- ❌ No profit margin enforcement
- ⚠️ Simple debit happens, but no cost breakdown

**Conversion Working:**

- ✅ `amountUsdCents * 10 = credits` (integer math)
- ✅ BIGINT storage (no floating point)
- ✅ Ledger audit trail

**Reference:** [Billing Evolution](./BILLING_EVOLUTION.md) - Credit Unit Standard

---

## 🎯 Summary: Where We Are Today

### ✅ Working

- Auth.js + SIWE wallet authentication ([SECURITY_AUTH_SPEC.md](./SECURITY_AUTH_SPEC.md))
- DePay widget integration (frontend) ([DEPAY_PAYMENTS.md](./DEPAY_PAYMENTS.md))
- Payment confirmation backend with idempotency
- Credits ledger and balance updates
- Database schema (`billing_accounts`, `virtual_keys`, `credit_ledger`) ([ACCOUNTS_DESIGN.md](./ACCOUNTS_DESIGN.md))
- Chain configuration locked to Base mainnet
- Build-time validation

### ⚠️ Partially Working

- Credits page UI (needs live data)
- LLM billing (debits work, no cost breakdown)
- RainbowKit (connects, no auto-signin)

### ❌ Not Started

- Dual-cost accounting (Stage 6.5) ([BILLING_EVOLUTION.md](./BILLING_EVOLUTION.md))
- Route protection middleware
- Post-MVP hardening (rate limits, reconciliation, Ponder)

### Overall Assessment

**Payment intake loop:** ~80% complete
**Billing cost tracking loop (Stage 6.5):** 0% complete

The system can accept crypto payments and deduct credits for LLM usage, but it cannot yet enforce profit margins or track provider vs user costs.

**To Ship MVP:** Need ~1-2 more work sessions to wire live data, test E2E, and implement Stage 6.5 (dual-cost accounting).
