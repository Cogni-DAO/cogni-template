# Billing Evolution: Dual-Cost Accounting

Extends [ACCOUNTS_DESIGN.md](ACCOUNTS_DESIGN.md) with profit-enforcing billing and provider cost tracking.

**Related docs:**

- System architecture: [ACCOUNTS_DESIGN.md](ACCOUNTS_DESIGN.md)
- API contracts: [ACCOUNTS_API_KEY_ENDPOINTS.md](ACCOUNTS_API_KEY_ENDPOINTS.md)
- Wallet integration: [INTEGRATION_WALLETS_CREDITS.md](INTEGRATION_WALLETS_CREDITS.md)
- Payments (MVP funding): [DEPAY_PAYMENTS.md](DEPAY_PAYMENTS.md)
- Usage/Activity Design: [ACTIVITY_METRICS.md](ACTIVITY_METRICS.md)

---

## Core Billing Invariants

### Credit Unit Standard

| Value             | Constant                                                        |
| ----------------- | --------------------------------------------------------------- |
| 1 credit          | $0.0000001 USD                                                  |
| 1 USD             | 10,000,000 credits                                              |
| 1 USDC            | 10,000,000 credits                                              |
| Protocol constant | `CREDITS_PER_USD = 10_000_000` in `src/core/billing/pricing.ts` |
| Default markup    | 2.0× (100% markup = 50% margin)                                 |

All balances stored as BIGINT integers in the database.

### Provider Cost Source

- LiteLLM computes per-request cost and exposes it via:
  - `x-litellm-response-cost` header (non-streaming)
  - `usage.cost` in final usage event (streaming with `include_cost_in_streaming_usage: true`)
- Our code converts that USD cost → `chargedCredits` (with markup)
- We do NOT maintain hardcoded per-model USD pricing tables; LiteLLM is the oracle

### Single Billing Path

```
providerCostUsd (from LiteLLM)
    → userCostUsd = providerCostUsd × MARKUP_FACTOR
    → chargedCredits = ceil(userCostUsd × CREDITS_PER_USD)
```

Single entry point: `calculateLlmUserCharge()` in `src/core/billing/pricing.ts`

---

## Key Files

| File                                              | Purpose                                              |
| ------------------------------------------------- | ---------------------------------------------------- |
| `src/core/billing/pricing.ts`                     | Protocol constants, conversion helpers               |
| `src/features/ai/services/llmPricingPolicy.ts`    | Markup policy layer (reads USER_PRICE_MARKUP_FACTOR) |
| `src/shared/db/schema.billing.ts`                 | `llm_usage` table (charge receipts)                  |
| `src/ports/accounts.port.ts`                      | `recordChargeReceipt` interface                      |
| `src/adapters/server/accounts/drizzle.adapter.ts` | Atomic charge receipt + ledger debit                 |
| `src/features/ai/services/completion.ts`          | Preflight gating + non-blocking post-call billing    |

---

## Charge Receipt Table (`llm_usage`)

Minimal audit-focused table. LiteLLM is canonical for telemetry.

**Schema:**

| Column               | Type         | Purpose                                  |
| -------------------- | ------------ | ---------------------------------------- |
| `request_id`         | text UNIQUE  | Server-generated UUID, idempotency key   |
| `billing_account_id` | text         | FK to billing_accounts                   |
| `virtual_key_id`     | uuid         | FK to virtual_keys                       |
| `litellm_call_id`    | text NULL    | Forensic correlation (x-litellm-call-id) |
| `charged_credits`    | bigint       | Credits debited from user balance        |
| `response_cost_usd`  | decimal NULL | Observational USD cost from LiteLLM      |
| `provenance`         | text         | `stream` \| `response`                   |
| `created_at`         | timestamptz  |                                          |

**Invariants:**

- `request_id` is PRIMARY KEY for idempotency
- Each receipt maps 1:1 to a `credit_ledger` entry with `reference = request_id`
- `response_cost_usd` stores USER cost (with markup), not provider cost

---

## Post-Call Billing (Non-Blocking)

Per [ACTIVITY_METRICS.md](ACTIVITY_METRICS.md), post-call billing NEVER throws `InsufficientCreditsPortError`.

**Flow:**

1. **Preflight** (blocking): estimate cost, check balance, DENY if insufficient
2. **Call LiteLLM** via LlmService
3. **Extract cost** from `x-litellm-response-cost` header or `usage.cost` event
4. **Calculate chargedCredits** via `calculateLlmUserCharge()`
5. **Write atomically**: `recordChargeReceipt()` (non-blocking, never throws InsufficientCredits)
6. **Return response** to user (NEVER blocked by post-call billing)

If balance goes negative, log critical but complete the write. Overage handled in reconciliation.

---

## Environment Configuration

| Variable                   | Purpose                  | Example |
| -------------------------- | ------------------------ | ------- |
| `USER_PRICE_MARKUP_FACTOR` | Profit markup multiplier | `2.0`   |

Protocol constant `CREDITS_PER_USD = 10_000_000` is NOT configurable (hardcoded).

---

## Known Issues

- [ ] **Activity reporting shows zeros.** Activity metrics page shows zeros despite real usage. Need to join `charged_credits` from `llm_usage` with LiteLLM telemetry by `litellm_call_id`.
- [ ] **Cents sprawl across codebase.** 126+ references to "cents" in payment flows. Should standardize on USD only. Credits are canonical ledger unit; cents is unnecessary intermediate.
- [ ] **Pre-call estimate too conservative.** Uses `ESTIMATED_USD_PER_1K_TOKENS = $0.002` as upper-bound. May reject valid requests with sufficient balance.
- [ ] **Table rename pending.** `llm_usage` → `charge_receipt` (coordinated migration)

---

## Success Criteria

**Invariants:**

- 1 credit = $0.0000001 (protocol constant)
- `response_cost_usd` stores user cost (with markup), not provider cost
- Single ceil at end: `chargedCredits = ceil(userCostUsd × CREDITS_PER_USD)`
- Post-call billing NEVER blocks user response
- `llm_usage.request_id` = `credit_ledger.reference` (1:1 linkage)

**Verification:**

```sql
SELECT charged_credits, response_cost_usd FROM llm_usage;
```

Cost source: LiteLLM `usage.cost` (stream) or `x-litellm-response-cost` header (non-stream).

---

## Future Work (Deferred)

- Pre-call max-cost estimation and 402 without calling LLM
- Reconciliation scripts and monitoring dashboards
- `credit_holds` table for soft reservations
- On-chain watcher & reconciliation (Ponder)
