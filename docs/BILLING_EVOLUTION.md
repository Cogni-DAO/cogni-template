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

- [x] **Goal:** Change billing_accounts.balance_credits and credit_ledger.amount to BIGINT, reset balances to 0 for pre-launch clean slate.

- **Files:**
  - [x] `src/shared/db/migrations/*_integer_credits.sql` - ALTER TABLE to BIGINT, reset to 0
  - [x] `src/shared/db/schema.ts` - Update type definitions to BIGINT

**Notes:**

- Pre-launch reset acceptable (no real user funds exist yet)
- Update test fixtures to use integer credit values

---

### 6.5.2 Add llm_usage Table (Charge Receipts)

- [x] **Goal:** Minimal audit-focused charge receipt table. LiteLLM is canonical for telemetry.

- **Schema (Minimal):** id, billing_account_id, virtual_key_id, request_id (unique, idempotency key), litellm_call_id (forensic), charged_credits, response_cost_usd (observational), provenance, created_at

**Design:** Per ACTIVITY_METRICS.md, no model/tokens/usage JSONB stored locally. Query LiteLLM /spend/logs for telemetry.

- **Files:**
  - [x] `src/adapters/server/db/migrations/0000_*.sql` - Consolidated migration (single squashed)
  - [x] `src/shared/db/schema.billing.ts` - llmUsage as charge_receipt table

**Notes:**

- `request_id` is PRIMARY KEY for idempotent inserts
- `litellm_call_id` captures `x-litellm-call-id` header for forensic correlation
- `provenance` indicates source: "response" | "stream"

---

### 6.5.3 Environment Configuration

- [x] **Goal:** Configure markup factor and credit unit conversion via environment variables.

- **Variables:**
  - [x] `USER_PRICE_MARKUP_FACTOR=2.0` - Profit markup (2.0 = 50% margin)
  - [x] `CREDITS_PER_USDC=1000` - Credit unit conversion

- **Files:**
  - [x] `.env.example` - Add both variables
  - [x] `src/shared/env/server.ts` - Add Zod validation (min/max ranges)

---

### 6.5.4 Pricing Helpers

- [x] **Goal:** Provide pure conversion functions for USD → credits and markup application.

**Responsibilities:**

- `usdToCredits(usd, creditsPerUsd)`: Convert USD cost to BIGINT credits using provided conversion rate (Math.ceil)
- `calculateUserPriceCredits(providerCostCredits, markupFactor)`: Apply markup to CREDITS and round up (Math.ceil)

- **Files:**
  - [x] `src/core/billing/pricing.ts` - Conversion helpers
  - [x] `tests/unit/core/billing/pricing.test.ts` - Test conversions and rounding

**Constraints:**

- These helpers do NOT contain model-specific pricing data
- All USD costs come from LiteLLM's response, not computed locally
- Conversion rate is passed as parameter to maintain core layer purity (no env dependencies)

---

### 6.5.5 Atomic Billing Operation (Non-Blocking Post-Call)

- [x] **Goal:** Single AccountService method that records charge receipt and debits credits atomically, but NEVER blocks post-call.

- [x] **New Port Method:** `recordChargeReceipt(ChargeReceiptParams)` with minimal fields: billingAccountId, virtualKeyId, requestId, chargedCredits, responseCostUsd, litellmCallId, provenance

**Parameters:** `chargedCredits` is pre-computed by completion service using LiteLLM response cost and pricing helpers. No pricing logic in adapter.

**Implementation:** Single DB transaction that:

1. Inserts llm_usage (charge receipt) row with idempotent ON CONFLICT DO NOTHING
2. Inserts credit_ledger debit row (amount = -chargedCredits)
3. Updates billing_accounts.balance_credits
4. Logs critical if balance goes negative but COMPLETES the write (no rollback)

**Key Invariant (per ACTIVITY_METRICS.md):** Post-call billing NEVER throws InsufficientCreditsPortError. Overage is handled in reconciliation, not by blocking user response.

- **Files:**
  - [x] `src/ports/accounts.port.ts` - recordChargeReceipt interface (ChargeReceiptParams)
  - [x] `src/adapters/server/accounts/drizzle.adapter.ts` - Implement non-blocking atomic operation
  - [x] `tests/unit/adapters/server/accounts/drizzle.adapter.spec.ts` - Test transaction behavior

**Notes:**

- Pre-flight gating uses `getBalance` + estimate before LLM call
- Post-call `recordChargeReceipt` is best-effort, never blocks response

---

### 6.5.6 Wire Charge Receipts into Completion Flow

- [x] **Goal:** Update completion service to calculate chargedCredits and call recordChargeReceipt after LLM call.

**Flow:**

1. Pre-flight: estimate cost, check balance, DENY if insufficient (InsufficientCreditsPortError)
2. Call LiteLLM via LlmService
3. Extract from LlmService response:
   - providerCostUsd (from `x-litellm-response-cost` header)
   - litellmCallId (from `x-litellm-call-id` header for forensics)
4. Calculate chargedCredits: `usdToCredits(providerCostUsd) × USER_PRICE_MARKUP_FACTOR`
5. Call `AccountService.recordChargeReceipt` (non-blocking, never throws)
6. Return response to user (NEVER blocked by post-call billing)

- **Files:**
  - [x] `src/ports/llm.port.ts` - LlmService response includes providerCostUsd, litellmCallId
  - [x] `src/adapters/server/ai/litellm.adapter.ts` - Extract cost + call ID from headers
  - [x] `src/features/ai/services/completion.ts` - Preflight gating + non-blocking post-call billing
  - [x] `tests/unit/features/ai/services/completion.test.ts` - Test non-blocking behavior

**Design:** Pre-call uses conservative estimate. Post-call uses actual LiteLLM cost. See ACTIVITY_METRICS.md for full design.

---

### 6.5.7 Documentation Updates

- [x] **Goal:** Document charge receipt model and point to ACTIVITY_METRICS.md as canonical design.

- **Updates:**
  - [x] `docs/ACTIVITY_METRICS.md` - Canonical design doc for minimal charge receipts, LiteLLM-as-canonical telemetry
  - [x] `docs/BILLING_EVOLUTION.md` - Updated Stage 6.5 to reflect charge_receipt model
  - [ ] `docs/ACCOUNTS_DESIGN.md` - Update Credits DOWN section to reference recordChargeReceipt
  - [ ] `docs/ACCOUNTS_API_KEY_ENDPOINTS.md` - Update completion flow to mention recordChargeReceipt

**Canonical Reference:** See `docs/ACTIVITY_METRICS.md` for full design rationale and invariants.

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

- Single SQL query against llm_usage (charge_receipt) shows chargedCredits per request
- All credits stored as BIGINT with 1 credit = $0.001 invariant respected
- Provider cost comes from LiteLLM's `x-litellm-response-cost` header
- llm_usage rows can be joined with LiteLLM logs by requestId (litellm_call_id) for forensic correlation
- Post-call billing NEVER blocks user response (non-blocking invariant)
- LiteLLM `/spend/logs` is canonical source for usage telemetry (model, tokens, cost breakdown)
