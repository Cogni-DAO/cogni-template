# Billing Evolution: Dual-Cost Accounting Implementation

Extends the accounts system defined in [ACCOUNTS_DESIGN.md](ACCOUNTS_DESIGN.md) with profit-enforcing billing and provider cost tracking.

**Stage 6.5 applies after the Auth.js + billing_accounts + virtual_keys MVP is in place; it does not change auth, only how we compute and store costs for each LLM call.**

**Context:**

- System architecture: [ACCOUNTS_DESIGN.md](ACCOUNTS_DESIGN.md)
- API contracts: [ACCOUNTS_API_KEY_ENDPOINTS.md](ACCOUNTS_API_KEY_ENDPOINTS.md)
- Wallet integration: [INTEGRATION_WALLETS_CREDITS.md](INTEGRATION_WALLETS_CREDITS.md)
- Payments (MVP funding): [DEPAY_PAYMENTS.md](DEPAY_PAYMENTS.md)

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

Credits increase via positive entries in credit_ledger (e.g., from the widget confirm endpoint or future webhooks/admin tools).

---

### 6.5.1 Migrate Credits to Integer Units

- [ ] **Goal:** Change billing_accounts.balance_credits and credit_ledger.amount to BIGINT, reset balances to 0 for pre-launch clean slate.

- **Files:**
  - [ ] `src/shared/db/migrations/*_integer_credits.sql` - ALTER TABLE to BIGINT, reset to 0
  - [x] `src/shared/db/schema.ts` - Update type definitions to BIGINT

**Notes:**

- Pre-launch reset acceptable (no real user funds exist yet)
- Update test fixtures to use integer credit values

---

### 6.5.2 Add llm_usage Table

- [ ] **Goal:** Track provider_cost_credits and user_price_credits per call for audit and profit verification.

- **Schema:** id, billing_account_id (FK → billing_accounts.id), virtual_key_id (FK → virtual_keys.id), request_id, model, prompt_tokens, completion_tokens, provider_cost_credits (BIGINT), user_price_credits (BIGINT), markup_factor_applied, created_at

**Cost Semantics:**

- `provider_cost_credits = ceil(LiteLLM_response_cost_usd × CREDITS_PER_USDC)`
- `user_price_credits = ceil(provider_cost_credits × USER_PRICE_MARKUP_FACTOR)`
- Model and token fields are for audit/analysis only, not cost calculation

- **Files:**
  - [ ] `src/shared/db/migrations/*_llm_usage_tracking.sql` - CREATE TABLE with indexes
  - [ ] `src/shared/db/schema.ts` - Add llmUsage table definition

**Notes:**

- Mirrors credit_ledger by linking both billing_account_id and virtual_key_id
- Enables tracking which specific virtual key generated each LLM call
- LiteLLM maintains its own spend logs; llm_usage is our app-local mirror keyed by billing_account_id + request_id

---

### 6.5.3 Environment Configuration

- [ ] **Goal:** Configure markup factor and credit unit conversion via environment variables.

- **Variables:**
  - [ ] `USER_PRICE_MARKUP_FACTOR=2.0` - Profit markup (2.0 = 50% margin)
  - [ ] `CREDITS_PER_USDC=1000` - Credit unit conversion

- **Files:**
  - [ ] `.env.example` - Add both variables
  - [ ] `src/shared/env/server.ts` - Add Zod validation (min/max ranges)

---

### 6.5.4 Pricing Helpers

- [ ] **Goal:** Provide pure conversion functions for USD → credits and markup application.

**Responsibilities:**

- `usdToCredits(usd)`: Convert USD cost to BIGINT credits using CREDITS_PER_USDC from env
- `calculateUserPriceCredits(providerCostCredits, markupFactor)`: Apply markup and round up (Math.ceil)

- **Files:**
  - [ ] `src/core/billing/pricing.ts` - Pure conversion helpers only
  - [ ] `tests/unit/core/billing/pricing.test.ts` - Test conversions and rounding
  - [ ] `src/shared/env/server.ts` - CREDITS_PER_USDC validation

**Constraints:**

- These helpers do NOT contain model-specific pricing data
- All USD costs come from LiteLLM's response, not computed locally
- Read CREDITS_PER_USDC from env, do not hardcode

---

### 6.5.5 Atomic Billing Operation

- [ ] **Goal:** Single AccountService method that records llm_usage and debits user_price_credits in one transaction.

- [ ] **New Port Method:** `recordLlmUsage(billingAccountId, virtualKeyId, requestId, model, promptTokens, completionTokens, providerCostCredits, userPriceCredits, markupFactorApplied)`

**Parameters:** All cost values (providerCostCredits, userPriceCredits) are pre-computed by completion service using LiteLLM response cost and pricing helpers. No pricing logic in adapter.

**Implementation:** Single DB transaction that:

1. Inserts llm_usage row with all fields
2. Inserts credit_ledger debit row (amount = -userPriceCredits, billing_account_id, virtual_key_id)
3. Updates billing_accounts.balance_credits
4. Checks if resulting balance would be negative
5. If negative: throws InsufficientCreditsError and rolls back entire transaction (no llm_usage, no ledger entry, no balance change)

**Balance Invariant:** Balances remain non-negative. Insufficient credits are detected post-call but prevent transaction commit. The LLM call has already been made (token waste), but no billing records are persisted.

- **Files:**
  - [ ] `src/ports/accounts.port.ts` - Add recordLlmUsage interface
  - [ ] `src/adapters/server/accounts/drizzle.adapter.ts` - Implement atomic operation
  - [ ] `tests/unit/adapters/server/accounts/drizzle.adapter.spec.ts` - Test transaction behavior

**Notes:**

- debitForUsage becomes internal helper or deprecated for LLM billing
- Both llm_usage and credit_ledger get billing_account_id + virtual_key_id for consistent tracking

---

### 6.5.6 Wire Dual-Cost into Completion Flow

- [ ] **Goal:** Update completion service to use pricing helpers and recordLlmUsage after LLM call.

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

- **Files:**
  - [ ] `src/ports/llm.port.ts` - Update LlmService response to include providerCostUsd
  - [ ] `src/adapters/server/ai/litellm.adapter.ts` - Extract cost from LiteLLM response
  - [ ] `src/features/ai/services/completion.ts` - Add dual-cost calculation
  - [ ] `tests/unit/features/ai/services/completion.test.ts` - Test profit invariant

**Current Guard (MVP+):** Pre-call balance check uses a conservative estimate (prompt chars ÷ 4 + max completion tokens) to block zero/low balances before contacting the provider. Post-call debit is best-effort and does not block the response if it fails for insufficient credits. Replace this heuristic with configurable, per-model pricing once provider costs are wired.

---

### 6.5.7 Minimal Documentation Updates

- [ ] **Goal:** Document dual-cost behavior concisely with pointers to implementation.

- **Updates:**
  - [ ] `docs/ACCOUNTS_DESIGN.md` - Add brief Stage 6.5 section: credit unit standard, profit invariant, flow pointer to pricing module + recordLlmUsage
  - [ ] `docs/ACCOUNTS_API_KEY_ENDPOINTS.md` - Update completion endpoint: mention dual-cost computation and llm_usage recording

**Constraints:**

- Keep brief, no pseudocode
- Focus on pointers to files and high-level behavior

---

## Stage 7 – On-Chain Watcher & Reconciliation (Ponder, Post-MVP)

- [ ] **Goal:** Introduce a separate on-chain indexer (Ponder) that watches the DAO wallet on Base/Base Sepolia for USDC transfers and provides an independent view of funds received for reconciliation and fraud detection.

**MVP Status:** NOT used in the crediting critical path. MVP credits are granted via `POST /api/v1/payments/credits/confirm` (session-authenticated; see `docs/DEPAY_PAYMENTS.md`). Ponder is initially used for observability and reconciliation only.

**High-Level Behavior:**

1. **Indexing:** Ponder runs as a separate Docker service, connects to Base/Base Sepolia RPC, and indexes ERC20 Transfer events for USDC into the DAO wallet address.
2. **Storage:** For each confirmed transfer (after N block confirmations), Ponder writes `{ tx_hash, chain_id, from, to, token_contract, amount, block_number, timestamp }` to its own Postgres database in an `onchain_payments` table.
3. **Reconciliation (Phase 1, Post-MVP):** Our app periodically queries Ponder (via GraphQL/SQL/HTTP) to compare `onchain_payments` totals vs `credit_ledger` rows where `reason IN ('widget_payment', 'onchain_deposit')`. Discrepancies are logged and surfaced to ops; no automatic blocking.
4. **Stronger Guarantees (Phase 2, Future):** For large payments or high-risk accounts, require a matching `onchain_payments` row before marking credits as fully settled (will require capturing tx_hash on the frontend, provided by DePay widget).

**Implementation Details:** Runtime topology, Ponder indexing configuration, integration phases, and security model are defined in `docs/PAYMENTS_PONDER_VERIFICATION.md`.

**Reference:** See `docs/PAYMENTS_PONDER_VERIFICATION.md` for full Ponder spec.

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
