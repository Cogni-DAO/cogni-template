# Required Accounts + API Key Endpoints

This document defines the **minimum set of HTTP endpoints** we need to manage:

- **Accounts** (our billing/credit tenants)
- **API keys** (LiteLLM virtual keys)

It also draws a hard line between:

- The **barebones MVP workflow** we are building now.
- The **extended endpoint surface** we should grow into over time.

Throughout, we follow two principles:

1. **Control plane vs data plane** are strictly separated.
2. **LiteLLM is the API key authority**; we wrap it with our own account and credit model.

---

## Core Concepts

- **Account**  
  Our billing/credit entity (`accounts` table, `accountId`). This is what we debit credits from.

- **LiteLLM Virtual Key** (`apiKey`)  
  A key managed by LiteLLM, used for LLM calls and usage tracking. Each key is bound to a LiteLLM team/user, which we map to an `accountId`.

- **LlmCaller**  
  Internal type used by our ports: `{ accountId: string; apiKey: string; }`.

- **Control Plane**  
  Endpoints used by operators / onboarding flows to:
  - Create accounts.
  - Register LiteLLM keys to accounts.
  - Top up credits.

- **Data Plane**  
  Endpoints used by client apps:
  - Call AI (`/completion`).
  - Query balance/usage (later).

**Invariant:** No data-plane endpoint should ever create accounts or keys as a side-effect.

---

## Endpoint Taxonomy

We group endpoints into two planes:

- `/admin/*` → **Control plane** (operator / backend only)
- `/api/v1/*` → **Data plane** (public client usage, authenticated by LiteLLM virtual keys)

---

## MVP: Barebones Workflow (What We Build Now)

### 1. Data Plane: AI Completion

**Endpoint:**

```http
POST /api/v1/ai/completion
Authorization: Bearer <LITELLM_VIRTUAL_KEY>
Content-Type: application/json
```

**Purpose:**

- Main AI entry point.
- Enforces "no key → no call".
- Debits internal credits after each successful completion.

**Behavior (high level):**

1. Extract `apiKey` from `Authorization: Bearer <key>`.
2. Look up `accountId` for this `apiKey` via our mapping (either:
   - `deriveAccountIdFromApiKey(apiKey)` if we control issuance, and the account is known, or
   - an explicit `api_keys` mapping table).
3. If no account found → `403 Forbidden` / "Unknown API key" (do not call LiteLLM).
4. Construct `LlmCaller { accountId, apiKey }`.
5. Call the completion feature:
   - Calls LiteLLM via `LlmService` using `apiKey`.
   - Reads `usage.totalTokens` from the response.
   - Calculates `cost` via `calculateCost({ modelId, totalTokens })`.
   - Calls `AccountService.debitForUsage({ accountId, cost, requestId, metadata })`.
6. If debit fails with `InsufficientCreditsError`:
   - Return 402-style "insufficient credits" error.
   - For MVP, we accept that the upstream LLM call already happened (token waste is tolerated).
7. On success, return the completion message.

**Notes:**

- No account creation here.
- No key creation here.
- This is pure data plane.

### 2. Control Plane: Register Account + LiteLLM Key

For MVP, accounts must be created explicitly, not implicitly.

#### 2.1 Register Key for an Account (MVP Onboarding)

**Endpoint:**

```http
POST /admin/accounts/register-litellm-key
Content-Type: application/json
Authorization: Bearer <INTERNAL_ADMIN_TOKEN>  # or equivalent operator auth
```

**Request body:**

```json
{
  "apiKey": "LITELLM_VIRTUAL_KEY",
  "displayName": "Derek Dev Key"
}
```

**Behavior:**

1. Validate caller is an operator / internal process (not a public client).
2. Optionally verify `apiKey` against LiteLLM (e.g. call its admin/key-info endpoint) to ensure it's valid and under our control.
3. Derive or look up `accountId` for this key:
   - Option A (MVP-simple): `accountId = deriveAccountIdFromApiKey(apiKey)`
4. If `accounts` row does not exist:
   - Insert `accounts` row:
     - `id = accountId`
     - `display_name = displayName`
     - `balance_credits = 0` (or seeded)
   - Insert or update `api_keys` mapping (if we choose to have a separate table).
5. Return:

```json
{
  "accountId": "key:a1b2c3d4...",
  "displayName": "Derek Dev Key",
  "balanceCredits": 0
}
```

**Why this exists:**

- This is the only way an `accounts` row is created in the MVP.
- It replaces the "autoprovision on /completion" anti-pattern.
- You or future automated flows (wallet onboarding) call this endpoint to onboard keys.

#### 2.2 Manual Credit Top-Up (MVP)

**Endpoint:**

```http
POST /admin/accounts/:accountId/credits/topup
Content-Type: application/json
Authorization: Bearer <INTERNAL_ADMIN_TOKEN>
```

**Request body:**

```json
{
  "amount": 100.0,
  "reason": "topup_manual",
  "reference": "initial_seed"
}
```

**Behavior:**

1. Validate operator auth.
2. Use `AccountService.creditAccount({ accountId, amount, reason, reference })`.
3. This:
   - Inserts a positive delta row into `credit_ledger`.
   - Updates `accounts.balance_credits` accordingly.
4. Return updated balance:

```json
{
  "accountId": "key:a1b2c3d4...",
  "balanceCredits": 100.0
}
```

**Why this exists:**

- You need a way to seed or refill credits for testing and internal usage before wallets/on-chain payments are wired.
- Minimal way to simulate "wallet funded the app" without touching blockchain yet.

---

## MVP Endpoint Checklist

For the barebones system to function end-to-end:

**Control Plane (admin-only):**

- [ ] `POST /admin/accounts/register-litellm-key`  
      Explicitly creates/binds accounts to LiteLLM virtual keys.

- [ ] `POST /admin/accounts/:accountId/credits/topup`  
      Manually adds credits via the ledger.

**Data Plane (public API):**

- [ ] `POST /api/v1/ai/completion`  
      Uses `Authorization: Bearer <apiKey>`, validates existing account, calls LiteLLM, and debits credits.

That's it for MVP. Everything else is "later".

---

## Extended Endpoint Surface (Future)

Once the MVP loop is real, we can extend in two dimensions:

1. Deeper control plane (orgs, keys, usage).
2. Self-serve data plane (balance, usage, wallet flows).

### A. Extended Control Plane Endpoints

These are still admin/privileged.

#### A.1 Organizations (Optional, Future)

If we want multiple DAOs or groups:

```http
POST /admin/orgs
GET  /admin/orgs/:orgId
GET  /admin/orgs/:orgId/accounts
```

Map `orgId` to LiteLLM `org_id` and possibly different DAO multi-sigs.

#### A.2 Full Account Management

```http
GET    /admin/accounts
GET    /admin/accounts/:accountId
GET    /admin/accounts/:accountId/ledger
GET    /admin/accounts/:accountId/usage          # proxy LiteLLM usage/spend
PATCH  /admin/accounts/:accountId                # update displayName, status, limits
POST   /admin/accounts/:accountId/credits/adjust # arbitrary +/- adjustments with reason
```

#### A.3 Key Management (Wrapping LiteLLM)

Instead of manual key creation in LiteLLM UI, we can drive it from our admin API:

```http
POST   /admin/accounts/:accountId/keys
       # calls LiteLLM key generation, stores mapping

GET    /admin/accounts/:accountId/keys

POST   /admin/accounts/:accountId/keys/:keyId/regenerate
       # calls LiteLLM key_regenerate

DELETE /admin/accounts/:accountId/keys/:keyId
       # calls LiteLLM delete_key
```

These map closely to LiteLLM's key management APIs and org/team/user contexts.

### B. Extended Data Plane Endpoints (Client-Facing)

Once we want self-serve UX beyond "just call completion", we add:

#### B.1 Caller Balance and Usage

Use the caller's `Authorization: Bearer <apiKey>` to infer account:

```http
GET /api/v1/accounts/me/balance
Authorization: Bearer <apiKey>

GET /api/v1/accounts/me/usage
Authorization: Bearer <apiKey>
```

**Behavior:**

1. Resolve `accountId` from `apiKey`.
2. Return:
   - `balance` from `accounts`.
   - `usage` from our ledger and/or LiteLLM usage APIs.

#### B.2 Wallet-Based Onboarding (Future)

Once wallets are wired in (wagmi/RainbowKit + on-chain payments):

```http
POST /api/v1/wallet/link
POST /api/v1/wallet/fund
```

**High-level flow:**

- `/wallet/link`:
  1. Wallet signs a message.
  2. Backend verifies address ↔ signature.
  3. Backend either:
     - Creates a new account and LiteLLM key via admin APIs, then calls `register-litellm-key`, or
     - Links the wallet to an existing account.

- `/wallet/fund`:
  - For MVP: just a test endpoint that calls `creditAccount`.
  - Later: validate on-chain transfers (USDC/token) and then credit the account ledger.

These are layered on top of the same Accounts + Credits + completion flow; they don't change the core architecture.

---

## Summary

**MVP endpoints (do now):**

- `POST /admin/accounts/register-litellm-key`
- `POST /admin/accounts/:accountId/credits/topup`
- `POST /api/v1/ai/completion`

**Later (control plane):**

- Org-level endpoints.
- Full account CRUD, ledger and usage views.
- Programmatic key management (creating/rotating LiteLLM keys).

**Later (data plane):**

- Self-serve balance and usage endpoints.
- Wallet-based onboarding and funding routes.

**Everything is anchored on one invariant:**

> Data-plane endpoints never create accounts or keys.  
> Accounts + keys are created only through explicit, privileged control-plane workflows.
