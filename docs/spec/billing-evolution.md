---
id: billing-evolution-spec
type: spec
title: "Billing Evolution: Dual-Cost Accounting"
status: active
spec_state: draft
trust: draft
summary: Profit-enforcing billing with LiteLLM-sourced provider costs, credit unit standard, and idempotent charge receipts.
read_when: Working on billing, credit charges, pricing policy, or the charge_receipts table.
owner: derekg1729
created: 2026-02-06
verified: 2026-02-06
tags: [billing]
---

# Billing Evolution: Dual-Cost Accounting

## Context

Extends accounts design with profit-enforcing billing and provider cost tracking. LiteLLM is the cost oracle; our system applies markup and stores idempotent charge receipts.

**Related docs:**

- System architecture: [ACCOUNTS_DESIGN.md](../ACCOUNTS_DESIGN.md)
- API contracts: [ACCOUNTS_API_KEY_ENDPOINTS.md](../ACCOUNTS_API_KEY_ENDPOINTS.md)
- Wallet integration: [INTEGRATION_WALLETS_CREDITS.md](../INTEGRATION_WALLETS_CREDITS.md)
- Usage/Activity Design: [Activity Metrics](./activity-metrics.md)
- Graph Execution & Idempotency: [GRAPH_EXECUTION.md](../GRAPH_EXECUTION.md)

## Goal

Single-path billing where LiteLLM provides provider cost, our system applies markup, and charge receipts are immutable audit records with idempotency guarantees.

## Non-Goals

- Hardcoded per-model USD pricing tables (LiteLLM is the oracle)
- Blocking user responses during post-call billing
- Credit holds / soft reservations (deferred, tracked in ini.payments-enhancements.md)

## Core Invariants

1. **CREDIT_UNIT_STANDARD**: 1 credit = $0.0000001 USD. `CREDITS_PER_USD = 10_000_000` is a protocol constant (hardcoded, not configurable). All balances stored as BIGINT integers.

2. **LITELLM_COST_ORACLE**: LiteLLM computes per-request cost via `x-litellm-response-cost` header (non-streaming) or `usage.cost` in final usage event (streaming). We do NOT maintain hardcoded per-model pricing tables.

3. **SINGLE_BILLING_PATH**: `providerCostUsd → userCostUsd = providerCostUsd × MARKUP_FACTOR → chargedCredits = ceil(userCostUsd × CREDITS_PER_USD)`. Single entry point: `calculateLlmUserCharge()`.

4. **IDEMPOTENT_CHARGE_RECEIPTS**: `UNIQUE(source_system, source_reference)` is the idempotency constraint. Multiple receipts per `request_id` allowed (graphs make N LLM calls). Each receipt maps to a `credit_ledger` entry.

5. **USER_COST_NOT_PROVIDER_COST**: `response_cost_usd` stores USER cost (with markup), not provider cost.

6. **POST_CALL_NEVER_BLOCKS**: Post-call billing NEVER throws `InsufficientCreditsPortError`. If balance goes negative, log critical but complete the write. Overage handled in reconciliation.

## Schema

**Table:** `charge_receipts`

Minimal audit-focused table. LiteLLM is canonical for telemetry.

| Column               | Type         | Purpose                                                  |
| -------------------- | ------------ | -------------------------------------------------------- |
| `request_id`         | text         | Server-generated UUID, correlation key (not unique)      |
| `billing_account_id` | text         | FK to billing_accounts                                   |
| `virtual_key_id`     | uuid         | FK to virtual_keys                                       |
| `litellm_call_id`    | text NULL    | Forensic correlation (x-litellm-call-id)                 |
| `charged_credits`    | bigint       | Credits debited from user balance                        |
| `response_cost_usd`  | decimal NULL | Observational USD cost (with markup)                     |
| `provenance`         | text         | `stream` \| `response`                                   |
| `charge_reason`      | text         | Economic category (`llm_usage`, etc.)                    |
| `source_system`      | text         | External system (`litellm`, `anthropic_sdk`)             |
| `source_reference`   | text         | Idempotency key: `${run_id}/${attempt}/${usage_unit_id}` |
| `run_id`             | text         | Graph run identifier (P0: added for run-centric billing) |
| `attempt`            | int          | Retry attempt (P0: frozen at 0)                          |
| `created_at`         | timestamptz  |                                                          |

**Credit Unit Standard:**

| Value             | Constant                                                        |
| ----------------- | --------------------------------------------------------------- |
| 1 credit          | $0.0000001 USD                                                  |
| 1 USD             | 10,000,000 credits                                              |
| 1 USDC            | 10,000,000 credits                                              |
| Protocol constant | `CREDITS_PER_USD = 10_000_000` in `src/core/billing/pricing.ts` |
| Default markup    | 2.0× (100% markup = 50% margin)                                 |

## Design

### Post-Call Billing (Non-Blocking)

Per [Activity Metrics](./activity-metrics.md), post-call billing NEVER throws `InsufficientCreditsPortError`.

**Flow:**

1. **Preflight** (blocking): estimate cost, check balance, DENY if insufficient
2. **Call LiteLLM** via LlmService
3. **Extract cost** from `x-litellm-response-cost` header or `usage.cost` event
4. **Calculate chargedCredits** via `calculateLlmUserCharge()`
5. **Write atomically**: `recordChargeReceipt()` (non-blocking, never throws InsufficientCredits)
6. **Return response** to user (NEVER blocked by post-call billing)

If balance goes negative, log critical but complete the write. Overage handled in reconciliation.

### Environment Configuration

| Variable                   | Purpose                  | Example |
| -------------------------- | ------------------------ | ------- |
| `USER_PRICE_MARKUP_FACTOR` | Profit markup multiplier | `2.0`   |

Protocol constant `CREDITS_PER_USD = 10_000_000` is NOT configurable (hardcoded).

### Known Issues (Resolved)

- [x] **Table rename done.** `llm_usage` → `charge_receipts`

### File Pointers

| File                                              | Purpose                                              |
| ------------------------------------------------- | ---------------------------------------------------- |
| `src/core/billing/pricing.ts`                     | Protocol constants, conversion helpers               |
| `src/features/ai/services/llmPricingPolicy.ts`    | Markup policy layer (reads USER_PRICE_MARKUP_FACTOR) |
| `src/shared/db/schema.billing.ts`                 | `charge_receipts` table                              |
| `src/ports/accounts.port.ts`                      | `recordChargeReceipt` interface                      |
| `src/adapters/server/accounts/drizzle.adapter.ts` | Atomic charge receipt + ledger debit                 |
| `src/features/ai/services/completion.ts`          | Preflight gating + non-blocking post-call billing    |

## Acceptance Checks

**Invariants to verify:**

- 1 credit = $0.0000001 (protocol constant)
- `response_cost_usd` stores user cost (with markup), not provider cost
- Single ceil at end: `chargedCredits = ceil(userCostUsd × CREDITS_PER_USD)`
- Post-call billing NEVER blocks user response
- Idempotency via `UNIQUE(source_system, source_reference)` — see [GRAPH_EXECUTION.md](../GRAPH_EXECUTION.md)

**Verification:**

```sql
SELECT charged_credits, response_cost_usd FROM charge_receipts;
```

Cost source: LiteLLM `usage.cost` (stream) or `x-litellm-response-cost` header (non-stream).

## Open Questions

_(none — planned work tracked in ini.payments-enhancements.md: pre-call max-cost estimation, reconciliation scripts, credit_holds table, on-chain watcher, cents sprawl cleanup, conservative pre-call estimate tuning)_

## Related

- [Activity Metrics](./activity-metrics.md)
- [GRAPH_EXECUTION.md](../GRAPH_EXECUTION.md)
- [ACCOUNTS_DESIGN.md](../ACCOUNTS_DESIGN.md)
