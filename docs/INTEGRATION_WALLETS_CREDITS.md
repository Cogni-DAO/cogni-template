# App Integration: Wallets, LiteLLM Keys, and Credits

This document explains how the Next.js app, wallets (wagmi/RainbowKit), LiteLLM virtual keys, and the Accounts & Credits system fit together within our hexagonal architecture.

Directly implementing the frontend for [docs/ACCOUNTS_DESIGN.md](ACCOUNTS_DESIGN.md).

## High-Level Flow

1. User connects an EVM wallet in the browser.
2. Frontend calls `/api/v1/wallet/link` with the wallet address (and later, a signature).
3. Backend:
   - Derives a stable `accountId` from the LiteLLM API key.
   - Ensures an `accounts` row exists (`ensureAccountExists(accountId)`).
   - Ensures a LiteLLM virtual key is associated with that account.
   - Returns `{ accountId, apiKey }` to the frontend.
4. Frontend stores `apiKey` and uses it as `Authorization: Bearer <apiKey>` for all AI calls.
5. `/api/v1/ai/completion`:
   - Extracts `apiKey` from the Authorization header.
   - Derives `accountId` from `apiKey`.
   - Builds `LlmCaller { accountId, apiKey }`.
   - Ensures account exists.
   - Calls the completion feature, which:
     - Calls LiteLLM via `LlmService`.
     - Computes cost from token usage.
     - Debits credits via `AccountService.debitForUsage`.

LiteLLM does upstream usage/cost tracking; our Postgres ledger tracks internal credits.

---

## Frontend: Wallet + API Key Handling

### Libraries

- **RainbowKit**: wallet connect UI.
- **wagmi**: React hooks for EVM account/chain.
- **viem**: underlying EVM client (bundled with wagmi).

### Setup

#### 1. Providers

In `src/app/layout.tsx` (or a dedicated `Providers.tsx`):

[ ] Wrap the app with:

- [ ] `WagmiConfig`
- [ ] `RainbowKitProvider`

[ ] Configure for the Base network (or whichever chain we use).

#### 2. Connect Button

[ ] Use RainbowKit's `<ConnectButton />` in the header or home page.

#### 3. Wallet Link Flow

After a successful connection (via `useAccount()`):

[ ] Call `/api/v1/wallet/link` from the client with:

```typescript
await fetch("/api/v1/wallet/link", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ address }),
});
```

[ ] Handle response shape (MVP):

```json
{
  "accountId": "key:a1b2c3...",
  "apiKey": "LITELLM_VIRTUAL_KEY"
}
```

[ ] Store `apiKey` in a React context or local storage (MVP-level security; we can harden later).

### Using the API Key for AI Calls

[ ] When calling `/api/v1/ai/completion` from the frontend:

```typescript
await fetch("/api/v1/ai/completion", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  },
  body: JSON.stringify({ messages }),
});
```

No cookies or session state required for the MVP; the LiteLLM virtual key is the credential.

---

## Backend: Hexagonal Integration

### Layers

#### App Layer (Next.js Routes)

- `/api/v1/wallet/link/route.ts`
- `/api/v1/ai/completion/route.ts`

#### Feature Layer

- `src/features/ai/services/completion.ts`
- Future: `src/features/accounts/services/wallet-link.ts`

#### Ports

- `LlmService` (`src/ports/llm.port.ts`)
- `AccountService` (`src/ports/accounts.port.ts`)

#### Adapters

- LiteLLM adapter (`src/adapters/server/ai/litellm.adapter.ts`)
- DrizzleAccountService (`src/adapters/server/accounts/drizzle.adapter.ts`)
- DB client (`src/adapters/server/db/client.ts`)

### `/api/v1/wallet/link` Route

**Responsibilities:**

[ ] Parse `{ address }` from body.
[ ] (Future) Verify the address via a signed message.
[ ] Look up or create an account:

- [ ] If this wallet is already mapped, reuse its `accountId` and `apiKey`.
- [ ] Else: - [ ] Generate or assign a LiteLLM virtual key for this account. - [ ] Derive `accountId = deriveAccountIdFromApiKey(apiKey)`. - [ ] Call `accountService.ensureAccountExists(accountId)`.
      [ ] Return `{ accountId, apiKey }` to the client.

### `/api/v1/ai/completion` Route

**Responsibilities:**

[ ] Extract `Authorization: Bearer <apiKey>` header.
[ ] If missing/malformed → 401 (do not call any services).
[ ] Derive:

```typescript
const accountId = deriveAccountIdFromApiKey(apiKey);
const caller: LlmCaller = { accountId, apiKey };
```

[ ] Call into the feature service:

```typescript
const message = await completionService.execute(
  messages,
  llmService,
  accountService,
  clock,
  caller
);
```

[ ] Handle `InsufficientCreditsError` by returning a 402-style response while still accepting that the LLM call was made (MVP token waste).

---

## Credits & Ledger Integration (Backend)

The accounts & credits system (see [Accounts & Credits System Design](ACCOUNTS_DESIGN.md)) plugs in here:

### AccountService Methods

[ ] **`AccountService.ensureAccountExists(accountId)`**

- Called from `/api/v1/wallet/link` and/or `/api/v1/ai/completion` before usage.

[ ] **`AccountService.debitForUsage(...)`**

- Called by `completionService.execute(...)` after LLM usage is known.
- Runs inside a DB transaction (ledger insert + balance update + negative-balance check).

[ ] **`AccountService.creditAccount(...)`**

- Used for manual top-ups (MVP).
- Later: called by on-chain watcher when USDC deposits are detected.

### Frontend Responsibility

Frontend never directly manipulates balances; it only:

1. Connects wallet.
2. Obtains `apiKey` + `accountId`.
3. Calls AI endpoints with the Authorization header.

---

## Implementation Summary

### Frontend

[ ] RainbowKit + wagmi handle wallets
[ ] Call `wallet/link` once to get LiteLLM virtual key
[ ] Use returned key for all AI requests via Authorization header

### Backend

[ ] Next.js app routes construct `LlmCaller` from Authorization header
[ ] Ensure accounts exist at auth boundary
[ ] Delegate to:

- [ ] `LlmService` (LiteLLM adapter) for model calls
- [ ] `AccountService` (Drizzle adapter) for credit debits/credits via ledger

### Architecture

The hexagonal architecture remains intact; wallets and LiteLLM keys are just different adapters feeding into the same `LlmCaller` + Accounts & Credits system.
