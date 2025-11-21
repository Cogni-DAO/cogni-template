# Billing Evolution: Dual-Cost Accounting Implementation

Extends the accounts system defined in [ACCOUNTS_DESIGN.md](ACCOUNTS_DESIGN.md) with profit-enforcing billing and provider cost tracking.

**Context:**

- System architecture: [ACCOUNTS_DESIGN.md](ACCOUNTS_DESIGN.md)
- API contracts: [ACCOUNTS_API_KEY_ENDPOINTS.md](ACCOUNTS_API_KEY_ENDPOINTS.md)
- Wallet integration: [INTEGRATION_WALLETS_CREDITS.md](INTEGRATION_WALLETS_CREDITS.md)

---

## Stage 6.5 – Dual-Cost Accounting & Profit Margin

**Core Goal:** Per LLM call, compute `provider_cost_credits` from tokens + model pricing, compute `user_price_credits = ceil(provider_cost_credits × USER_PRICE_MARKUP_FACTOR)`, enforce `user_price_credits ≥ provider_cost_credits`, and atomically record both alongside a debit in integer credits.

**Credit Unit Standard:**

- 1 credit = $0.001 USD
- 1 USDC = 1,000 credits
- All balances stored as BIGINT integers
- Default markup: 2.0× (100% markup = 50% margin)

---

### 6.5.1 Migrate Credits to Integer Units

**Goal:** Change accounts.balance_credits and credit_ledger.delta to BIGINT, reset balances to 0 for pre-launch clean slate.

**Files:**

- `drizzle/migrations/0001_integer_credits.sql` - ALTER TABLE to BIGINT, reset to 0
- `src/shared/db/schema.ts` - Update type definitions to BIGINT

**Notes:**

- Pre-launch reset acceptable (no real user funds exist yet)
- Update test fixtures to use integer credit values

---

### 6.5.2 Add llm_usage Table

**Goal:** Track provider_cost_credits and user_price_credits per call for audit and profit verification.

**Schema:** id, account_id, request_id, model, prompt_tokens, completion_tokens, provider_cost_credits (BIGINT), user_price_credits (BIGINT), markup_factor_applied, created_at

**Files:**

- `drizzle/migrations/0002_llm_usage_tracking.sql` - CREATE TABLE with indexes
- `src/shared/db/schema.ts` - Add llmUsage table definition

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

### 6.5.4 Provider Pricing Module

**Goal:** Compute provider_cost_credits from token usage and model pricing; compute user_price_credits with markup.

**Responsibilities:**

- PROVIDER_PRICING map: minimal set of supported models with USD rates per million tokens
- calculateProviderCost(): tokens → credits (Math.ceil)
- calculateUserPrice(): provider cost → user price with markup (Math.ceil)
- Throw error for unknown models (no guessing)

**Files:**

- `src/core/billing/pricing.ts` - Rewrite with provider pricing table
- `tests/unit/core/billing/pricing.test.ts` - Test calculations

**Constraints:**

- Read CREDITS_PER_USDC from env, do not hardcode
- Support only models actually used in production initially

---

### 6.5.5 Atomic Billing Operation

**Goal:** Single AccountService method that records llm_usage and debits user_price_credits in one transaction.

**New Port Method:** `recordLlmUsage(accountId, requestId, model, tokens, provider_cost_credits, user_price_credits, markup_factor)`

**Implementation:** Single DB transaction inserting llm_usage row, credit_ledger debit, updating accounts.balance_credits, enforcing non-negative balance

**Files:**

- `src/ports/accounts.port.ts` - Add recordLlmUsage interface
- `src/adapters/server/accounts/drizzle.adapter.ts` - Implement atomic operation
- `tests/unit/adapters/server/accounts/drizzle.adapter.spec.ts` - Test transaction rollback

**Notes:**

- debitForUsage becomes internal helper or deprecated for LLM billing

---

### 6.5.6 Wire Dual-Cost into Completion Flow

**Goal:** Update completion service to use pricing module and recordLlmUsage after LLM call.

**Flow:**

1. Call LiteLLM
2. Extract modelId, promptTokens, completionTokens from response
3. Calculate provider cost and user price
4. Assert user_price ≥ provider_cost
5. Call AccountService.recordLlmUsage with all fields

**Files:**

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

## Out of Scope (Future Work)

**Deferred to later stages:**

- Pre-call max-cost estimation and 402 without calling LLM
- Reconciliation scripts and monitoring dashboards
- On-chain payment watchers and Resmic integration
- credit_holds table for soft reservations
- Complex historical balance migrations (using pre-launch reset instead)

---

## Success Criteria

**Verification queries:**

- Single SQL query against llm_usage shows provider_cost_credits and user_price_credits per request
- Aggregate query computes total provider costs vs total user revenue over period
- Code enforces user_price_credits ≥ provider_cost_credits on every call
- All credits stored as BIGINT with 1 credit = $0.001 invariant respected
