# DAO_ENFORCEMENT.md

## Purpose

Define how the Cogni DAO "owns" the crypto widget payments loop in cogni-template, and how cogni-git-review enforces that ownership at PR time.

This document is **binding** for the payments MVP:

- It describes the only allowed way to mint credits from crypto payments.
- It describes how repository config and cogni-git-review gates detect violations.

---

## 1. DAO-Owned Financial Loop (MVP View)

For the payments MVP, the DAO "ownership" of payments is enforced at three layers:

1. **Configuration**
   - The DAO payment receiving address and chain_id live in `.cogni/repo-spec.yaml` (governance in git, not env).
   - Server code reads repo-spec and passes widget config as props; the browser never reads env vars or the filesystem.
   - Backend ops/watchers derive addresses from repo-spec (no env override).

2. **Runtime Invariants**
   - Only authenticated SIWE sessions can call `POST /api/v1/payments/credits/confirm`.
   - That endpoint resolves the caller's `billing_account_id` from the session only.
   - Credits are minted by inserting a `credit_ledger` row with `reason = 'widget_payment'` and updating `billing_accounts.balance_credits`.

3. **Static Enforcement (cogni-git-review)**
   - `.cogni/repo-spec.yaml` declares the payments config and allowed envs.
   - cogni-git-review gates ensure no code paths exist outside the approved rails.

For MVP, we accept that crypto widgets are a **soft oracle**: we trust the widget's success callback as "user paid" and rely on later Ponder/on-chain reconciliation for hard guarantees.

---

## 2. Payments MVP Invariants

### 2.1 Frontend Invariants

1. **Widget Address Source**
   - The receiver address for payment widgets MUST come from the repo-spec helper (server-provided props).
   - No literal `0x...` addresses may be hardcoded into widget configuration or any other `src/**` app code; no env overrides.

2. **Auth + Payment Flow**
   - User must be logged in via SIWE (Auth.js session) before the "Buy Credits" UI is shown.
   - On widget payment success callback (e.g., DePay's `succeeded` event), the UI:
     - Computes `amountUsdCents` from the selected Amount,
     - Generates a `clientPaymentId` (UUID),
     - Calls `POST /api/v1/payments/credits/confirm` with `{ amountUsdCents, clientPaymentId, metadata? }`.
   - The UI must **never** send `billingAccountId` or user identifiers in the body.

3. **Discovery**
   - The "Buy Credits" button must live in a shared layout/header and open a single `BuyCreditsModal` (or equivalent) component that owns the payment widget integration.

### 2.2 Backend Invariants

1. **Single Minting Endpoint**
   - `POST /api/v1/payments/credits/confirm` is the ONLY endpoint allowed to create `credit_ledger` entries with `reason = 'widget_payment'`.

2. **Session-Only Identity**
   - `billing_account_id` is resolved from the SIWE session via Auth.js → `user.id` → billing account mapping.
   - The request body MUST NOT include any account or user identifiers that influence the billing account.

3. **Credit Math**
   - `amountUsdCents` is a positive integer (cents) supplied by the UI.
   - Credits are computed using integer math, with the invariant:
     - `1 credit = $0.001`
     - `1 cent = 10 credits`
     - `credits = amountUsdCents * 10` (or equivalent formula using `CREDITS_PER_USDC`).
   - The ledger row uses `amount = credits` (positive BIGINT) and `reason = 'widget_payment'`.

4. **Idempotency**
   - `clientPaymentId` is REQUIRED and must be a UUID.
   - Before minting credits, the service checks for an existing `credit_ledger` row with `reason = 'widget_payment'` and `reference = clientPaymentId`.
   - If such a row exists, the operation is a no-op and returns the current balance.

5. **Atomicity**
   - `credit_ledger` insert and `billing_accounts.balance_credits` update must occur in a single transaction.

6. **Reason Isolation**
   - The literal `widget_payment` reason should be defined once (e.g. in a shared constants module) and used only by the credits confirm service.

---

## 3. Repo-Spec Requirements for DAO Financial Rails

The `.cogni/repo-spec.yaml` in cogni-template MUST declare the payment widget and env conventions so cogni-git-review can enforce them.

Example (simplified):

```yaml
payments_in:
  widget:
    provider: depay # Current widget provider (DePay OSS mode)
    receiving_address: "0x0000000000000000000000000000000000000000" # DAO-owned receiver (no env override)
    allowed_chains:
      - base
    allowed_tokens:
      - USDC

cogni_dao:
  chain_id: "8453"

providers:
  openrouter:
    api_host: https://openrouter.ai/api/v1
    api_key_env: OPENROUTER_API_KEY
  cherryservers:
    api_host: https://api.cherryservers.com/v1
    api_key_env: CHERRY_API_TOKEN

llm_proxy:
  host_env: LITELLM_PROXY_URL
  master_key_env: LITELLM_MASTER_KEY

secrets:
  manager:
    type: env
```

This is declarative only. It describes:

- Which DAO receiving address and chain the widget must use (governed in git, not env).
- Which env vars are considered sensitive API keys.
- Which host/master-key pair defines the LLM proxy.

---

## 4. cogni-git-review Enforcement

The cogni-git-review repository implements static gates that read `.cogni/repo-spec.yaml` and analyze PR diffs to enforce the rules above.

### 4.1 Gate: wallet-address-literals

**Intent:** Prevent new hardcoded on-chain addresses in app code.

**Behavior (conceptual):**

- Scan changed hunks in `src/**` files for `0x[0-9a-fA-F]{40}`.
- If any new literal EVM address is introduced, the gate FAILS.
- Tests/mocks may be exempted by path convention if needed (e.g. `tests/**`), but production app code cannot introduce addresses directly.

**Effect:**

- Ensures the DAO multisig and any other on-chain addresses must be supplied via configuration (env) instead of being baked into code.

### 4.2 Gate: widget-payment-reason

**Intent:** Ensure only the credits confirm flow can mint `widget_payment` credits.

**Behavior (conceptual):**

- If `payments_in.widget` exists in repo-spec, the gate activates.
- Scan PR diffs for the string `widget_payment`.
- Allow it only in:
  - `src/app/api/v1/payments/credits/**/route.ts`,
  - `src/features/payments/**`,
  - and a shared constants file (e.g. `src/shared/constants/**/payments.ts`).
- If `widget_payment` appears in any other file, the gate FAILS.

**Effect:**

- No other feature can sneak in a code path that writes `credit_ledger` rows pretending to be widget payments.

### 4.3 Gate: provider-api-key-usage

**Intent:** Constrain sensitive provider and DAO env vars to env modules and the correct adapters.

**Behavior (conceptual):**

- Read sensitive env names from repo-spec:
  - `providers.*.api_key_env` (OpenRouter, CherryServers, etc.).
  - `llm_proxy.master_key_env` (LiteLLM master key).
- For each env var name found in the PR diff:
  - Allow references only in:
    - `src/shared/env/**` (env parsing/validation), and
    - the corresponding adapter directory (e.g. `src/adapters/openrouter/**`, `src/adapters/cherryservers/**`, `src/adapters/litellm/**`).
  - If the env var name appears in any other path, the gate FAILS.

**Effect:**

- Sensitive provider keys cannot be quietly wired into unrelated modules or new network clients.

---

## 5. How This Shapes Future DAO Hardening

As we add Ponder/on-chain verification and additional payment providers, this document remains the baseline:

- All on-chain payment flows must settle into `credit_ledger` via well-defined reasons (e.g. `widget_payment`, `onchain_deposit`).
- `.cogni/repo-spec.yaml` is the single source of truth for which env vars and providers are allowed to participate in the DAO's financial rails.
- cogni-git-review evolves with new gates and reasons, but the core invariants remain:
  - No literal EVM addresses in code.
  - Single-owner minting paths per reason.
  - Sensitive keys confined to env modules and adapters.
