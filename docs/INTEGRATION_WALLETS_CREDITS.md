# App Integration: Wallets, LiteLLM Keys, and Credits

This document tracks wallet connectivity implementation (Steps 1-4) for the frontend user onboarding flow.

**Related Documentation:**

- System architecture: [ACCOUNTS_DESIGN.md](ACCOUNTS_DESIGN.md)
- Security & authentication: [SECURITY_AUTH_SPEC.md](SECURITY_AUTH_SPEC.md)
- Billing evolution (Stages 5-7): [BILLING_EVOLUTION.md](BILLING_EVOLUTION.md)
- API contracts: [ACCOUNTS_API_KEY_ENDPOINTS.md](ACCOUNTS_API_KEY_ENDPOINTS.md)

**Scope:** Frontend wallet connectivity using wagmi/RainbowKit, SIWE-based authentication with session management, and wallet-linked chat UI integration. For billing system evolution (dual-cost, markup, profit enforcement), see [BILLING_EVOLUTION.md](BILLING_EVOLUTION.md).

---

## MVP Wallet Loop Implementation Progress

**Goal:** Implement the wallet-linked MVP loop on top of the existing accounts + credits + completion backend.

### Step 1: Define shared HTTP contract for /api/v1/wallet/link ✅ COMPLETE

**Contract (TARGET - Secure):**

- Request: `WalletLinkRequest { address: string }`
- Response: `WalletLinkResponse { accountId: string }` (no apiKey)

**Legacy (being replaced):** Old contract returned `{ accountId, apiKey }` to browser. This is insecure and being replaced by session-based auth in Step 4A.

**Files Created:**

- `src/contracts/wallet.link.v1.contract.ts` - Contract with Zod schemas
- `tests/unit/contracts/wallet.link.v1.contract.test.ts` - Unit tests

### Step 2: Implement /api/v1/wallet/link backend route ✅ COMPLETE

**Legacy (insecure):** Current implementation returns `{ accountId, apiKey }` to browser. Being replaced in Step 4.1 with session-based auth that returns `{ accountId }` only.

**Files Created:**

- `src/app/api/v1/wallet/link/route.ts` - POST endpoint
- `src/app/_facades/wallet/link.server.ts` - Facade
- `tests/stack/api/wallet/link.stack.test.ts` - Stack tests

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

### Step 4A: Wallet-based login & session (SIWE) ⏸️ PENDING

**Goal:** Implement secure wallet authentication using Sign-In with Ethereum (SIWE) with server-side session management.

**See:** [SECURITY_AUTH_SPEC.md](SECURITY_AUTH_SPEC.md) for complete security architecture and implementation details.

#### 4A.1 Backend: Auth Endpoints ⏸️ PENDING

**Create two auth endpoints for SIWE flow:**

- [ ] `POST /api/v1/auth/nonce`
  - [ ] Input: `{ address: string }`
  - [ ] Generate random 128-bit nonce
  - [ ] Store `{ address, nonce, expiresAt }` in database (5 minute TTL)
  - [ ] Build SIWE-style message with domain, chainId, nonce, timestamp
  - [ ] Return `{ nonce, message }`
  - [ ] Create contract: `src/contracts/auth.nonce.v1.contract.ts`
  - [ ] Tests: happy path, invalid address, expired nonce

- [ ] `POST /api/v1/auth/verify`
  - [ ] Input: `{ address: string, signature: string }`
  - [ ] Recover address from signature using viem
  - [ ] Validate: recovered address matches, nonce valid and not expired
  - [ ] On success:
    - [ ] Resolve `accountId` for wallet (create if needed)
    - [ ] Create session: `{ sessionId, accountId, walletAddress, expiresAt }`
    - [ ] Set HttpOnly session cookie: `Secure; SameSite=Lax; Max-Age=604800`
    - [ ] Return `{ accountId }` (for UX only, NOT apiKey)
  - [ ] Create contract: `src/contracts/auth.verify.v1.contract.ts`
  - [ ] Tests: valid signature, invalid signature, expired nonce, mismatched address

**Files to create:**

- `src/features/auth/services/siwe.service.ts` - SIWE message generation and verification
- `src/features/auth/services/session.service.ts` - Session CRUD operations
- `src/ports/auth.port.ts` - AuthService interface
- `src/adapters/server/auth/session.adapter.ts` - Session storage adapter
- `src/app/api/v1/auth/nonce/route.ts` - Nonce endpoint
- `src/app/api/v1/auth/verify/route.ts` - Verify endpoint
- `src/contracts/auth.nonce.v1.contract.ts` - Nonce contract
- `src/contracts/auth.verify.v1.contract.ts` - Verify contract

#### 4A.2 Backend: Session Storage ⏸️ PENDING

- [ ] Create `sessions` table in database (id, account_id, wallet_address, expires_at, created_at)
- [ ] Create migration: `drizzle/migrations/000X_sessions_table.sql`
- [ ] Update schema: `src/shared/db/schema.ts`
- [ ] **[POST-MVP]** Session cleanup job for expired sessions

**Files to create:**

- Migration file for sessions table
- Update: `src/shared/db/schema.ts`

#### 4A.3 Backend: Session Middleware ⏸️ PENDING

- [ ] Create session middleware for protected routes:
  - [ ] Extract session cookie from request
  - [ ] Validate session exists and not expired
  - [ ] Load `accountId` and `walletAddress` from session
  - [ ] Attach to request context
  - [ ] Return 401 if session invalid
- [ ] Apply middleware to protected routes

**Files to create:**

- `src/middleware/session.middleware.ts` - Session validation
- `src/app/_middleware/auth.ts` - Route-level auth helpers

#### 4A.4 Frontend: SIWE Sign-In Flow ⏸️ PENDING

- [ ] Implement SIWE authentication flow (nonce → sign → verify)
- [ ] Remove all localStorage API key storage
- [ ] Remove Authorization header from chat requests
- [ ] **[POST-MVP]** React context for `accountId` display (optional UX)

**Files to create:**

- `src/features/auth/hooks/use-siwe-auth.ts` - SIWE auth hook
- Update: `src/app/wallet-test/page.tsx` - Add SIWE demo

### Step 4: Wire wallet-linked chat via session ⏸️ PENDING

**Goal:** User connects wallet, authenticates via SIWE, and successfully chats with session-based authentication while credits are debited.

**Security Note:** API keys are server-only secrets. Browser authenticates with HttpOnly session cookie. See [SECURITY_AUTH_SPEC.md](SECURITY_AUTH_SPEC.md).

#### 4.1 Backend: Update Wallet Link Endpoint ⏸️ PENDING

**Current (INSECURE - TO BE REPLACED):**

- [x] Returns `{ accountId, apiKey }` to browser (INSECURE)
- [x] Client stores apiKey in localStorage (INSECURE)
- [x] Uses `LITELLM_MVP_API_KEY` for all wallets

**Target (SECURE):**

- [ ] Update `/api/v1/wallet/link` to use session authentication:
  - [ ] Require valid session (middleware enforces)
  - [ ] Read `accountId` from session context
  - [ ] Ensure account exists via `AccountService.ensureAccountExists(accountId)`
  - [ ] Ensure apiKey exists for account (store server-side only)
  - [ ] Return ONLY `{ accountId }` (no apiKey)
  - [ ] Update contract: `WalletLinkResponse { accountId: string }`
- [ ] Update tests to use session-based auth
- [ ] Add apiKey storage to accounts table (if not exists)

**Files:**

- Update: `src/contracts/wallet.link.v1.contract.ts` - Remove apiKey from response
- Update: `src/app/api/v1/wallet/link/route.ts` - Use session auth
- Update: `src/app/_facades/wallet/link.server.ts` - Store apiKey server-side
- Update: `tests/stack/api/wallet/link.stack.test.ts` - Session-based tests

#### 4.2 Backend: Update AI Completion Auth (Dual Mode) ⏸️ PENDING

**Current (API Key Only):**

- [x] Requires `Authorization: Bearer <apiKey>` header
- [x] Derives `accountId` from `apiKey`
- [x] Constructs `LlmCaller { accountId, apiKey }`

**Target (Dual Auth Mode):**

- [ ] Update `/api/v1/ai/completion` to support both auth modes:
  - [ ] **Primary mode: Session cookie**
    - [ ] Check for valid session cookie first
    - [ ] Read `accountId` from session
    - [ ] Look up `apiKey` server-side from `accountId`
    - [ ] Construct `LlmCaller { accountId, apiKey }`
  - [ ] **Fallback mode: API key header** (for programmatic clients)
    - [ ] If no session, check `Authorization: Bearer <apiKey>`
    - [ ] Derive `accountId` from `apiKey` (existing logic)
    - [ ] Construct `LlmCaller { accountId, apiKey }`
  - [ ] Return 401 if neither auth mode present
- [ ] Update tests to cover both auth modes
- [ ] Existing credits + ledger logic unchanged

**Files:**

- Update: `src/app/api/v1/ai/completion/route.ts` - Add session auth mode
- Update: `tests/stack/api/ai/completion.stack.test.ts` - Test both auth modes

#### 4.3 Frontend: Wallet Connect + SIWE Auth ⏸️ PENDING

- [x] Install and configure wagmi + RainbowKit + React Query providers
- [x] Verify `/wallet-test` page can connect a wallet
- [ ] Add wallet connect + SIWE auth UI (header or landing hero)
- [ ] After wallet connects:
  - [ ] Read `address` from `useAccount()`
  - [ ] Implement SIWE flow (see Step 4A.4):
    - [ ] Call `POST /api/v1/auth/nonce` with address
    - [ ] Request signature via `signMessage`
    - [ ] Call `POST /api/v1/auth/verify` with signature
  - [ ] Store `accountId` in React context for UX only (optional, NOT for auth)
  - [ ] Session cookie handled automatically by browser
- [ ] Call `POST /api/v1/wallet/link` after successful auth
  - [ ] Session cookie sent automatically
  - [ ] Receives `{ accountId }` only (no apiKey)

**Files to create:**

- `src/features/auth/hooks/use-siwe-auth.ts` - SIWE authentication hook
- `src/features/auth/context/auth-context.tsx` - Optional context for accountId display
- Update: `src/app/wallet-test/page.tsx` - Add SIWE demo

**Reference:**

- Existing: `src/app/providers/wallet.client.tsx`
- Security spec: `docs/SECURITY_AUTH_SPEC.md`

#### 4.4 Frontend: Session-Based Chat UI ⏸️ PENDING

- [ ] Create `ChatPage` with:
  - [ ] Messages list
  - [ ] Input box + submit
  - [ ] Wallet connection status
- [ ] On submit:
  - [ ] Call `/api/v1/ai/completion` with body `{ messages }`
  - [ ] NO Authorization header (session cookie sent automatically)
  - [ ] Browser handles session cookie transparently
- [ ] Render:
  - [ ] Assistant messages on success
  - [ ] Explicit error UI for:
    - [ ] 401 (not authenticated - redirect to SIWE login)
    - [ ] 402 (insufficient credits)
    - [ ] 403 (account not found / invalid session)
    - [ ] 5xx (generic failure)

**Files to create:**

- `src/features/chat/` - New feature slice (or extend existing)
- `src/features/chat/components/chat-page.tsx`
- `src/features/chat/components/message-list.tsx`
- `src/features/chat/components/chat-input.tsx`
- `src/features/chat/hooks/use-chat.ts`

**Reference:**

- Completion route: `src/app/api/v1/ai/completion/route.ts`
- Security spec: `docs/SECURITY_AUTH_SPEC.md`

#### 4.5 End-to-End Verification ⏸️ PENDING

- [ ] Admin seeds credits manually
- [ ] Basic flow: Connect wallet → SIWE auth → chat → observe credits debited
- [ ] Verify: Session cookie set, apiKey never visible in browser
- [ ] **[POST-MVP]** Comprehensive e2e test suite

**Test files to create:**

- `tests/e2e/wallet-siwe-chat-flow.e2e.test.ts` - Basic flow test

---

## High-Level Flow (with SIWE Auth)

### Authentication (Step 4A)

1. User connects an EVM wallet in the browser (wagmi/RainbowKit).
2. Frontend calls `/api/v1/auth/nonce` with wallet address → receives nonce and SIWE message.
3. User signs SIWE message with wallet.
4. Frontend calls `/api/v1/auth/verify` with signature:
   - Backend verifies signature matches wallet address.
   - Backend resolves/creates `accountId` for this wallet.
   - Backend creates server-side session: `{ sessionId, accountId, walletAddress, expiresAt }`.
   - Backend sets HttpOnly session cookie.
   - Returns `{ accountId }` to frontend (for UX only, not auth).
5. Frontend optionally stores `accountId` in React context for display.
6. Session cookie automatically sent on all subsequent requests.

### Wallet Linking (Step 4)

7. Frontend calls `/api/v1/wallet/link` (session cookie sent automatically):
   - Backend reads `accountId` from session.
   - Ensures account exists (`ensureAccountExists(accountId)`).
   - Ensures LiteLLM `apiKey` exists for account (stored server-side only).
   - Returns `{ accountId }` to frontend (no apiKey exposed).

### Chat Requests (Step 4)

8. Frontend calls `/api/v1/ai/completion` with `{ messages }`:
   - NO Authorization header (session cookie sent automatically).
   - Backend validates session cookie → extracts `accountId`.
   - Backend looks up `apiKey` server-side from `accountId`.
   - Backend constructs `LlmCaller { accountId, apiKey }`.
   - Backend calls completion feature:
     - Calls LiteLLM via `LlmService` with `apiKey`.
     - Computes cost from token usage.
     - Debits credits via `AccountService.debitForUsage`.
   - Returns assistant message to frontend.

**Security Invariant:** API key never leaves the server. Browser authenticates with HttpOnly session cookie only.

LiteLLM does upstream usage/cost tracking; our Postgres ledger tracks internal credits.

---

## Frontend: Wallet + Session-Based Auth

### Libraries

- **RainbowKit**: wallet connect UI.
- **wagmi**: React hooks for EVM account/chain, including `signMessage` for SIWE.
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
- [ ] TODO Step 4: Add to header or home page with SIWE integration

#### 3. SIWE Authentication Flow (Step 4A)

After wallet connection: Call `/auth/nonce` → wallet signs message → call `/auth/verify` → session cookie set automatically (HttpOnly).

**Security:** No localStorage, no Authorization headers. Session cookie sent automatically on all requests.

#### 4. Wallet Link & Chat (Step 4)

After authentication, call `/wallet/link` → returns `{ accountId }` (no apiKey).

Chat requests: Call `/ai/completion` with NO Authorization header (session cookie sent automatically).

**Security:** API key looked up server-side from session's `accountId`.

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

**Responsibilities (Session-Based):**

[ ] Require valid session (middleware enforces)
[ ] Read `accountId` from session context
[ ] Parse `{ address }` from body (for audit/validation)
[ ] Ensure account exists:

- [ ] Call `accountService.ensureAccountExists(accountId)`
- [ ] Ensure LiteLLM `apiKey` exists for account (stored server-side only)
      [ ] Return `{ accountId }` to the client (no apiKey exposed)
- **accountId is treated strictly as a billing tenant; wallet addresses are linked separately and must not be encoded into accountId.**

### `/api/v1/ai/completion` Route

**Responsibilities (Dual Auth Mode):**

[ ] **Primary mode: Session cookie auth**

- [ ] Check for valid session cookie
- [ ] If present: read `accountId` from session, look up `apiKey` server-side
- [ ] Construct `LlmCaller { accountId, apiKey }`

[ ] **Fallback mode: API key header** (for programmatic clients)

- [ ] If no session: extract `Authorization: Bearer <apiKey>` header
- [ ] If present: derive `accountId` from `apiKey`, construct `LlmCaller`

[ ] If neither mode present → 401

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
2. Authenticates via SIWE (obtains session cookie).
3. Calls AI endpoints (session cookie sent automatically).
4. Optionally displays `accountId` for UX (not used for auth).

---

## Implementation Summary

### Frontend

[ ] RainbowKit + wagmi handle wallet connections
[ ] Implement SIWE authentication flow (nonce → sign → verify → session)
[ ] Session cookie automatically sent on all requests (HttpOnly, Secure)
[ ] NO Authorization headers for session-based clients
[ ] NO localStorage for API keys

### Backend

[ ] SIWE endpoints for wallet authentication (`/auth/nonce`, `/auth/verify`)
[ ] Session storage (Postgres table with accountId, walletAddress, expiresAt)
[ ] Session middleware for protected routes
[ ] Next.js app routes construct `LlmCaller` from session or API key header
[ ] Dual auth mode: session cookies (primary) + API key headers (programmatic clients)
[ ] API keys stored and looked up server-side only
[ ] Delegate to:

- [ ] `LlmService` (LiteLLM adapter) for model calls
- [ ] `AccountService` (Drizzle adapter) for credit debits/credits via ledger

### Architecture

The hexagonal architecture remains intact; SIWE authentication and sessions are new adapters in the auth layer. The core `LlmCaller` + Accounts & Credits system is unchanged. API keys become server-only secrets looked up from `accountId`.
