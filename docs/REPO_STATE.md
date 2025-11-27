# Repository State Summary

**Branch:** `staging` (includes feat/billing)
**Assessment Date:** 2025-11-28
**Core Mission:** Crypto-metered AI infrastructure where users pay DAO wallet → get credits → consume LLM → billing tracked with dual-cost accounting

**Related Documentation:**

- [Accounts Design](./ACCOUNTS_DESIGN.md) - Identity & billing model
- [Security & Auth Spec](./SECURITY_AUTH_SPEC.md) - SIWE authentication architecture
- [DePay Payments](./DEPAY_PAYMENTS.md) - Payment widget integration
- [Billing Evolution](./BILLING_EVOLUTION.md) - Dual-cost accounting implementation
- [Payments Ponder Verification](./PAYMENTS_PONDER_VERIFICATION.md) - **Required for production security**
- [DAO Enforcement](./DAO_ENFORCEMENT.md) - Binding enforcement rules
- [Wallet & Credits Integration](./INTEGRATION_WALLETS_CREDITS.md) - Wallet integration flow
- [API Key Endpoints](./ACCOUNTS_API_KEY_ENDPOINTS.md) - LiteLLM virtual key management

---

## ✅ What's COMPLETE (Code Exists & Working)

### 1. Authentication Infrastructure ✅

**Auth.js + SIWE:** Full wallet-first authentication with session management

- **Files:**
  - [`src/auth.ts`](../src/auth.ts) - Credentials provider with SIWE verification
  - [`src/shared/auth/`](../src/shared/auth/) - Session types and wallet-session helpers
  - [`src/app/(app)/layout.tsx`](<../src/app/(app)/layout.tsx>) - Protected route guard
  - [`src/components/kit/auth/`](../src/components/kit/auth/) - Wallet connection UI
- **Status:** Auth.js manages identity; SIWE proves wallet ownership; sessions resolve to billing accounts
- **Reference:** [SECURITY_AUTH_SPEC.md](./SECURITY_AUTH_SPEC.md)

### 2. Wallet Integration ✅

**wagmi + RainbowKit:** Client-side wallet connection

- **Files:**
  - [`src/app/providers/`](../src/app/providers/) - Provider composition (Auth → Query → Wallet)
  - [`src/shared/web3/chain.ts`](../src/shared/web3/chain.ts) - Hardcoded Base mainnet (8453), validation enforced
  - [`scripts/validate-chain-config.ts`](../scripts/validate-chain-config.ts) - Build-time validator
- **Status:** Chain locked to Base mainnet; wallet connects in browser; RainbowKit themed
- **Reference:** [INTEGRATION_WALLETS_CREDITS.md](./INTEGRATION_WALLETS_CREDITS.md)

### 3. DePay Payment Widget ✅

**OSS Mode (0% fees):** Frontend-only payment UI

- **Files:**
  - [`src/components/vendor/depay/`](../src/components/vendor/depay/) - CDN-based widget wrapper
  - [`src/app/(app)/credits/page.tsx`](<../src/app/(app)/credits/page.tsx>) - Credits page with purchase flow
- **Implementation:**
  - Amount selection ($0.10, $10, $25, $50, $100)
  - DePay widget fires `succeeded` callback client-side
  - Generates `clientPaymentId` from txHash (UUID fallback)
  - Calls `POST /api/v1/payments/credits/confirm` with metadata
- **Status:** Widget operational; idempotency keys generated; callback wired
- **Security Note:** ⚠️ **MVP trust model: client-side callback only. See [Post-MVP Security Hardening](#post-mvp-security-hardening) for production requirements.**
- **Reference:** [DEPAY_PAYMENTS.md](./DEPAY_PAYMENTS.md)

### 4. Payment Confirmation Backend ✅

**Session-Authenticated Credit Top-Up:**

- **Routes:**
  - `POST /api/v1/payments/credits/confirm` - Credits billing account after widget success
  - `GET /api/v1/payments/credits/summary` - Fetches balance + recent ledger entries
- **Implementation:**
  - Resolves `billing_account_id` from SIWE session (never from request body)
  - Idempotent via `clientPaymentId` lookup in `credit_ledger.reference`
  - Conversion: `credits = amountUsdCents * 10` (1 cent = 10 credits)
  - Inserts `credit_ledger` row with `reason='widget_payment'`
  - Updates `billing_accounts.balance_credits` atomically
- **Files:**
  - [`src/features/payments/services/`](../src/features/payments/services/) - Service logic
  - [`src/app/api/v1/payments/credits/`](../src/app/api/v1/payments/credits/) - HTTP routes
  - [`tests/stack/payments/`](../tests/stack/payments/) - Stack tests
- **Status:** Idempotency working; balance updates atomically
- **Reference:** [DEPAY_PAYMENTS.md](./DEPAY_PAYMENTS.md) - Section 4

### 5. Database Schema (Billing Layer) ✅

**Tables:**

- `users` (Auth.js identity) - `wallet_address` indexed
- `billing_accounts` - `balance_credits` (BIGINT), `owner_user_id` FK
- `virtual_keys` - `litellm_virtual_key`, `is_default`, `active`
- `credit_ledger` - Append-only audit log (`amount`, `balance_after`, `reason`, `reference`, `metadata` JSONB)
- `llm_usage` - Per-call tracking with nullable cost fields and `billing_status` discrimination

**Migrations:**

- [`0001_slippery_madelyne_pryor.sql`](../src/adapters/server/db/migrations/0001_slippery_madelyne_pryor.sql) - Initial schema
- [`0002_bizarre_celestials.sql`](../src/adapters/server/db/migrations/0002_bizarre_celestials.sql) - Nullable costs + billing_status

**Status:** Schema migrated; BIGINT credits; ledger supports widget payments and LLM usage

**Reference:** [ACCOUNTS_DESIGN.md](./ACCOUNTS_DESIGN.md), [BILLING_EVOLUTION.md](./BILLING_EVOLUTION.md)

### 6. Dual-Cost LLM Billing ✅

**Provider Cost Tracking + User Pricing with Profit Margin:**

- **Implementation:**
  - LiteLLM adapter extracts `x-litellm-response-cost` header ([`src/adapters/server/ai/litellm.adapter.ts`](../src/adapters/server/ai/litellm.adapter.ts))
  - Pricing helpers: `usdToCredits()`, `calculateUserPriceCredits()` ([`src/core/billing/pricing.ts`](../src/core/billing/pricing.ts))
  - Markup factor: `USER_PRICE_MARKUP_FACTOR` env var (default 2.0 = 50% margin)
  - Discriminated union types: `BilledLlmUsageParams` vs `NeedsReviewLlmUsageParams` ([`src/ports/accounts.port.ts`](../src/ports/accounts.port.ts))
  - Atomic `recordLlmUsage()` branches on `billingStatus`:
    - `"billed"` → insert usage + debit credits + ledger entry
    - `"needs_review"` → insert usage only (no debit, logged for ops review)
  - Completion service wires dual-cost calculation ([`src/features/ai/services/completion.ts`](../src/features/ai/services/completion.ts))
  - Returns `requestId` in API response for traceability
- **Behavior:**
  - LiteLLM provides cost → full billing with profit margin enforcement
  - Cost header missing → logs warning, records usage with NULL costs, user gets free response
  - Post-call billing errors never block user response (graceful degradation)
- **Invariant:** `user_price_credits >= provider_cost_credits` when billed
- **Tests:**
  - [`tests/unit/core/billing/pricing.test.ts`](../tests/unit/core/billing/pricing.test.ts) - Pricing logic
  - [`tests/stack/ai/completion-billing.stack.test.ts`](../tests/stack/ai/completion-billing.stack.test.ts) - Integration test
  - [`tests/stack/ai/billing-e2e.stack.test.ts`](../tests/stack/ai/billing-e2e.stack.test.ts) - E2E billing flow (fake LLM)
- **Status:** Complete; profit margins enforced; graceful degradation working
- **Reference:** [BILLING_EVOLUTION.md](./BILLING_EVOLUTION.md)

### 7. Credits Page UI ✅

**Balance Display + Purchase Flow:**

- **Features:**
  - Real-time balance from `GET /api/v1/payments/credits/summary`
  - Recent transactions table from `credit_ledger` (last 10 entries)
  - "Buy Credits" with DePay widget integration
  - Loading/error states
  - Balance updates after payment confirmation
- **Status:** Live data wired; React Query cache invalidation working
- **Reference:** [`src/app/(app)/credits/`](<../src/app/(app)/credits/>)

---

## ⚠️ What's PARTIALLY COMPLETE (Code Exists, Needs Work)

### 8. Account API Keys ⚠️

**Current State:**

- ✅ Virtual keys provisioned automatically on account creation
- ✅ Completion endpoint uses virtual keys internally
- ❌ No user-facing API key management
- ❌ No endpoints to list/create/revoke API keys
- ❌ No UI to display API keys for external usage

**What's Missing:**

- [ ] `GET /api/v1/accounts/keys` - List user's API keys
- [ ] `POST /api/v1/accounts/keys` - Create new API key
- [ ] `DELETE /api/v1/accounts/keys/:id` - Revoke API key
- [ ] API key authentication middleware (for external clients)
- [ ] UI page to manage API keys
- [ ] API key display (show once on creation)

**Reference:** [ACCOUNTS_API_KEY_ENDPOINTS.md](./ACCOUNTS_API_KEY_ENDPOINTS.md) - Full spec (not implemented)

### 9. Usage Tracking & History ⚠️

**Current State:**

- ✅ `llm_usage` table tracks every LLM call with costs
- ✅ `credit_ledger` provides audit trail
- ❌ No user-facing usage history endpoint
- ❌ No usage analytics or breakdown
- ❌ No cost reports

**What's Missing:**

- [ ] `GET /api/v1/usage/history` - List LLM calls with costs
- [ ] `GET /api/v1/usage/summary` - Usage analytics (by model, by day, etc.)
- [ ] Usage page in UI showing detailed history
- [ ] Cost breakdown by request
- [ ] Export functionality (CSV/JSON)

**Impact:** Users can see balance changes in ledger but not detailed per-request LLM usage

---

## ❌ What's NOT STARTED

### 10. Post-MVP Security Hardening ❌

**Ponder On-Chain Verification:**

**Current Trust Model (MVP):**

- ✅ SIWE-authenticated session resolves billing account
- ✅ DePay widget running in authenticated UI
- ⚠️ **Soft oracle:** Trust widget `succeeded` callback without on-chain verification
- ⚠️ No cryptographic proof of payment validated server-side

**Security Gap:**

- Client could fabricate payment confirmations (mitigated by session auth, idempotency, manual monitoring)
- No automatic reconciliation with on-chain data

**Required for Production - See [PAYMENTS_PONDER_VERIFICATION.md](./PAYMENTS_PONDER_VERIFICATION.md):**

#### Phase 1A: Ponder Setup

- [ ] Add Ponder service to Docker compose
- [ ] Configure indexing for Base Sepolia testnet
- [ ] Index USDC transfers to DAO wallet
- [ ] Test indexing with manual transfers
- [ ] Verify GraphQL queries work

#### Phase 1B: Reconciliation

- [ ] Build reconciliation service and GraphQL client
- [ ] Add background job scheduler (BullMQ or similar)
- [ ] Periodic job compares Ponder data vs `credit_ledger`
- [ ] Flag discrepancies for manual review
- [ ] Add monitoring and alerts
- [ ] Deploy to dev environment

#### Phase 1C: Production

- [ ] Configure Base mainnet indexing
- [ ] Deploy Ponder to production infrastructure
- [ ] Enable reconciliation job in production
- [ ] Monitor for 2–4 weeks, tune thresholds

#### Phase 2: On-Chain Gate (Future)

- [ ] Capture tx_hash on frontend (DePay provides this)
- [ ] Add `status` column to `credit_ledger` ('pending' | 'confirmed')
- [ ] For high-value payments (>$100), require on-chain confirmation
- [ ] Verification worker checks Ponder for matching tx_hash
- [ ] Add user-facing "pending" state in UI
- [ ] Define timeout and manual review process

**Files to Create:**

- `platform/ponder/` - Ponder configuration and indexing logic
- `src/features/payments/services/ponder-reconciliation.ts` - Reconciliation service
- `src/workers/reconciliation-job.ts` - Background job scheduler
- `platform/runbooks/PONDER_RECONCILIATION.md` - Operations runbook

**Status:** ❌ Not implemented; required before production launch with real funds

**Full Spec:** [PAYMENTS_PONDER_VERIFICATION.md](./PAYMENTS_PONDER_VERIFICATION.md)

### 11. Operational Hardening ❌

**From [DEPAY_PAYMENTS.md](./DEPAY_PAYMENTS.md) Sections 5-7:**

- [ ] Rate limiting on `/payments/credits/confirm`
- [ ] Rate limiting on `/ai/completion`
- [ ] Manual reconciliation script
- [ ] Monitoring dashboards (Grafana)
- [ ] Alerts for discrepancies
- [ ] Prometheus metrics
- [ ] Runbooks for common scenarios

### 12. Route Protection & Cleanup ❌

**From [ACCOUNTS_DESIGN.md](./ACCOUNTS_DESIGN.md):**

- [ ] Add middleware for route protection (currently using layout guards only)
- [ ] Comprehensive API authentication tests
- [ ] Security audit of auth flow

---

## 💰 Current Economics

**Credit Unit Standard:**

- 1 credit = $0.001 USD
- 1 USDC = 1,000 credits
- 1 cent = 10 credits
- Default markup: 2.0× (50% profit margin)

**Payment Flow (Working):**

User pays crypto → DAO wallet receives → frontend calls confirm → backend credits account

**LLM Billing (Working):**

- ✅ Provider cost extracted from LiteLLM headers
- ✅ User price calculated with configurable markup
- ✅ Profit margin enforced: `user_price >= provider_cost`
- ✅ Dual-cost tracked in `llm_usage` table
- ✅ Graceful degradation when cost unavailable (free response, logged for review)

**Reference:** [BILLING_EVOLUTION.md](./BILLING_EVOLUTION.md) - Credit Unit Standard

---

## 🎯 Summary: Where We Are Today

### ✅ Working

- Auth.js + SIWE wallet authentication
- DePay widget integration (frontend + backend)
- Payment confirmation with idempotency
- Credits ledger and balance updates
- Dual-cost LLM billing with profit margin enforcement
- Database schema complete
- Chain configuration locked to Base mainnet
- Credits page UI with live data
- Graceful degradation when LiteLLM cost unavailable

### ⚠️ Partial / In Progress

- Account API keys (internal only, no user management)
- Usage tracking (stored but no user-facing endpoints/UI)

### ❌ Not Started (Critical for Production)

- **Ponder on-chain verification** (see [PAYMENTS_PONDER_VERIFICATION.md](./PAYMENTS_PONDER_VERIFICATION.md))
- Account API key management endpoints + UI
- Usage history endpoints + UI
- Rate limiting
- Monitoring & alerting
- Reconciliation procedures

### 🚀 Next Steps to Complete MVP

#### Immediate (Required for First External API Users)

1. **Account API Key Management**
   - [ ] Implement key management endpoints (list, create, revoke)
   - [ ] Add API key authentication middleware
   - [ ] Build API keys management page
   - [ ] Add API key display (show once pattern)
   - [ ] Update docs with API usage examples

2. **Usage History**
   - [ ] Build `/api/v1/usage/history` endpoint
   - [ ] Build `/api/v1/usage/summary` endpoint with analytics
   - [ ] Create usage history page in UI
   - [ ] Add cost breakdown per request
   - [ ] Add export functionality

#### Short-Term (Operational Readiness)

3. **Ponder Indexer (Phase 1)**
   - [ ] Deploy Ponder service
   - [ ] Configure Base Sepolia + mainnet indexing
   - [ ] Implement reconciliation job
   - [ ] See [PAYMENTS_PONDER_VERIFICATION.md](./PAYMENTS_PONDER_VERIFICATION.md)

4. **Hardening**
   - [ ] Add rate limiting (payment + completion endpoints)
   - [ ] Set up monitoring dashboards
   - [ ] Create reconciliation runbooks
   - [ ] Add alerts for discrepancies

#### Medium-Term (Production Security)

5. **Ponder Phase 2 (On-Chain Gate)**
   - [ ] Capture tx_hash from DePay widget
   - [ ] Implement pending credit state
   - [ ] Verification worker for high-value payments
   - [ ] See [PAYMENTS_PONDER_VERIFICATION.md](./PAYMENTS_PONDER_VERIFICATION.md)

### Overall Assessment

**Core Payment + Billing Loop:** 80% complete

- Can accept crypto payments ✅
- Track dual-cost billing with profit margins ✅
- Need API key management + usage history ⚠️

**Production Security:** 40% complete

- Authentication working ✅
- Payment idempotency working ✅
- **Need Ponder on-chain verification** ❌ (critical blocker)
- Need rate limiting + monitoring ❌

**External API Readiness:** 60% complete

- Can bill LLM usage ✅
- Need API key management ❌
- Need usage history endpoints ❌

The system can accept crypto payments and track LLM costs with profit margins, but requires API key management for external users and Ponder verification for production-grade fraud prevention.
