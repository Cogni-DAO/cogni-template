# Billing Evolution: Dual-Cost Accounting Implementation

Extends the accounts system defined in [ACCOUNTS_DESIGN.md](ACCOUNTS_DESIGN.md) with profit-enforcing billing and provider cost tracking.

**Stage 6.5 applies after the Auth.js + billing_accounts + virtual_keys MVP is in place; it does not change auth, only how we compute and store costs for each LLM call.**

**Context:**

- System architecture: [ACCOUNTS_DESIGN.md](ACCOUNTS_DESIGN.md)
- API contracts: [ACCOUNTS_API_KEY_ENDPOINTS.md](ACCOUNTS_API_KEY_ENDPOINTS.md)
- Wallet integration: [INTEGRATION_WALLETS_CREDITS.md](INTEGRATION_WALLETS_CREDITS.md)
- Payments (MVP funding): [PAYMENTS_RESMIC.md](PAYMENTS_RESMIC.md)

---

## Stage 6.5 – Dual-Cost Accounting & Profit Margin

**Core Goal:** Per LLM call, use LiteLLM's response cost (USD) as provider cost oracle, convert to credits, apply markup, enforce `user_price_credits ≥ provider_cost_credits`, and atomically record both with a debit.

**Credit Unit Standard:**

- 1 credit = $0.001 USD
- 1 USDC = 1,000 credits
- All balances stored as BIGINT integers
- Default markup: 2.0× (100% markup = 50% margin)

**Provider Cost Source:**

- LiteLLM computes per-request cost and exposes it as a per-call "response cost" in USD
- Our code converts that USD cost → `provider_cost_credits` → `user_price_credits`
- We do not maintain hardcoded per-model USD pricing tables; LiteLLM's pricing map is the canonical source
- Token counts and model metadata are stored for audit/analysis only, not for cost calculation

Credits increase via positive entries in credit_ledger (e.g., from payments webhooks or admin tools); the specific payment rails are defined in the payments spec.

---

### 6.5.1 Migrate Credits to Integer Units

**Goal:** Change billing_accounts.balance_credits and credit_ledger.amount to BIGINT, reset balances to 0 for pre-launch clean slate.

**Files:**

- `src/shared/db/migrations/*_integer_credits.sql` - ALTER TABLE to BIGINT, reset to 0
- `src/shared/db/schema.ts` - Update type definitions to BIGINT

**Notes:**

- Pre-launch reset acceptable (no real user funds exist yet)
- Update test fixtures to use integer credit values

---

### 6.5.2 Add llm_usage Table

**Goal:** Track provider_cost_credits and user_price_credits per call for audit and profit verification.

**Schema:** id, billing_account_id (FK → billing_accounts.id), virtual_key_id (FK → virtual_keys.id), request_id, model, prompt_tokens, completion_tokens, provider_cost_credits (BIGINT), user_price_credits (BIGINT), markup_factor_applied, created_at

**Cost Semantics:**

- `provider_cost_credits = ceil(LiteLLM_response_cost_usd × CREDITS_PER_USDC)`
- `user_price_credits = ceil(provider_cost_credits × USER_PRICE_MARKUP_FACTOR)`
- Model and token fields are for audit/analysis only, not cost calculation

**Files:**

- `src/shared/db/migrations/*_llm_usage_tracking.sql` - CREATE TABLE with indexes
- `src/shared/db/schema.ts` - Add llmUsage table definition

**Notes:**

- Mirrors credit_ledger by linking both billing_account_id and virtual_key_id
- Enables tracking which specific virtual key generated each LLM call
- LiteLLM maintains its own spend logs; llm_usage is our app-local mirror keyed by billing_account_id + request_id

---

### 6.5.3 Environment Configuration

**Goal:** Configure markup factor and credit unit conversion via environment variables.

**Variables:**

- `USER_PRICE_MARKUP_FACTOR=2.0` - Profit markup (2.0 = 50% margin)
- `CREDITS_PER_USDC=1000` - Credit unit conversion

**Files:**

- `.env.example` - Add both variables
- `src/shared/env/server.ts` - Add Zod validation (min/max ranges)

---

### 6.5.4 Pricing Helpers

**Goal:** Provide pure conversion functions for USD → credits and markup application.

**Responsibilities:**

- `usdToCredits(usd)`: Convert USD cost to BIGINT credits using CREDITS_PER_USDC from env
- `calculateUserPriceCredits(providerCostCredits, markupFactor)`: Apply markup and round up (Math.ceil)

**Files:**

- `src/core/billing/pricing.ts` - Pure conversion helpers only
- `tests/unit/core/billing/pricing.test.ts` - Test conversions and rounding
- `src/shared/env/server.ts` - CREDITS_PER_USDC validation

**Constraints:**

- These helpers do NOT contain model-specific pricing data
- All USD costs come from LiteLLM's response, not computed locally
- Read CREDITS_PER_USDC from env, do not hardcode

---

### 6.5.5 Atomic Billing Operation

**Goal:** Single AccountService method that records llm_usage and debits user_price_credits in one transaction.

**New Port Method:** `recordLlmUsage(billingAccountId, virtualKeyId, requestId, model, promptTokens, completionTokens, providerCostCredits, userPriceCredits, markupFactorApplied)`

**Parameters:** All cost values (providerCostCredits, userPriceCredits) are pre-computed by completion service using LiteLLM response cost and pricing helpers. No pricing logic in adapter.

**Implementation:** Single DB transaction that:

1. Inserts llm_usage row with all fields
2. Inserts credit_ledger debit row (amount = -userPriceCredits, billing_account_id, virtual_key_id)
3. Updates billing_accounts.balance_credits
4. Checks if resulting balance would be negative
5. If negative: throws InsufficientCreditsError and rolls back entire transaction (no llm_usage, no ledger entry, no balance change)

**Balance Invariant:** Balances remain non-negative. Insufficient credits are detected post-call but prevent transaction commit. The LLM call has already been made (token waste), but no billing records are persisted.

**Files:**

- `src/ports/accounts.port.ts` - Add recordLlmUsage interface
- `src/adapters/server/accounts/drizzle.adapter.ts` - Implement atomic operation
- `tests/unit/adapters/server/accounts/drizzle.adapter.spec.ts` - Test transaction behavior

**Notes:**

- debitForUsage becomes internal helper or deprecated for LLM billing
- Both llm_usage and credit_ledger get billing_account_id + virtual_key_id for consistent tracking

---

### 6.5.6 Wire Dual-Cost into Completion Flow

**Goal:** Update completion service to use pricing helpers and recordLlmUsage after LLM call.

**Flow:**

1. Call LiteLLM via LlmService
2. Extract from LlmService response:
   - modelId
   - promptTokens, completionTokens
   - providerCostUsd (from LiteLLM response cost)
3. Convert USD to credits: `provider_cost_credits = usdToCredits(providerCostUsd)`
4. Apply markup: `user_price_credits = calculateUserPriceCredits(provider_cost_credits, markupFactor)`
5. Assert `user_price_credits ≥ provider_cost_credits`
6. Call `AccountService.recordLlmUsage` with all fields

**Files:**

- `src/ports/llm.port.ts` - Update LlmService response to include providerCostUsd
- `src/adapters/server/ai/litellm.adapter.ts` - Extract cost from LiteLLM response
- `src/features/ai/services/completion.ts` - Add dual-cost calculation
- `tests/unit/features/ai/services/completion.test.ts` - Test profit invariant

**MVP Simplification:** Skip pre-call max-cost estimate initially; detect insufficient credits post-call (improve later)

---

### 6.5.7 Minimal Documentation Updates

**Goal:** Document dual-cost behavior concisely with pointers to implementation.

**Updates:**

- `docs/ACCOUNTS_DESIGN.md` - Add brief Stage 6.5 section: credit unit standard, profit invariant, flow pointer to pricing module + recordLlmUsage
- `docs/ACCOUNTS_API_KEY_ENDPOINTS.md` - Update completion endpoint: mention dual-cost computation and llm_usage recording

**Constraints:**

- Keep brief, no pseudocode
- Focus on pointers to files and high-level behavior

---

## Stage 7 – Payments Integration (Resmic MVP)

**Core Role:** Resmic is the OSS crypto billing layer we use as the default way real users convert USDC → credits.

**High-Level Flow:**

1. Users pay in USDC via Resmic checkout/widget
2. Resmic sends signed webhook to our app
3. Webhook handler resolves billing_account_id, converts USDC amount → credits using CREDITS_PER_USDC
4. Writes positive credit_ledger row with `reason='resmic_payment'` or `'onchain_deposit'`
5. Updates billing_accounts.balance_credits from ledger

**Stage 7 Context:** This is part of the overall MVP loop (real money in → credits). It builds on Stage 6.5's dual-cost accounting without modifying the billing mechanics.

**Implementation Details:** Endpoint definitions, Resmic SDK integration, webhook signature validation, and routing are defined in the payments spec.

**Reference:** See `docs/PAYMENTS_RESMIC.md` for MVP funding path details (webhook endpoints, SDK setup, testing).

---

## Future Work

**Deferred beyond MVP:**

- Pre-call max-cost estimation and 402 without calling LLM
- Reconciliation scripts and monitoring dashboards
- credit_holds table for soft reservations

---

## Success Criteria

**Verification:**

- Single SQL query against llm_usage shows provider_cost_credits and user_price_credits per request
- Aggregate query computes total provider costs vs total user revenue over period
- Code enforces user_price_credits ≥ provider_cost_credits on every call
- All credits stored as BIGINT with 1 credit = $0.001 invariant respected
- Provider cost comes from LiteLLM's response cost, not from local model pricing map
- llm_usage rows can be joined with LiteLLM logs by requestId to cross-check costs
