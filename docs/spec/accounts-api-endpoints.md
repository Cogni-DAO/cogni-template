---
id: spec.accounts-api-endpoints
type: spec
title: Accounts & LiteLLM Virtual Key Endpoints
status: draft
spec_state: draft
trust: draft
summary: MVP master-key-mode billing identity — how billing accounts, virtual key sentinels, and LiteLLM endpoints wire together for cost attribution
read_when: Working on billing, LiteLLM integration, or account provisioning
implements: []
owner: cogni-dev
created: 2025-12-15
verified: null
tags:
  - billing
  - litellm
  - accounts
---

# Accounts & LiteLLM Virtual Key Endpoints

## Context

Cogni uses LiteLLM Proxy for all LLM calls. In MVP, all calls authenticate with a single `LITELLM_MASTER_KEY` — per-user virtual keys are not yet generated. Cost attribution is achieved by passing `metadata.cogni_billing_account_id` in each LiteLLM request. The `virtual_keys` table stores a sentinel value `[master-key-mode]` for referential integrity with `charge_receipts`, not a real key.

Core loop: Auth.js session → `users` → `billing_accounts` → `virtual_keys` (ID only) → LiteLLM `/chat/completions` (with master key + user attribution).

## Goal

Document the current billing identity plumbing from authentication through LiteLLM cost attribution, including provisioning flow, endpoint contracts, and credit top-up mechanics.

## Non-Goals

- User-facing API key generation via `/key/generate` (see [ini.accounts-api-keys](../../work/initiatives/ini.accounts-api-keys.md) P3)
- Operator admin routes for account management (see initiative P3)
- LiteLLM Team grouping (not used in MVP)

---

## Core Invariants

1. **NO_USER_SECRETS_IN_APP_LAYER**: No per-user secrets flow through application layers. `LITELLM_MASTER_KEY` is accessed only at the adapter boundary. `virtual_keys` stores sentinels in MVP.

2. **MASTER_KEY_AT_BOUNDARY**: All LiteLLM calls use `LITELLM_MASTER_KEY` from server env. The key is never passed through service layers — only the adapter reads it.

3. **BILLING_ATTRIBUTION_VIA_METADATA**: User cost attribution uses `metadata.cogni_billing_account_id` in LiteLLM request body, not per-user keys.

---

## Design

### Core Concepts

- **Auth.js user** — Identity row in Auth.js `users` table, created via SIWE (wallet login). Represents identity and session ownership.
- **Billing account** — Row in `billing_accounts` (our table). Represents a billing tenant and owns LiteLLM virtual keys.
- **Virtual key** — Row in `virtual_keys`. In MVP, stores sentinel `[master-key-mode]` (not a real key) plus flags (`is_default`, `active`, label). Exists for referential integrity with `charge_receipts`.
- **LiteLLM master key** — The Proxy admin key (`LITELLM_MASTER_KEY`) used for all LiteLLM calls in MVP. Accessed only at the adapter boundary.
- **LlmCaller** — Internal type `{ billingAccountId; virtualKeyId }` constructed server-side. Contains only IDs, no secrets. The adapter reads `LITELLM_MASTER_KEY` from env.

See also: [ACCOUNTS_DESIGN.md](./accounts-design.md) "Three-Layer Identity System" for complete architecture.

### LiteLLM Endpoint: Chat Completions (Data Plane)

- **Endpoint:** `POST /chat/completions`
- **Auth:** `Authorization: Bearer <LITELLM_MASTER_KEY>` (master key mode in MVP)
- **User Attribution:** `metadata.cogni_billing_account_id` in request body

Cogni calls this endpoint from the `LlmService` adapter using `LITELLM_MASTER_KEY` from environment. We extract `x-litellm-response-cost` and `x-litellm-call-id` headers for billing. LiteLLM is canonical for usage telemetry; we store only minimal charge receipts locally.

### MVP Provisioning Flow (Master Key Mode)

MVP does not expose any account/key management HTTP endpoints. All provisioning happens inside a single helper:

- **Module:** `src/lib/auth/mapping.ts`
- **Function:** `getOrCreateBillingAccountForUser(user)`

**Behavior:**

1. **Input:** Auth.js `user` object (from `auth()`), includes wallet address from SIWE.
2. **Look up** existing `billing_accounts` row where `owner_user_id = user.id`.
3. **If none exists:**
   - Create `billing_accounts` row (`owner_user_id = user.id`, `balance_credits = 0`)
   - Insert `virtual_keys` row with sentinel (`litellm_virtual_key = '[master-key-mode]'`, `is_default = true`, `active = true`, `label = 'Default'`)
   - No LiteLLM `/key/generate` call.
4. **Return:** `{ billingAccountId, defaultVirtualKeyId }` (no key string — master key mode).

All subsequent LLM calls for this user use `LITELLM_MASTER_KEY` with `billingAccountId` in metadata for cost attribution.

### HTTP Endpoints

**`POST /api/v1/ai/completion`** (Data Plane):

- Auth: Auth.js session only (HttpOnly cookie). No API key in the request.
- Flow:
  1. `auth()` → require `session.user` (wallet login)
  2. `getOrCreateBillingAccountForUser(session.user)` → `{ billingAccountId, defaultVirtualKeyId }`
  3. Pre-flight: estimate cost, check balance via `getBalance`, DENY if insufficient
  4. LiteLLM `POST /chat/completions` with `Authorization: Bearer <LITELLM_MASTER_KEY>` and `metadata.cogni_billing_account_id`
  5. Extract `x-litellm-response-cost` and `x-litellm-call-id` headers
  6. `recordChargeReceipt` (non-blocking)
  7. Return response to user (NEVER blocked by post-call billing)

**`POST /api/v1/payments/credits/confirm`** (Payments):

- Auth: Auth.js session only (HttpOnly cookie).
- Flow: Client calls after payment widget success (DePay `succeeded` event) with `{ amountUsdCents, clientPaymentId, metadata }` → server resolves billing account from session → idempotent ledger write (`reason = 'widget_payment'`, `reference = clientPaymentId`, credits = `amountUsdCents * 10`) → returns `{ billingAccountId, balanceCredits }`.

**`POST /api/v1/payments/credits/summary`** (Payments):

- Auth: Auth.js session only.
- Returns `{ billingAccountId, balanceCredits, ledger[] }` for the authenticated billing account, newest-first.

### Credit Top-Ups (MVP)

Real user funding enters via `/api/v1/payments/credits/confirm` (session-based), which writes positive `credit_ledger` rows with `reason='widget_payment'` and updates `billing_accounts.balance_credits`. The payment widget (DePay) is frontend-only — no webhook or signed callback. The client calls confirm after the widget's success callback fires in the browser. Dev/test environments seed credits via database fixtures or scripts.

### File Pointers

| File                                               | Purpose                                                        |
| -------------------------------------------------- | -------------------------------------------------------------- |
| `src/lib/auth/mapping.ts`                          | `getOrCreateBillingAccountForUser` — MVP provisioning          |
| `src/adapters/server/ai/litellm.adapter.ts`        | LiteLLM adapter — reads `LITELLM_MASTER_KEY`, injects metadata |
| `src/contracts/wallet.link.v1.contract.ts`         | Wallet link contract                                           |
| `src/app/api/v1/payments/credits/confirm/route.ts` | Credit confirm endpoint                                        |
| `src/app/api/v1/payments/credits/summary/route.ts` | Credit summary endpoint                                        |

## Acceptance Checks

**Automated:**

- `pnpm test:stack:dev -- completion` — validates completion flow with master key + billing attribution
- `pnpm test:stack:dev -- wallet` — validates wallet link provisioning

**Manual:**

1. Verify `virtual_keys` row contains `[master-key-mode]` sentinel after first login
2. Verify `x-litellm-response-cost` header is captured in `charge_receipts`

## Open Questions

_(none)_

## Related

- [accounts-design.md](./accounts-design.md) — three-layer identity system (pending migration)
- [security-auth.md](./security-auth.md) — authentication architecture
- [billing-evolution.md](./billing-evolution.md) — billing stages
- [Initiative: Accounts & API Keys](../../work/initiatives/ini.accounts-api-keys.md)
