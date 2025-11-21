# Billing Evolution: From Flat-Rate to Dual-Cost Accounting

Extends the accounts system defined in [ACCOUNTS_DESIGN.md](ACCOUNTS_DESIGN.md) with profit-enforcing billing and provider cost tracking.

**Context:**

- Wallet connectivity and chat UI: [INTEGRATION_WALLETS_CREDITS.md](INTEGRATION_WALLETS_CREDITS.md) (Steps 1-4)
- System architecture: [ACCOUNTS_DESIGN.md](ACCOUNTS_DESIGN.md)
- API contracts: [ACCOUNTS_API_KEY_ENDPOINTS.md](ACCOUNTS_API_KEY_ENDPOINTS.md)

**Prerequisite:** Step 4 from [INTEGRATION_WALLETS_CREDITS.md](INTEGRATION_WALLETS_CREDITS.md) must be complete (wallet-linked chat UI working with flat-rate billing) before starting Stage 6.5.

---

## Stage 5 – Manual Credit Top-Ups & Visibility (Thin Bridge)

**Goal:** Make credits usable in practice: admins can top up, devs can see balances, and 402 errors are predictable.

_This stage assumes **flat-rate pricing** is still in place. Dual-cost/markup comes in Stage 6.5._

### 5.1 Admin Top-Up Path ✅ EXISTING

- [x] Confirm there is a single clear way to top up credits:
  - [x] `AccountService.creditAccount(...)` exists
  - [x] Manual SQL path documented in docs
- [ ] Document standard ops procedure:
  - [ ] How to find `accountId` (from wallet or apiKey)
  - [ ] How to credit N USDC → N \* CREDITS_PER_USDC credits
  - [ ] Example commands / SQL for test + prod

**Files:**

- Update: `docs/ACCOUNTS_DESIGN.md` - Add "Manual Operations" section
- Existing: `src/ports/accounts.port.ts` (creditAccount method)
- Existing: `src/adapters/server/accounts/drizzle.adapter.ts`

### 5.2 Developer / Admin Observability ⏸️ PENDING

- [ ] Add simple query or script for:
  - [ ] `SELECT id, balance_credits FROM accounts ORDER BY created_at DESC LIMIT 50;`
  - [ ] `SELECT * FROM credit_ledger WHERE account_id = ... ORDER BY created_at DESC;`
- [ ] Document in `ACCOUNTS_DESIGN.md` under "Manual ops / debugging"

**Files to create:**

- `scripts/db/query-balances.ts` - Account balance query script
- `scripts/db/query-ledger.ts` - Ledger query script
- Update: `docs/ACCOUNTS_DESIGN.md`

### 5.3 402 Error Shape ⏸️ PENDING

- [ ] Standardize 402 response from completion route:
  - [ ] `{ error: "insufficient_credits", message, accountId, requiredCredits, availableCredits }`
- [ ] Ensure frontend uses this shape consistently

**Files:**

- Update: `src/app/api/v1/ai/completion/route.ts` - Standardize error response
- Update: `src/core/accounts/errors.ts` - Add structured error data
- Update frontend chat UI to consume error shape

---

## Stage 6 – Current Flat-Rate Billing (Baseline)

**Goal:** Capture current behavior as explicit baseline before changing it.

_This stage is mostly documentation and cleanup around what already exists._

### 6.1 Document Existing Flat-Rate Pricing ⏸️ PENDING

- [ ] In `docs/ACCOUNTS_DESIGN.md`, add short section:
  - [ ] `calculateCost()` uses flat per-token rate (e.g. `0.001 credits/token`)
  - [ ] `AccountService.debitForUsage({ accountId, cost, requestId, metadata })` called after `llmService.completion`
  - [ ] `credit_ledger.delta` and `accounts.balance_credits` use DECIMAL today (pre-migration)

**Files:**

- Update: `docs/ACCOUNTS_DESIGN.md` - Add "Stage 6: Flat-Rate Baseline" section
- Reference: `src/core/billing/pricing.ts`
- Reference: `src/features/ai/services/completion.ts`

### 6.2 Mark Flat-Rate as Temporary ⏸️ PENDING

- [ ] Explicitly label this behavior as "legacy / pre-Stage 6.5":
  - [ ] Note that it does **not** distinguish provider cost vs user price
  - [ ] Note that it does **not** enforce specific markup or profit guarantee

**Files:**

- Update: `src/core/billing/pricing.ts` - Add comment noting temporary nature
- Update: `docs/ACCOUNTS_DESIGN.md`

---

## Stage 6.5 – Dual-Cost Accounting & Profit Margin

**Goal:** Replace flat-rate billing with dual-cost, integer-credit system that guarantees `user_price ≥ provider_cost` and enforces configurable markup (e.g. 1.5×).

### 6.5.1 Credit Units & Migration ⏸️ PENDING

**Decision & Documentation:**

- [x] 1 credit = $0.001 USD
- [x] 1 USDC = 1,000 credits
- [ ] Document clearly at top of `ACCOUNTS_DESIGN.md`

**Migration: 0001_integer_credits.sql**

- [ ] Convert `accounts.balance_credits` to `BIGINT`
- [ ] Convert `credit_ledger.delta` to `BIGINT`
- [ ] EITHER:
  - [ ] Reset balances to 0 with "pre-launch" comment, OR
  - [ ] Multiply prior USD values by 1000, document old values were USD

**Schema Update:**

- [ ] Update `src/shared/db/schema.ts`:
  - [ ] `accounts.balance_credits: BIGINT`
  - [ ] `credit_ledger.delta: BIGINT`

**Files:**

- Create: `drizzle/migrations/0001_integer_credits.sql`
- Update: `src/shared/db/schema.ts`
- Update: `docs/ACCOUNTS_DESIGN.md` - Add "Credit Unit Standard" section

### 6.5.2 `llm_usage` Table ⏸️ PENDING

**Migration: 0002_llm_usage_tracking.sql**

- [ ] Create `llm_usage` with:
  - [ ] `id UUID`
  - [ ] `account_id` (references accounts)
  - [ ] `request_id`
  - [ ] `model`
  - [ ] `prompt_tokens`
  - [ ] `completion_tokens`
  - [ ] `provider_cost_credits BIGINT`
  - [ ] `user_price_credits BIGINT`
  - [ ] `markup_factor_applied DECIMAL(4,2)`
  - [ ] `created_at`
  - [ ] Indexes on `account_id`, `created_at`, `request_id`

**Schema Update:**

- [ ] Add `llmUsage` table to Drizzle schema

**Files:**

- Create: `drizzle/migrations/0002_llm_usage_tracking.sql`
- Update: `src/shared/db/schema.ts`

### 6.5.3 Env & Config ⏸️ PENDING

**Environment Variables:**

- [ ] `.env.example`:
  - [ ] `USER_PRICE_MARKUP_FACTOR=1.5`
  - [ ] `CREDITS_PER_USDC=1000`
- [ ] `src/shared/env/server.ts`:
  - [ ] Add validation for both vars (`z.coerce.number()`, sane ranges)
- [ ] Ensure pricing code does not hardcode 1000:
  - [ ] Read `CREDITS_PER_USDC` from single config/env source

**Files:**

- Update: `.env.example`
- Update: `.env.local.example`
- Update: `.env.test.example`
- Update: `src/shared/env/server.ts`

### 6.5.4 Provider Pricing Module ⏸️ PENDING

**Create/Rewrite: `src/core/billing/pricing.ts`**

- [ ] `PROVIDER_PRICING` map: model → `{ inputPerMToken, outputPerMToken }` in USD
- [ ] `calculateProviderCost({ modelId, promptTokens, completionTokens }): credits`
  - [ ] Uses `PROVIDER_PRICING`
  - [ ] Converts USD → credits via `CREDITS_PER_USDC`
  - [ ] `Math.ceil` to avoid undercharging
- [ ] `calculateUserPrice(providerCostCredits, markupFactor): credits`
  - [ ] `Math.ceil` for marked-up charge
- [ ] `estimateMaxUserPrice(modelId, maxTokens, markupFactor)`
  - [ ] Worst-case output-token assumption
  - [ ] Used for pre-call balance check

**Files:**

- Update: `src/core/billing/pricing.ts`
- Create: `tests/unit/core/billing/pricing.test.ts`

### 6.5.5 AccountService: Atomic Billing Operation ⏸️ PENDING

**Port Update:**

- [ ] Update `src/ports/accounts.port.ts`:
  - [ ] Add `recordLlmUsage(params)`:
    - [ ] `accountId, requestId, model, promptTokens, completionTokens`
    - [ ] `providerCostCredits, userPriceCredits, markupFactor`

**Adapter Implementation:**

- [ ] Implement in `src/adapters/server/accounts/drizzle.adapter.ts`:
  - [ ] Single DB transaction that:
    - [ ] Inserts into `llm_usage`
    - [ ] Inserts `credit_ledger` row with `delta = -userPriceCredits`
    - [ ] Updates `accounts.balance_credits -= userPriceCredits`
    - [ ] Enforces `balance >= 0` or throws `InsufficientCreditsError`
- [ ] Ensure old `debitForUsage` is either:
  - [ ] Used only internally by `recordLlmUsage`, OR
  - [ ] Deprecated for LLM billing paths

**Files:**

- Update: `src/ports/accounts.port.ts`
- Update: `src/adapters/server/accounts/drizzle.adapter.ts`
- Update: `tests/unit/adapters/server/accounts/drizzle.adapter.spec.ts`

### 6.5.6 Completion Service Flow Changes ⏸️ PENDING

**Update: `src/features/ai/services/completion.ts`**

- [ ] Read `markupFactor` from env once per call
- [ ] Pre-call check:
  - [ ] `estimatedMaxPrice = estimateMaxUserPrice(modelId, maxTokens, markupFactor)`
  - [ ] Fetch current balance via `AccountService.getBalance`
  - [ ] If `balance < estimatedMaxPrice` → throw `InsufficientCreditsError` (→ 402) **without** calling LiteLLM
- [ ] Call `llmService.completion(...)`
- [ ] Extract `promptTokens`, `completionTokens`, resolved `modelId`
- [ ] Compute:
  - [ ] `providerCostCredits = calculateProviderCost(...)`
  - [ ] `userPriceCredits = calculateUserPrice(providerCostCredits, markupFactor)`
  - [ ] Assert `userPriceCredits >= providerCostCredits`
- [ ] Call `AccountService.recordLlmUsage(...)` with all fields
- [ ] Return result message

**Files:**

- Update: `src/features/ai/services/completion.ts`
- Update: `tests/unit/features/ai/services/completion.test.ts`

### 6.5.7 Documentation Updates ⏸️ PENDING

**ACCOUNTS_DESIGN.md:**

- [ ] Add "Credit Unit Standard" section (1 credit = $0.001, 1 USDC = 1000 credits)
- [ ] Add Stage 6.5 section:
  - [ ] Dual-cost accounting
  - [ ] Provider vs user prices
  - [ ] Profit invariant
  - [ ] High-level flow summary (pre-call → LLM → `recordLlmUsage`)

**ACCOUNTS_API_KEY_ENDPOINTS.md:**

- [ ] Update completion endpoint to describe:
  - [ ] Pre-call balance check
  - [ ] Dual-cost computation
  - [ ] 402 behavior (no token waste)
  - [ ] Reference to `llm_usage` for auditing

**Files:**

- Update: `docs/ACCOUNTS_DESIGN.md`
- Update: `docs/ACCOUNTS_API_KEY_ENDPOINTS.md`

---

## Stage 7 – Monitoring, Reconciliation, On-Chain (Future)

**Goal:** Operational visibility and on-chain payment integration.

_Not part of current work. Document at high level only._

### 7.1 Basic Monitoring ⏸️ FUTURE

- [ ] Simple daily SQL for `SUM(provider_cost_credits)` vs `SUM(user_price_credits)`
- [ ] Manual comparison with LiteLLM / OpenRouter invoices
- [ ] Later: alerts, dashboards, on-chain mirroring

**Potential files:**

- `scripts/reconcile/daily-profit.ts` - Daily profit calculation
- `scripts/reconcile/compare-litellm-invoice.ts` - Invoice reconciliation

### 7.2 On-Chain Integration with Resmic ⏸️ FUTURE

**Reference:** [Resmic SDK Documentation](https://docs.resmic.com/resmic-sdk/getting-started/usage/cryptopayment)

- [ ] Install Resmic SDK for crypto payment processing
- [ ] Create PaymentService port in `src/ports/payment.port.ts`
  - [ ] Interface for initiating payment requests
  - [ ] Interface for validating payment confirmations
- [ ] Implement Resmic adapter: `src/adapters/server/payments/resmic.adapter.ts`
  - [ ] Wrap Resmic SDK for payment initiation
  - [ ] Handle webhook signature validation
- [ ] Add webhook endpoint: `POST /api/v1/webhooks/resmic`
  - [ ] Validate webhook signature from Resmic
  - [ ] Extract payment data: amount, wallet address, transaction hash
  - [ ] Convert USDC amount to credits via `CREDITS_PER_USDC`
  - [ ] Call `AccountService.creditAccount` with `reason="onchain_deposit"`
  - [ ] Store transaction hash in ledger metadata for audit trail
- [ ] Frontend payment UI (Step 4 extension)
  - [ ] Integrate Resmic payment widget
  - [ ] Display payment status
  - [ ] Show credit balance updates after payment confirmation
- [ ] Build payment reconciliation and audit systems
  - [ ] Query ledger for all `onchain_deposit` entries
  - [ ] Compare with Resmic dashboard/API
- [ ] Connect to DAO multi-sig wallet for payment collection

**Potential files:**

- `src/ports/payment.port.ts` - Payment service interface
- `src/adapters/server/payments/resmic.adapter.ts` - Resmic SDK integration
- `src/app/api/v1/webhooks/resmic/route.ts` - Payment webhook handler
- `src/features/payments/` - Payment UI components and hooks
- `scripts/reconcile/compare-resmic.ts` - Resmic payment reconciliation

---

## Implementation Order

**Current Priority:**

1. **Step 4** (see [INTEGRATION_WALLETS_CREDITS.md](INTEGRATION_WALLETS_CREDITS.md)) - Complete wallet-linked chat UI (immediate)
2. **Stage 5** - Observability and 402 error standardization (quick win)
3. **Stage 6** - Document flat-rate baseline (documentation only)
4. **Stage 6.5** - Dual-cost accounting migration (major work)
5. **Stage 7** - Monitoring and on-chain (future)

**Dependencies:**

- Step 4 can proceed immediately (uses existing flat-rate billing)
- Stage 5 improves existing system without breaking changes
- Stage 6 is documentation only, can be done anytime
- Stage 6.5 requires migration coordination (breaking schema change)
- Stage 7 depends on Stage 6.5 completion

**Risk:**

- Integer credit migration (6.5.1) is one-way, requires careful planning
- Chat UI (Step 4) should stabilize before Stage 6.5 to avoid rework
- Consider feature flag for dual-cost rollout to allow gradual migration
