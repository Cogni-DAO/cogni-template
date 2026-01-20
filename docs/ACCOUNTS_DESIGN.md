# Accounts & Credits System Design

## One Sentence Summary

Auth.js (SIWE) authenticates users; our billing layer owns a billing account per user and a credit ledger; product API keys (coming next) map 1:1 to LiteLLM virtual keys for per-key spend attribution.

---

## Key Invariants (Target System)

These are _design invariants_ we are building toward. If an invariant is not yet implemented, it must be stated under “Current State” as missing.

- **One user → exactly one billing_account:** `auth.users.id` maps 1:1 to `billing_accounts.owner_user_id`.
- **One billing_account → many app_api_keys:** users can create/revoke multiple product API keys.
- **1:1 mapping:** each `app_api_key` maps to exactly one **server-only** LiteLLM virtual key (for per-key spend tracking).
- **No client access to LiteLLM keys:** LiteLLM key material never appears in browser storage, responses, or logs.
- **Credits tracked per billing_account:** `credit_ledger` is append-only source of truth; balance is a shared pool.
- **Spend attribution per key:** LLM spend is attributable per `app_api_key` (via its mapped LiteLLM virtual key + our receipts).
- **No plaintext secrets stored:** app keys are stored hashed (show-once); LiteLLM key material is encrypted or stored as a reference, never plaintext.

---

## Current State (Service-Auth MVP)

This is what exists _right now_ in code, not what we want later.

- Auth.js session-only auth for `/api/v1/*` (no app API keys yet).
- Outbound LiteLLM calls use service auth (`LITELLM_MASTER_KEY`).
- `virtual_keys` currently acts as an internal FK/scope handle for ledger/receipts (no per-key spend attribution yet).
- Per-key attribution is **not implemented** until app_api_keys + 1:1 mapping exists.

## Roadmap: App API Keys + 1:1 LiteLLM Key Mapping

- Add `app_api_keys` (hash-only, show-once plaintext)
- Add `app_api_key_id` FK to the LiteLLM mapping table (unique 1:1)
- Add `app_api_key_id` FK to `credit_ledger` and `charge_receipts`
- Add endpoints:
  - `POST /api/v1/keys` create key (show-once plaintext) + create mapped LiteLLM virtual key
  - `GET /api/v1/keys` list keys (no plaintext)
  - `DELETE /api/v1/keys/:id` revoke key + revoke mapped LiteLLM virtual key
- Add auth: `/api/v1/*` accepts session OR `Authorization: Bearer <app_api_key>`
- Update LLM port: resolve `{billing_account_id, app_api_key_id}` → mapped LiteLLM virtual key → outbound call

---

## Model: Identity → Billing → Credentials

### 1) Auth.js Identity (Login)

- Tables: `users`, `accounts`, `verification_tokens` (+ sessions table may exist but JWT strategy can bypass it).
- Purpose: prove wallet ownership (SIWE) and manage browser sessions.

### 2) Billing Accounts (Credit Tenancy)

- Table: `billing_accounts`
- Purpose: tenancy anchor for credits + ledger + receipts.
- Mapping: exactly one `users.id` → one `billing_accounts.owner_user_id`.

### 3) App API Keys (Product Auth) — NEXT PR

- Table: `app_api_keys`
- Purpose: authenticate programmatic access to `/api/v1/*`.
- Storage: hash-only; show-once plaintext at creation.
- Many keys per billing account; independently revocable.

### 4) LiteLLM Virtual Keys (Spend Attribution)

- Table: `litellm_key_refs` (rename from `virtual_keys` when implemented)
- Purpose: store the 1:1 mapping from `app_api_key_id` → LiteLLM virtual key identity (and material/ref) for outbound calls and per-key spend.
- Server-only: never returned to client.

---

## Request Auth & Resolution (Target)

### Browser (Session)

`session cookie → users.id → billing_account_id → select default app_api_key_id → resolve mapped LiteLLM key → outbound LiteLLM call → charge receipt + ledger entry`

### Programmatic (API Key)

`Authorization: Bearer <app_api_key> → hash lookup → billing_account_id + app_api_key_id → resolve mapped LiteLLM key → outbound LiteLLM call → charge receipt + ledger entry`

---

## Tables (Target)

- `billing_accounts(id, owner_user_id, is_system_tenant, balance_credits, created_at, updated_at)` — `is_system_tenant` boolean (default false)
- `app_api_keys(id, billing_account_id, key_hash, last4, label, active, created_at, revoked_at)`
- `litellm_key_refs(id, billing_account_id, app_api_key_id UNIQUE, litellm_key_ref/material, label, active, created_at, revoked_at)`
- `credit_ledger(id, billing_account_id, app_api_key_id?, amount, balance_after, reason, reference, metadata, created_at)`
- `charge_receipts(id, billing_account_id, app_api_key_id?, litellm_call_id, charged_credits, response_cost_usd, provenance, source_system, source_reference, created_at)`

---

## What This Doc Owns

- The _billing_ model (accounts, credits, receipts) and how credentials map to spend attribution.
- Tenancy rules: owner vs actor semantics, data ownership boundaries.
- It does **not** define SIWE/Auth.js mechanics in depth (see SECURITY_AUTH_SPEC.md).

---

## Tenancy & Data Ownership (Owner vs Actor)

### Definitions

- **Owner (`account_id`)**: Data tenancy boundary. RLS enforced. Determines deletion scope and retention policy.
- **Actor (`actor_type`, `actor_id`)**: Who initiated the run. Metadata only—does not change tenancy.

| Field        | Purpose                   | Storage                               |
| ------------ | ------------------------- | ------------------------------------- |
| `account_id` | Data owner (RLS boundary) | Column (NOT NULL)                     |
| `actor_type` | `'user'` or `'service'`   | metadata (P0), column (P1 if indexed) |
| `actor_id`   | Initiator identifier      | metadata (P0), column (P1 if indexed) |

### Hard Rule

**Customer-derived content is always stored under the customer's `account_id`**, even if initiated by system automation. Never repoint customer artifacts into a system account.

### System Tenant

- `is_system_tenant=true` for purely internal governance/automation runs
- System tenant has explicit tool allowlists (no wildcards) and high spend caps (not unlimited)
- System tenant may have different retention defaults (policy-driven)
- **Forbidden:** Customer message content in system tenant

→ See: [System Tenant Design](SYSTEM_TENANT_DESIGN.md) for full implementation spec including policy resolution, tool policy, and governance loop execution.

---

### Future: Multi-Tenant & OAuth

- [ ] Support multiple wallets per user (Auth.js `accounts` table)
- [ ] Add OAuth providers (GitHub, Google)
- [ ] Organization/team billing accounts
- [ ] On-chain payment reconciliation (Ponder indexer)
