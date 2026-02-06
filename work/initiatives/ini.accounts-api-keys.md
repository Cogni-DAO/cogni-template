---
work_item_id: ini.accounts-api-keys
work_item_type: initiative
title: Accounts, API Keys & Wallet Authentication
state: Active
priority: 1
estimate: 5
summary: SIWE wallet authentication, session management, server-side API key storage, and session-based chat integration
outcome: Users authenticate via SIWE, API keys never leave server, chat uses session cookies instead of Authorization headers
assignees: derekg1729
created: 2026-02-06
updated: 2026-02-06
labels: [auth, wallet, accounts]
---

# Accounts, API Keys & Wallet Authentication

## Goal

Replace insecure browser-side API key storage with SIWE (Sign-In with Ethereum) wallet authentication and server-side session management. Users connect wallet → sign SIWE message → get HttpOnly session cookie → chat with session auth. API keys become server-only secrets.

## Roadmap

### Crawl (P0) — Current State

**Goal:** Wallet connectivity and basic account/credits backend.

> Source: INTEGRATION_WALLETS_CREDITS.md Steps 1-3 (completed)

| Deliverable                                                 | Status | Est | Work Item |
| ----------------------------------------------------------- | ------ | --- | --------- |
| Wallet link HTTP contract (`/api/v1/wallet/link`)           | Done   | 1   | —         |
| Wallet link backend route (returns accountId + apiKey)      | Done   | 1   | —         |
| wagmi/RainbowKit/React Query providers (SSR-safe)           | Done   | 2   | —         |
| Client env schema with NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID | Done   | 1   | —         |

### Walk (P1) — SIWE Authentication

**Goal:** Implement secure wallet-based authentication with server-side sessions.

> Source: INTEGRATION_WALLETS_CREDITS.md Step 4A

| Deliverable                                         | Status      | Est | Work Item            |
| --------------------------------------------------- | ----------- | --- | -------------------- |
| 4A.1 Auth endpoints (`/auth/nonce`, `/auth/verify`) | Not Started | 3   | (create at P1 start) |
| 4A.2 Session storage (sessions table + migration)   | Not Started | 1   | (create at P1 start) |
| 4A.3 Session middleware for protected routes        | Not Started | 2   | (create at P1 start) |
| 4A.4 Frontend SIWE sign-in flow                     | Not Started | 2   | (create at P1 start) |

#### 4A.1 Auth Endpoints

**`POST /api/v1/auth/nonce`:**

- Input: `{ address: string }`
- Generate random 128-bit nonce
- Store `{ address, nonce, expiresAt }` in database (5 minute TTL)
- Build SIWE-style message with domain, chainId, nonce, timestamp
- Return `{ nonce, message }`
- Contract: `src/contracts/auth.nonce.v1.contract.ts`
- Tests: happy path, invalid address, expired nonce

**`POST /api/v1/auth/verify`:**

- Input: `{ address: string, signature: string }`
- Recover address from signature using viem
- Validate: recovered address matches, nonce valid and not expired
- On success: resolve `accountId` for wallet (create if needed), create session `{ sessionId, accountId, walletAddress, expiresAt }`, set HttpOnly cookie (`Secure; SameSite=Lax; Max-Age=604800`), return `{ accountId }` (for UX only, NOT apiKey)
- Contract: `src/contracts/auth.verify.v1.contract.ts`
- Tests: valid signature, invalid signature, expired nonce, mismatched address

**Files to create:**

- `src/features/auth/services/siwe.service.ts` — SIWE message generation and verification
- `src/features/auth/services/session.service.ts` — Session CRUD operations
- `src/ports/auth.port.ts` — AuthService interface
- `src/adapters/server/auth/session.adapter.ts` — Session storage adapter
- `src/app/api/v1/auth/nonce/route.ts` — Nonce endpoint
- `src/app/api/v1/auth/verify/route.ts` — Verify endpoint
- `src/contracts/auth.nonce.v1.contract.ts` — Nonce contract
- `src/contracts/auth.verify.v1.contract.ts` — Verify contract

#### 4A.2 Session Storage

- Create `sessions` table in database (id, account_id, wallet_address, expires_at, created_at)
- Create migration: `drizzle/migrations/000X_sessions_table.sql`
- Update schema: `src/shared/db/schema.ts`
- **[POST-MVP]** Session cleanup job for expired sessions

#### 4A.3 Session Middleware

- Create session middleware for protected routes: extract session cookie → validate not expired → load accountId/walletAddress → attach to request context → 401 if invalid
- Apply middleware to protected routes
- Files: `src/middleware/session.middleware.ts`, `src/app/_middleware/auth.ts`

#### 4A.4 Frontend SIWE Sign-In Flow

- Implement SIWE authentication flow (nonce → sign → verify)
- Remove all localStorage API key storage
- Remove Authorization header from chat requests
- **[POST-MVP]** React context for `accountId` display (optional UX)
- Files: `src/features/auth/hooks/use-siwe-auth.ts`, update `src/app/wallet-test/page.tsx`

### Run (P2) — Session-Based Chat Integration

**Goal:** Wire wallet auth into the full chat loop with session-based credentials.

> Source: INTEGRATION_WALLETS_CREDITS.md Step 4

| Deliverable                                  | Status      | Est | Work Item            |
| -------------------------------------------- | ----------- | --- | -------------------- |
| 4.1 Update wallet link to session auth       | Not Started | 2   | (create at P2 start) |
| 4.2 Dual-auth completion (session + API key) | Not Started | 2   | (create at P2 start) |
| 4.3 Frontend wallet + SIWE auth UI           | Not Started | 2   | (create at P2 start) |
| 4.4 Session-based chat UI                    | Not Started | 3   | (create at P2 start) |
| 4.5 End-to-end verification                  | Not Started | 1   | (create at P2 start) |

#### 4.1 Update Wallet Link Endpoint

**Current (insecure):** Returns `{ accountId, apiKey }` to browser; client stores apiKey in localStorage; uses `LITELLM_MVP_API_KEY` for all wallets.

**Target (secure):** Require valid session (middleware enforces) → read accountId from session → ensure account exists → ensure apiKey exists server-side → return ONLY `{ accountId }` (no apiKey). Update contract: `WalletLinkResponse { accountId: string }`.

- Add apiKey storage to accounts table (if not exists)

Files: update `src/contracts/wallet.link.v1.contract.ts`, `src/app/api/v1/wallet/link/route.ts`, `src/app/_facades/wallet/link.server.ts`, `tests/stack/api/wallet/link.stack.test.ts`

#### 4.2 Dual-Auth Completion

**Current:** API key only (`Authorization: Bearer <apiKey>` header).

**Target:** Primary mode: session cookie auth (read accountId from session, look up apiKey server-side). Fallback mode: API key header (for programmatic clients). 401 if neither present. Credits + ledger logic unchanged. Handle `InsufficientCreditsError` by returning a 402-style response while still accepting that the LLM call was made (MVP token waste — tokens are consumed before credit check).

**Completion service call signature:**

```typescript
const message = await completionService.execute(
  messages,
  llmService,
  accountService,
  clock,
  caller
);
```

Files: update `src/app/api/v1/ai/completion/route.ts`, `tests/stack/api/ai/completion.stack.test.ts`

#### 4.3 Frontend Wallet + SIWE Auth

- Add wallet connect + SIWE auth UI (header or landing hero)
- After wallet connects: read address → SIWE flow (nonce → sign → verify) → session cookie set → call wallet/link → receive `{ accountId }` only
- Files: `src/features/auth/hooks/use-siwe-auth.ts`, `src/features/auth/context/auth-context.tsx`, update `src/app/wallet-test/page.tsx`

#### 4.4 Session-Based Chat UI

- Create `ChatPage` with messages list, input box + submit, wallet connection status
- On submit: call `/api/v1/ai/completion` with `{ messages }`, NO Authorization header (session cookie automatic)
- Error handling: 401 → redirect to SIWE login, 402 → insufficient credits, 403 → invalid session, 5xx → generic failure
- Files: `src/features/chat/` feature slice, `chat-page.tsx`, `message-list.tsx`, `chat-input.tsx`, `use-chat.ts`

#### 4.5 End-to-End Verification

- Admin seeds credits manually
- Basic flow: Connect wallet → SIWE auth → chat → observe credits debited
- Verify: Session cookie set, apiKey never visible in browser
- **[POST-MVP]** Comprehensive e2e test suite
- File: `tests/e2e/wallet-siwe-chat-flow.e2e.test.ts`

## Constraints

- **API key never leaves the server** — browser authenticates with HttpOnly session cookie only
- **accountId is a billing tenant** — wallet addresses linked separately, never encoded into accountId
- Hexagonal architecture must remain intact — SIWE/sessions are new adapters, core LlmCaller + Accounts unchanged

## Dependencies

- [ ] Security auth spec implementation (session model)
- [ ] Accounts design spec implementation (AccountService methods)

## As-Built Specs

- [security-auth.md](../../docs/spec/security-auth.md) — authentication architecture
- [accounts-design.md](../../docs/ACCOUNTS_DESIGN.md) — accounts and credits system (pending migration)
- [billing-evolution.md](../../docs/spec/billing-evolution.md) — billing stages

## Design Notes

### High-Level Flow (Target Architecture)

> Source: INTEGRATION_WALLETS_CREDITS.md § High-Level Flow

**Authentication (Step 4A):**

1. User connects EVM wallet (wagmi/RainbowKit)
2. Frontend calls `/api/v1/auth/nonce` → receives nonce + SIWE message
3. User signs SIWE message
4. Frontend calls `/api/v1/auth/verify` → backend verifies, creates session, sets HttpOnly cookie, returns `{ accountId }`
5. Frontend optionally stores `accountId` in React context for display
6. Session cookie sent automatically on all subsequent requests

**Wallet Linking + Chat (Step 4):**

7. Frontend calls `/api/v1/wallet/link` (session cookie auto) → backend reads accountId from session, ensures account + apiKey exist server-side, returns `{ accountId }` only
8. Frontend calls `/api/v1/ai/completion` with `{ messages }` (no Authorization header) → backend validates session → looks up apiKey server-side → calls LiteLLM → debits credits → returns response

LiteLLM does upstream usage/cost tracking; Postgres ledger tracks internal credits.

### AccountService Methods

> Source: INTEGRATION_WALLETS_CREDITS.md § Credits & Ledger Integration

- `ensureAccountExists(accountId)` — called from wallet/link and completion before usage
- `debitForUsage(...)` — after LLM usage, runs in DB transaction (ledger insert + balance update + negative-balance check)
- `creditAccount(...)` — manual top-ups (MVP); later: on-chain USDC watcher

Frontend never directly manipulates balances.
