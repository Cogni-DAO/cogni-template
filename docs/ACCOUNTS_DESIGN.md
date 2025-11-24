# Accounts & Credits System Design

**Core Mission**: Crypto-metered AI infrastructure loop where DAO multi-sig → pays for GPU + OpenRouter/LiteLLM → users interact (chat/API) → users pay back in crypto → DAO multi-sig.

**Related:**

- Auth flow: [SECURITY_AUTH_SPEC.md](SECURITY_AUTH_SPEC.md)
- System architecture: [ARCHITECTURE.md](ARCHITECTURE.md)
- Wallet integration: [INTEGRATION_WALLETS_CREDITS.md](INTEGRATION_WALLETS_CREDITS.md)

---

## One Sentence Summary

Auth.js manages identity via SIWE; our billing layer owns LiteLLM virtual keys and tracks credits in a ledger; sessions resolve to virtual keys server-side for LLM calls.

---

## Key Invariants

- LiteLLM virtual keys never leave the server
- All credit changes flow through `credit_ledger` (append-only audit log)
- Each user has one billing account (MVP); that account owns one default LiteLLM virtual key
- Token integration is additive (Postgres becomes cache, tokens become funding source)

---

### Future Migration: Multi-Wallet & OAuth

> [!NOTE]
> **Current State (MVP)**: 1 Wallet = 1 User. The `users` table enforces `UNIQUE(wallet_address)`.
>
> **Future State**: When adding OAuth or multi-wallet support:
>
> 1.  Introduce standard Auth.js `accounts` table.
> 2.  Move uniqueness constraint to `(provider, providerAccountId)` in `accounts`.
> 3.  Demote `users.walletAddress` to a "primary wallet" field or remove it in favor of the `accounts` link.
> 4.  Migrate existing users by creating an `accounts` row for their current wallet.

## 6. Security & Compliance

## Identity & Billing Model

### Three-Layer Identity System

**1. Auth.js Identity (Login & Sessions)**

- Tables: `users`, `accounts` (Auth.js provider accounts), `sessions`, `verification_tokens`
- Purpose: Prove user owns wallet via SIWE
- Managed by: Auth.js Drizzle adapter (automatic)

**2. Billing Accounts (Tenants)**

- Table: `billing_accounts` (renamed from `accounts` to avoid collision)
- Purpose: Track credits, own LiteLLM virtual keys
- Key columns: `id` (PK), `owner_user_id` (FK → `users.id`), `balance_credits`
- File: `src/shared/db/schema.ts`

**3. LiteLLM Virtual Keys (API Access)**

- Table: `virtual_keys`
- Purpose: Store LiteLLM virtual keys for API calls
- Key columns: `id` (PK), `billing_account_id` (FK), `litellm_virtual_key`, `is_default`, `active`
- File: `src/shared/db/schema.ts`

### LiteLLM Integration

**How we use LiteLLM:**

- Each `billing_accounts` row owns one or more LiteLLM virtual keys (stored in `virtual_keys` table)
- LiteLLM Teams/Users are optional analytics labels (not used in MVP)
- MVP: 1 Auth.js user → 1 billing account → 1+ virtual keys

**Per-request flow:**

```
Session → user.id → billing_account → default virtual_key → LiteLLM API call → credit deduction
```

### Funding Path (MVP)

**Credits UP (Real Users):**

- User pays via payment widget (DePay, frontend-only SDK) in the browser
- Widget fires success callback (e.g., `succeeded` event) client-side once payment is confirmed on-chain
- Frontend calls `POST /api/v1/payments/credits/confirm` (session-authenticated)
- Backend resolves `billing_account_id` from SIWE session (not from request body)
- Inserts positive `credit_ledger` row with `reason='widget_payment'`
- Updates `billing_accounts.balance_credits`

**MVP Trust Model:** The SIWE session and widget success callback are the only gates; no on-chain verification in the critical path.

**Post-MVP Hardening:** A Ponder-based on-chain indexer will watch the DAO wallet for USDC transfers and provide reconciliation/observability (not a hard gate initially). See `docs/PAYMENTS_PONDER_VERIFICATION.md`.

**Credits DOWN (LLM Usage):**

- After each LiteLLM call, compute `provider_cost_credits` + `user_price_credits`
- Insert `llm_usage` row with token counts and cost breakdown
- Insert negative `credit_ledger` row with `reason='ai_usage'`
- Update `billing_accounts.balance_credits`

**Dev/Test:** Seed scripts insert positive `credit_ledger` rows directly via database fixtures.

---

## Database Schema (New Architecture)

### Auth.js Tables (Identity)

- `users` - User records (wallet address from SIWE)
- `accounts` - Auth.js provider accounts (not billing)
- `sessions` - Active sessions
- `verification_tokens` - Email verification (unused for SIWE)

### Billing Tables (Our Layer)

**`billing_accounts`:**

- Billing tenants that own LiteLLM virtual keys
- Links to Auth.js `users` via `owner_user_id`
- Tracks `balance_credits` (computed from ledger)

**`virtual_keys`:**

- LiteLLM virtual keys for API access
- Links to `billing_accounts` via `billing_account_id`
- Fields: `litellm_virtual_key`, `label`, `is_default`, `active`

**`credit_ledger`:**

- Append-only audit log (source of truth for balances)
- Links to `billing_accounts` and `virtual_keys`
- Fields: `amount` (signed integer, +/-), `balance_after`, `reason`, `reference`, `metadata`, `created_at`

**File:** `src/shared/db/schema.ts`

---

## Core Architecture

### Ports (Interfaces)

- `src/ports/accounts.port.ts` - AccountService interface for billing operations
- `src/ports/llm.port.ts` - LlmService interface, defines LlmCaller type

### Adapters (Implementations)

- `src/adapters/server/accounts/drizzle.adapter.ts` - Database operations for billing_accounts, virtual_keys, credit_ledger
- `src/adapters/server/ai/litellm.adapter.ts` - LiteLLM proxy integration
- `src/adapters/server/db/client.ts` - Drizzle database connection

### Domain Logic

- `src/core/accounts/model.ts` - Account domain types (credit validation)
- `src/core/accounts/errors.ts` - InsufficientCreditsError
- `src/core/billing/pricing.ts` - Token-to-credit conversion (MVP: flat rate)

### Feature Services

- `src/features/ai/services/completion.ts` - Orchestrates LLM calls + credit deduction

### Auth Utilities (New)

- `src/lib/auth/mapping.ts` - Maps Auth.js user to billing_account + virtual_key
- `src/lib/auth/helpers.ts` - Session lookup utilities

### API Routes

**Auth Policy:** All credit-impacting routes require user sessions. Provisioning and operations happen internally via scripts/database. See [SECURITY_AUTH_SPEC.md](SECURITY_AUTH_SPEC.md) "API Auth Policy (MVP)" for complete routing table.

**User Routes (Session Required):**

- `src/app/api/v1/ai/completion/route.ts` - Chat endpoint (session auth + credit deduction)

**Auth Routes (Public):**

- `/api/auth/*` - Auth.js routes (handled automatically)

**Payment Routes (Session Required):**

- `src/app/api/v1/payments/credits/confirm/route.ts` - Widget payment confirmation (top-up credits, session-authenticated)

**Infrastructure Routes (Public, Unversioned):**

- `/health` - Healthcheck
- `/openapi.json` - API documentation
- `/meta/route-manifest` - Route manifest for testing

---

## Key Design Decisions

### 1. Ledger-Based Accounting

- `credit_ledger` is source of truth for all balance changes
- `billing_accounts.balance_credits` is computed/cached from ledger
- Enables full audit trail and future on-chain reconciliation
- All credit operations are atomic (wrapped in database transactions)

### 2. LiteLLM Integration Strategy

- We don't reinvent billing — we use LiteLLM's virtual keys for API access
- `virtual_keys.litellm_virtual_key` stores the actual LiteLLM key string
- LiteLLM Teams/Users are optional analytics labels (not used in MVP)
- Future: LiteLLM spend tracking can be reconciled with our credit ledger

### 3. Credential Separation

- API keys (LiteLLM virtual keys) are server-only secrets
- Browser only holds Auth.js session cookie (HttpOnly)
- Server resolves: session → billing_account → virtual_key on each request
- Billing account + default virtual key are provisioned lazily on the first billable action (AI completion or payment/top-up) by calling `getOrCreateBillingAccountForUser(session.user)`; never accept `billing_account_id` from the client

### 4. MVP Scope: Session-Only Auth

- Protected routes use Auth.js sessions only
- No Bearer token auth in initial implementation (post-MVP)
- `/api/v1/wallet/link` removed (no longer needed)

### 5. Token-Ready Design

- Schema supports future on-chain payments
- `credit_ledger.reason` can be "ai_usage" | "topup_manual" | "onchain_deposit"
- `credit_ledger.reference` can store tx hashes
- Postgres becomes real-time balance cache, tokens become funding source

---

## Implementation Status

### Phase 0: Database Reset

- [x] Drop existing tables, delete migrations
- [x] Update schema: `billing_accounts` + `virtual_keys` + `credit_ledger`
- [x] Generate fresh migrations
- [x] Let Auth.js adapter create identity tables

### Phase 1-2: Auth.js Setup

- [x] Install next-auth@beta, @auth/drizzle-adapter, siwe
- [x] Create `src/auth.ts` with Credentials provider + SIWE verification
- [ ] Wire RainbowKit to Auth.js signIn()

### Phase 3: Billing Integration

- [x] Implement `src/lib/auth/mapping.ts` (getOrCreateBillingAccountForUser)
- [x] Provision default virtual key on first login (call LiteLLM `/key/generate` with `LITELLM_MASTER_KEY`; may attach `metadata.cogni_billing_account_id`)
- [x] Update completion route to use session auth + virtual_keys lookup
- [x] Remove `/api/v1/wallet/link` endpoint
- [ ] Ensure billing account + default virtual key are created on session creation and any payment/top-up flows (invoke `getOrCreateBillingAccountForUser` outside AI facade)

### Phase 4-5: Protection & Cleanup

- [ ] Add middleware for route protection
- [ ] Remove any localStorage apiKey code
- [ ] Update all tests for new schema

### Future: On-Chain Integration

- [ ] Monitor wallet payments to DAO contract
- [ ] Write `credit_ledger` entries with `reason="onchain_deposit"`
- [ ] Build payment reconciliation system
