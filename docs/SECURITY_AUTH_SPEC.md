# Security & Authentication Specification

## One Sentence Summary

Auth.js + SIWE authenticates browsers via HttpOnly session cookies; programmatic clients will use App API keys (next); both resolve to a billing account for credits and (for LLM) a mapped LiteLLM virtual key for per-key spend tracking.

---

## Scope

This doc owns: client auth surfaces, route protection policy, and credential handling rules.
It does **not** own billing ledger semantics (see ACCOUNTS_DESIGN.md).

---

## Non-Negotiable Rules

- **No secrets in browser storage.** No API keys in localStorage/sessionStorage.
- **No plaintext key storage.** App keys are hash-only; LiteLLM key material is never stored plaintext.
- **No “modes” implied by naming.** If behavior changes, it must be explicit and validated.
- **No confusing invariants.** “Current State” vs “Target” must be separated.

---

## Auth Surfaces

### A) Browser UI (Current)

- Auth mechanism: Auth.js session cookie (HttpOnly).
- SIWE verification: Auth.js Credentials provider + `siwe` library.
- Used by: web app calling `/api/v1/*`.

### B) Programmatic API (Next)

- Auth mechanism: `Authorization: Bearer <app_api_key>` (product key, not a LiteLLM key).
- Lookup: hash the presented key, match `app_api_keys.key_hash`.
- Result: `{ billing_account_id, app_api_key_id }` for authorization + attribution.

---

### Key lifecycle endpoints (Next)

- `POST /api/v1/keys` (session required)
- `GET /api/v1/keys` (session required)
- `DELETE /api/v1/keys/:id` (session required)

## Route Policy

- Public (no auth): `/health`, `/openapi.json`, `/meta/*`, `/api/auth/*`
- Protected (requires auth): **all** `/api/v1/*` endpoints
  - Current: session required
  - Target: session OR app_api_key

---

## Credential Mapping (Target for LLM calls)

- App API keys are **our** product credential.
- Each app_api_key maps 1:1 to a **server-only** LiteLLM virtual key identity for per-key spend attribution.
- Outbound call uses the mapped LiteLLM key (never exposed to client).

---

## Current State (Truth)

- Session-only auth is implemented.
- Outbound LiteLLM calls use service auth (`LITELLM_MASTER_KEY`).
- App API keys are not implemented yet.
- Per-key spend attribution is not implemented until app_api_keys + mapping exists.

---

## Next PR Acceptance Criteria (API Keys)

1. `app_api_keys` exists with hash-only storage + show-once plaintext.
2. `/api/v1/*` accepts session OR Bearer app_api_key.
3. For LLM endpoints, Bearer app_api_key resolves to a mapped LiteLLM key for per-key spend tracking.
4. No LiteLLM key material is ever returned to the client or stored plaintext.
