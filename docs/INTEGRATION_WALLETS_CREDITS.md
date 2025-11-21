# App Integration: Wallets, LiteLLM Keys, and Credits

This document explains how the Next.js app, wallets (wagmi/RainbowKit), LiteLLM virtual keys, and the Accounts & Credits system fit together within our hexagonal architecture.

Directly implementing the frontend for [docs/ACCOUNTS_DESIGN.md](ACCOUNTS_DESIGN.md).

---

## MVP Wallet Loop Implementation Progress

**Goal:** Implement the wallet-linked MVP loop on top of the existing accounts + credits + completion backend.

### Step 1: Define shared HTTP contract for /api/v1/wallet/link ✅ COMPLETE

- [x] Define WalletLinkRequest type with `address` field (string for MVP, future-proofed for viem Address type)
- [x] Define WalletLinkResponse type containing `accountId` and `apiKey` as strings
- [x] Place contract in `src/contracts/wallet.link.v1.contract.ts` following existing patterns
- [x] Add Zod schemas for runtime validation matching WalletLinkRequest/Response
- [x] Create unit tests verifying contract shapes (12 tests passing)
- [x] Single source of truth for /wallet/link request and response shapes
- [x] Types compile and can be imported from both backend and frontend code
- [x] All tests pass, `pnpm check` green (232 tests passing total)

**Files Created:**

- `src/contracts/wallet.link.v1.contract.ts` - Contract with Zod schemas and TypeScript types
- `tests/unit/contracts/wallet.link.v1.contract.test.ts` - 12 unit tests validating contract

### Step 2: Implement /api/v1/wallet/link backend route ✅ COMPLETE

- [x] Create API route for POST /api/v1/wallet/link
- [x] Parse and validate JSON as WalletLinkRequest
- [x] Implement MVP strategy for apiKey resolution (single configured `LITELLM_MVP_API_KEY`)
- [x] Derive accountId from apiKey using deriveAccountIdFromApiKey helper
- [x] Ensure account exists using AccountService (create-if-missing with zero balance)
- [x] Return WalletLinkResponse: { accountId, apiKey }
- [x] Handle errors: 400 for malformed requests, 503 for misconfiguration, 500 for internal failures
- [x] Add tests covering happy-path, invalid body, and failure scenarios (11 tests total)

**Files Created:**

- `src/app/api/v1/wallet/link/route.ts` - POST endpoint with validation
- `src/app/_facades/wallet/link.server.ts` - Facade coordinating AccountService
- `tests/unit/app/_facades/wallet/link.test.ts` - 4 unit tests passing
- `tests/stack/api/wallet/link.stack.test.ts` - 7 stack tests passing
- `tests/_fixtures/wallet/test-data.ts` - Shared test constants (DRY)
- `tests/_fixtures/wallet/api-helpers.ts` - Shared HTTP helpers (DRY)

**Environment:**

- Added `LITELLM_MVP_API_KEY` to `.env.example`, `.env.test`, `src/shared/env/server.ts`
- Wallet display format: `0x12345...defAB` (first 5 + last 5 hex digits)

### Step 3: Install wallet libraries and add global providers ✅ COMPLETE

- [x] Add dependencies: wagmi@2.19.5, viem@2.39.3, @rainbow-me/rainbowkit@2.2.9, @tanstack/react-query@5.90.10 (pinned)
- [x] Create src/app/providers/ subdomain for client-side provider composition
- [x] Create WalletProvider with dynamic connector imports (wagmi config created in useEffect)
- [x] Create QueryProvider, WalletProvider, and AppProviders composition
- [x] Wrap root app layout with AppProviders (inside ThemeProvider)
- [x] Configure client env schema with NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID (optional) and NEXT_PUBLIC_CHAIN_ID
- [x] Import RainbowKit CSS in layout.tsx (global CSS pattern)
- [x] Create src/app/wallet-test/page.tsx dev test page with useAccount hook
- [x] Implement dynamic import pattern for SSR-safe WalletConnect (browser-only IndexedDB)
- [x] Set ssr: false in wagmi config
- [x] Verify structure ready for mainnet expansion (base, optimism, etc.)
- [x] All 236 tests passing, pnpm check green, build succeeds without SSR errors

**Files Created:**

- `src/app/providers/wallet.client.tsx` - WalletProvider with dynamic imports in useEffect
- `src/app/providers/query.client.tsx` - React Query provider
- `src/app/providers/app-providers.client.tsx` - Provider composition
- `src/app/providers/AGENTS.md` - Subdomain documentation
- `src/app/wallet-test/page.tsx` - Dev test harness (marked for deletion)
- `src/shared/env/client.ts` - Client env validation

**Critical Implementation Detail:**
WalletConnect uses IndexedDB and is not SSR-safe. Using dynamic import pattern:

```typescript
useEffect(() => {
  async function initWagmiConfig() {
    const { injected, walletConnect } = await import("wagmi/connectors");
    // ... create config with ssr: false
  }
}, []);
```

This ensures connectors only load in browser, avoiding `indexedDB is not defined` errors during Next.js build/SSR.

### Step 4: Wire wallet link into chat flow ⏸️ PENDING

- [ ] Add wallet connect UI element
- [ ] Implement client function to call POST /api/v1/wallet/link with shared contract types
- [ ] Store returned accountId and apiKey client-side (context or localStorage for MVP)
- [ ] Create minimal chat UI sending messages to /api/v1/ai/completion
- [ ] Set Authorization header to stored apiKey
- [ ] Render assistant messages on success
- [ ] Show clear error state for credit-related errors (402 status)
- [ ] Verify end-to-end: wallet connect → link → admin seed credits → chat → debit

---

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

#### 1. Providers ✅ IMPLEMENTED

In `src/app/layout.tsx`:

- [x] Wrap the app with `<AppProviders>` client component
- [x] AppProviders composes: QueryProvider → WalletProvider
- [x] WalletProvider wraps children with WagmiProvider + RainbowKitProvider
- [x] Configured for Ethereum Sepolia (11155111) primary, Base Sepolia (84532) secondary
- [x] Uses dynamic imports for connectors (SSR-safe pattern)

#### 2. Connect Button ✅ AVAILABLE

- [x] RainbowKit's `<ConnectButton />` component available
- [x] Test implementation in `src/app/wallet-test/page.tsx`
- [ ] TODO Step 4: Add to header or home page

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
