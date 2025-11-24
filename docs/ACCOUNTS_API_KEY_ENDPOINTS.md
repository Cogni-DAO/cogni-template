# Accounts & LiteLLM Virtual Key Endpoints

**Purpose:** Document how Cogni-template provisions and uses LiteLLM virtual keys for billing accounts, and which LiteLLM HTTP endpoints we depend on now vs later.

LiteLLM virtual keys are how LiteLLM tracks usage and associates calls with Teams/organizations. In Cogni-template, virtual keys are _purely internal_ in the MVP: they live in the `virtual_keys` table and are only used server-side when calling the LiteLLM proxy. In a future version, any user-visible "API keys" we expose in the UI will be backed 1:1 by rows in `virtual_keys` (and thus by LiteLLM virtual keys).

**Core loop:** Auth.js session → `users` → `billing_accounts` → `virtual_keys` → LiteLLM `/chat/completions`.

**Related:**

- Auth design: [SECURITY_AUTH_SPEC.md](SECURITY_AUTH_SPEC.md)
- Billing model: [ACCOUNTS_DESIGN.md](ACCOUNTS_DESIGN.md)
- Billing evolution: [BILLING_EVOLUTION.md](BILLING_EVOLUTION.md)

---

## Core Concepts

- **Auth.js user** – Identity row in the Auth.js `users` table, created via SIWE (wallet login). Represents identity and session ownership.
- **Billing account** – Row in `billing_accounts` (our table). Represents a billing tenant and owns LiteLLM virtual keys. We differentiate tenants via separate virtual keys and our own `billing_accounts` + `credit_ledger` records.
- **LiteLLM Team** – (Future/Optional) LiteLLM's grouping concept for spend analytics. Not used in MVP; virtual keys are sufficient for authentication and per-account tracking.
- **Virtual key** – Row in `virtual_keys`. Stores a LiteLLM virtual key string (`litellm_virtual_key`) plus flags (`is_default`, `active`, label, etc.). Multiple virtual keys can belong to one billing account.
- **LiteLLM master key** – The Proxy admin key (`LITELLM_MASTER_KEY`) we use to call LiteLLM's control-plane endpoints like `/key/generate`.
- **LlmCaller** – Internal type `{ billingAccountId; virtualKeyId; litellmVirtualKey }` constructed server-side for each call to LiteLLM. This is the canonical internal call descriptor for LLM usage in the new billing design and replaces the older `{ accountId; apiKey }` shape.

**Invariant:** LiteLLM virtual keys are **never** returned to the browser. They only live in `virtual_keys` and are only used by server-side adapters.

**See also:** [ACCOUNTS_DESIGN.md](ACCOUNTS_DESIGN.md) "Three-Layer Identity System" for complete architecture.

---

## LiteLLM Endpoints Used in MVP

We run the LiteLLM Proxy with a Postgres DB and `LITELLM_MASTER_KEY` as described in the **LiteLLM Getting Started guide** (Docker + `config.yaml`). See **Getting Started Tutorial → Generate a virtual key** and **Key Management API Endpoints Swagger** for the full spec.

**Official Docs:** https://docs.litellm.ai/docs/

### 1. Chat Completions (Data Plane)

- [x] **Endpoint:** `POST /chat/completions`
- [x] **Auth:** `Authorization: Bearer <virtual_key>`
- [x] **Docs:** [LiteLLM Getting Started](https://docs.litellm.ai/docs/), section "Make a successful /chat/completion call"

Cogni-template calls this endpoint from our `LlmService` adapter using the `litellm_virtual_key` stored in `virtual_keys`. We read `usage.total_tokens` from the response to update our `credit_ledger`.

### 2. Virtual Key Generation (Control Plane)

- [x] **Endpoint:** `POST /key/generate`
- [x] **Auth:** `Authorization: Bearer <LITELLM_MASTER_KEY>`
- [x] **Docs:** [LiteLLM Virtual Keys](https://docs.litellm.ai/docs/proxy/virtual_keys), section "Create Key w/ RPM Limit" and [Key Management API Endpoints Swagger](https://litellm-api.up.railway.app/)

**MVP behavior:** `getOrCreateBillingAccountForUser(user)` calls `/key/generate` once per new billing account to create a default virtual key for that tenant. We store the returned key string in `virtual_keys.litellm_virtual_key` and mark it `is_default = true`.

We do **not** expose `/key/generate` directly to browser clients; it is only called from our server using the master key.

**Example request:**

```json
POST /key/generate
Authorization: Bearer <LITELLM_MASTER_KEY>
{
  "max_budget": null,
  "models": [],
  "metadata": {
    "cogni_billing_account_id": "billing-account-xyz"
  }
}
```

**Example response:**

```json
{
  "key": "sk-...",
  "key_name": null,
  "expires": null,
  "user_id": null
}
```

---

## MVP Internal Provisioning Flow (No Public Control-Plane HTTP)

In the new Auth.js + SIWE design, **MVP does not expose any account/key management HTTP endpoints**. All provisioning happens inside a single helper:

- **Module:** `src/lib/auth/mapping.ts`
- **Function:** `getOrCreateBillingAccountForUser(user)`

**MVP behavior:**

1. **Input:** Auth.js `user` object (from `auth()`), which includes the wallet address from SIWE.
2. **Look up** existing `billing_accounts` row where `owner_user_id = user.id`.
3. **If none exists:**
   - Create a new `billing_accounts` row:
     - `owner_user_id = user.id`
     - `balance_credits = 0`
   - Call LiteLLM `POST /key/generate` with our `LITELLM_MASTER_KEY` to create a virtual key for this account:
     - Set `metadata.cogni_billing_account_id` = new billing account ID (for tracking)
   - Insert a `virtual_keys` row:
     - `billing_account_id = billing_accounts.id`
     - `litellm_virtual_key = <key from LiteLLM>`
     - `is_default = true`, `active = true`, `label = 'Default'`
4. **Return:** `{ billingAccountId, defaultVirtualKeyId, litellmVirtualKey }` for use by the LLM adapter.

From this point on, all LLM calls for this user go through the same `billing_accounts` + `virtual_keys` records.

**Credit top-ups (MVP):** Real user funding currently enters the system via `POST /api/v1/payments/credits/confirm` (session-based), which writes positive `credit_ledger` rows with `reason='widget_payment'` and updates `billing_accounts.balance_credits`. The endpoint resolves `billing_account_id` from the SIWE session (not from request body). The payment widget (DePay) is a frontend-only SDK; it does not send a webhook or signed callback. The client calls the confirm endpoint after the widget's success callback fires in the browser. Dev/test environments can seed credits directly via database fixtures or scripts. Post-MVP, a Ponder-based on-chain watcher will provide reconciliation and observability for payments; see `docs/PAYMENTS_PONDER_VERIFICATION.md`.

---

## Our HTTP Endpoints That Use Billing Accounts & Keys (MVP)

### 1. `/api/v1/ai/completion` (Data Plane)

- [x] **Auth:** Auth.js session only (HttpOnly cookie). No API key in the request.
- [x] **Flow:**
  1. Call `auth()` and require `session.user` (wallet login)
  2. Call `getOrCreateBillingAccountForUser(session.user)`
  3. Load the default `virtual_keys` row for that billing account
  4. Call LiteLLM `POST /chat/completions` with `Authorization: Bearer <litellm_virtual_key>`
  5. Record usage in `credit_ledger` for `billing_account_id` + `virtual_key_id`

Session-based credit top-ups now flow through the widget confirm endpoint below; there is still no public HTTP surface for admin key registration or manual balance edits.

### 2. `/api/v1/payments/credits/confirm` (Payments)

- [x] **Auth:** Auth.js session only (HttpOnly cookie). No billing account identifier in the payload.
- [x] **Flow:**
  1. Client calls after payment widget reports success (e.g., DePay `succeeded` event) with `{ amountUsdCents, clientPaymentId, metadata }`.
  2. Server resolves billing account from session via `getOrCreateBillingAccountForUser`.
  3. Idempotent ledger write: insert `credit_ledger` row with `reason = 'widget_payment'` and `reference = clientPaymentId`; credits computed as `amountUsdCents * 10`.
  4. Returns `{ billingAccountId, balanceCredits }` from cached balance.

### 3. `/api/v1/payments/credits/summary` (Payments)

- [x] **Auth:** Auth.js session only.
- [x] **Flow:** Returns `{ billingAccountId, balanceCredits, ledger[] }` for the authenticated billing account, ordered newest-first, used by the Credits page to refresh balance/history after confirm.

---

## Future: Operator HTTP API for Accounts & Keys (Post-MVP)

Once the core wallet → session → billing loop is stable, we will add an operator-facing HTTP API (likely with Auth.js-based admin roles) to manage accounts and keys. These routes are **not implemented in MVP**, but we keep them here as design intent:

**Potential routes:**

- [ ] `GET /api/admin/billing-accounts` – List billing accounts and key summaries
- [ ] `GET /api/admin/billing-accounts/:billingAccountId` – Inspect one billing account, balance, and ledger summary
- [ ] `GET /api/admin/billing-accounts/:billingAccountId/virtual-keys` – List virtual keys for that account
- [ ] `POST /api/admin/billing-accounts/:billingAccountId/virtual-keys` – Create a new LiteLLM virtual key for that account (wraps LiteLLM `POST /key/generate`)
- [ ] `POST /api/admin/billing-accounts/:billingAccountId/credits/topup` – Manually credit the account (writes to `credit_ledger`, adjusts balance)

Later, we can also expose self-serve data-plane endpoints (e.g., `/api/v1/accounts/me/balance`, `/api/v1/accounts/me/usage`) that infer `billing_account_id` from either the session or an `Authorization: Bearer <virtual_key>` header once we implement dual-auth mode.

**For the full set of LiteLLM key and spend management endpoints, see:**

- [LiteLLM Virtual Keys](https://docs.litellm.ai/docs/proxy/virtual_keys) – Virtual Keys section
- [Key Management API Endpoints Swagger](https://litellm-api.up.railway.app/) – Full API reference
- [LiteLLM Spend Tracking](https://docs.litellm.ai/docs/proxy/logging) – For mapping LiteLLM's usage records into our `credit_ledger` over time
