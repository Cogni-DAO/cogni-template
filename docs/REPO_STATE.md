# Repository State Summary

**Assessment Date:** 2025-12-03
**Core Mission:** Crypto-metered AI infrastructure where users pay DAO wallet → get credits → consume LLM → billing tracked with dual-cost accounting

**Related Documentation:**

- [Architecture](./ARCHITECTURE.md) - Directory structure and file locations
- [Accounts Design](./ACCOUNTS_DESIGN.md) - Identity & billing model
- [Security & Auth Spec](./SECURITY_AUTH_SPEC.md) - SIWE authentication architecture
- [Payments Design](./PAYMENTS_DESIGN.md) - Native USDC payment architecture
- [Billing Evolution](./BILLING_EVOLUTION.md) - Dual-cost accounting implementation
- [Payments Ponder Verification](./PAYMENTS_PONDER_VERIFICATION.md) - **Required for production security**
- [Observability](./OBSERVABILITY.md) - Logging and monitoring infrastructure

---

## ✅ What's COMPLETE (Code Exists & Working)

### 1. Authentication Infrastructure ✅

Auth.js + SIWE wallet-first authentication with session management. Sessions resolve to billing accounts.

**Reference:** [SECURITY_AUTH_SPEC.md](./SECURITY_AUTH_SPEC.md)

### 2. Wallet Integration ✅

wagmi + RainbowKit client-side wallet connection. Chain locked to Base mainnet (8453).

**Reference:** [INTEGRATION_WALLETS_CREDITS.md](./INTEGRATION_WALLETS_CREDITS.md)

### 3. Native USDC Payments ✅

Intent-based payment flow: create intent → user transfers USDC → submit txHash → verify → credit account.

- State machine: `CREATED_INTENT` → `PENDING_UNVERIFIED` → `CREDITED` (+ terminal: `REJECTED`, `FAILED`)
- Two-port design: `PaymentAttemptRepository` + `OnChainVerifier`
- Idempotency enforced at DB level

**Security Note:** ⚠️ **MVP trust model: OnChainVerifier adapter is STUBBED (always returns VERIFIED). Real Ponder-backed verification required for production. See [Post-MVP Security Hardening](#11-post-mvp-security-hardening-).**

**Reference:** [PAYMENTS_DESIGN.md](./PAYMENTS_DESIGN.md)

### 4. Database Schema (Billing Layer) ✅

Tables: `users`, `billing_accounts`, `virtual_keys`, `credit_ledger`, `charge_receipts`, `payment_intents`, `payment_attempts`, `payment_events`

**Reference:** [ACCOUNTS_DESIGN.md](./ACCOUNTS_DESIGN.md), [BILLING_EVOLUTION.md](./BILLING_EVOLUTION.md)

### 5. Dual-Cost LLM Billing ✅

Provider cost tracking + user pricing with configurable profit margin (default 2.0×).

- LiteLLM provides cost → full billing with margin enforcement
- Cost header missing → graceful degradation (free response, logged for review)
- Invariant: `user_price_credits >= provider_cost_credits` when billed

**Reference:** [BILLING_EVOLUTION.md](./BILLING_EVOLUTION.md)

### 6. Credits Page UI ✅

Balance display + native USDC payment flow. Live data with React Query cache invalidation.

### 7. AI Chat Interface ✅

assistant-ui powered streaming chat with credit-metered billing.

### 8. Observability Infrastructure ✅

Pino structured logging → Alloy → local Loki (dev) or Grafana Cloud (preview/prod).

**Reference:** [OBSERVABILITY.md](./OBSERVABILITY.md)

---

## ⚠️ What's PARTIALLY COMPLETE (Code Exists, Needs Work)

### 9. Account API Keys ⚠️

- ✅ Virtual keys provisioned automatically on account creation
- ✅ Completion endpoint uses virtual keys internally
- ❌ No user-facing API key management (list/create/revoke)
- ❌ No API key authentication middleware for external clients

**Reference:** [ACCOUNTS_API_KEY_ENDPOINTS.md](./ACCOUNTS_API_KEY_ENDPOINTS.md) - Full spec (not implemented)

### 10. Usage Tracking & History ⚠️

- ✅ `charge_receipts` table tracks every LLM call with costs
- ✅ `credit_ledger` provides audit trail
- ❌ No user-facing usage history endpoint or analytics

---

## ❌ What's NOT STARTED

### 11. Post-MVP Security Hardening ❌

**Current Trust Model (MVP):**

- ✅ SIWE-authenticated session resolves billing account
- ✅ Payment flow structure in place (intent → submit → verify)
- ⚠️ **OnChainVerifier is STUBBED** - always returns VERIFIED without real on-chain validation
- ⚠️ No automatic reconciliation with on-chain data

**Security Gap:** Backend trusts txHash submission without cryptographic proof. Mitigated by session auth, idempotency, and manual monitoring.

**Required for Production - See [PAYMENTS_PONDER_VERIFICATION.md](./PAYMENTS_PONDER_VERIFICATION.md):**

- [ ] Deploy Ponder indexer for USDC Transfer events
- [ ] Implement real verification in `PonderOnChainVerifierAdapter`
- [ ] Build reconciliation service comparing on-chain vs `credit_ledger`
- [ ] Add monitoring and alerts for discrepancies

### 12. Operational Hardening ❌

- [ ] Rate limiting on payment and AI endpoints
- [ ] Monitoring dashboards (Grafana)
- [ ] Prometheus metrics
- [ ] Runbooks for common scenarios

### 13. Route Protection & Cleanup ❌

- [ ] Add middleware for route protection (currently using layout guards only)
- [ ] Comprehensive API authentication tests
- [ ] Security audit of auth flow

---

## 💰 Current Economics

- 1 credit = $0.001 USD
- 1 USDC = 1,000 credits
- Default markup: 2.0× (50% profit margin)

**Payment Flow:** User creates intent → transfers USDC to DAO wallet → submits txHash → backend verifies (stubbed) → credits account

**Reference:** [BILLING_EVOLUTION.md](./BILLING_EVOLUTION.md) - Credit Unit Standard

---

## 🎯 Summary

### ✅ Working

- Auth.js + SIWE wallet authentication
- Native USDC payment flow (stubbed verification)
- Credits ledger and balance updates
- Dual-cost LLM billing with profit margin enforcement
- AI chat with assistant-ui
- Structured logging → Grafana Cloud

### ⚠️ Partial

- Account API keys (internal only, no user management)
- Usage tracking (stored but no user-facing endpoints)

### ❌ Not Started (Critical for Production)

- **Ponder on-chain verification** (see [PAYMENTS_PONDER_VERIFICATION.md](./PAYMENTS_PONDER_VERIFICATION.md))
- Account API key management
- Usage history endpoints
- Rate limiting & monitoring

### Overall Assessment

| Area                   | Status | Notes                            |
| ---------------------- | ------ | -------------------------------- |
| Payment + Billing Loop | 80%    | Flow works, verification stubbed |
| Production Security    | 40%    | **Need Ponder verification**     |
| External API Readiness | 60%    | Need API key management          |

The system accepts USDC payments and tracks LLM costs with profit margins. Requires Ponder verification for production-grade fraud prevention and API key management for external users.
