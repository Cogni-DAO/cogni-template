# Security & Authentication Specification

**Purpose:** Define the SIWE-based wallet authentication system for wallet-linked chat.

**Scope:** Session-based authentication using Sign-In with Ethereum (SIWE), replacing the insecure localStorage API key pattern.

**Related:**

- Wallet integration: [INTEGRATION_WALLETS_CREDITS.md](INTEGRATION_WALLETS_CREDITS.md) (Steps 4A and 4)
- System architecture: [ACCOUNTS_DESIGN.md](ACCOUNTS_DESIGN.md)

---

## Legacy Pattern (Being Replaced)

**What exists today:** `/api/v1/wallet/link` returns `{ accountId, apiKey }` to browser. Frontend stores apiKey in localStorage and sends `Authorization: Bearer <apiKey>` on every request.

**Why replacing:** Exposes service API key to JavaScript (XSS risk), no session management, API key is not a user credential.

**Decision:** Implement SIWE + sessions NOW (Step 4A).

---

## Target Architecture: SIWE + Sessions

### Core Principle

**API keys are server-only secrets.**

- Stored in Postgres (accounts table or future account_api_keys table)
- Loaded per-request: `session → accountId → apiKey` (server-side lookup)
- NEVER returned to browser, NEVER in localStorage, NEVER in client JS

**Sessions are the client auth credential.**

- Browser holds HttpOnly session cookie
- Server resolves: `session cookie → session table → accountId → apiKey`
- Wallet address used ONCE during login, then just UX

### Identity Model

**Account ID (`accountId`)**

- Billing tenant identifier (not 1:1 with wallet addresses)
- Server-side auth: session → accountId
- Optional client exposure for UX only (React context for display)
- NOT an auth primitive, NOT used for authorization decisions

**Wallet Address**

- Used during SIWE login to prove ownership
- Stored as nullable `primary_wallet_address` on accounts (non-unique)
- Future: `account_wallet_links` table for multi-wallet support (no schema now)

**API Key (`apiKey`)**

- LiteLLM virtual key for upstream provider calls
- Server-only secret, looked up from accountId
- Browser never sees it

---

## Step 4A: SIWE Authentication Flow

### Overview

1. User connects wallet (wagmi/RainbowKit)
2. Frontend calls `/api/v1/auth/nonce` with wallet address
3. Server generates nonce, stores temporarily, returns SIWE message
4. User signs message with wallet
5. Frontend calls `/api/v1/auth/verify` with signature
6. Server verifies signature, creates session, sets HttpOnly cookie
7. All subsequent requests authenticated via session cookie

### Endpoint 1: POST /api/v1/auth/nonce

**Request:**

```typescript
{
  address: string;
}
```

**Behavior:**

1. Generate random 128-bit nonce
2. Store `{ address, nonce, expiresAt }` in database or Redis (5 minute TTL)
3. Build SIWE-style message:
   - Domain: server hostname
   - Chain ID: from request or default
   - Nonce: generated value
   - Issued At: current timestamp

**Response:**

```typescript
{
  nonce: string,
  message: string  // SIWE-formatted message for wallet to sign
}
```

**Implementation Note:** SIWE message format is minimal for MVP. Core elements:

```
${domain} wants you to sign in with your Ethereum account:
${address}

URI: ${uri}
Version: 1
Chain ID: ${chainId}
Nonce: ${nonce}
Issued At: ${issuedAt}
```

Full SIWE spec compliance not required; just enough for nonce + domain + wallet-sign + verify pattern.

### Endpoint 2: POST /api/v1/auth/verify

**Request:** `{ address: string, signature: string }`

**Behavior:**

1. Recover address from message + signature (viem)
2. Validate: recovered address matches, nonce valid and not expired
3. On success:
   - Resolve `accountId` for wallet
   - Create session: `{ sessionId, accountId, walletAddress, expiresAt }`
   - Set HttpOnly cookie
4. Return `{ accountId }` (for UX only, NOT apiKey)

**Cookie:** `Set-Cookie: session=<id>; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`

### Session Storage

**Session Table Schema (Postgres):**

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,             -- Opaque UUID
  account_id TEXT NOT NULL REFERENCES accounts(id),
  wallet_address TEXT NOT NULL,    -- For audit/display
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_sessions_account_id ON sessions(account_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
```

**Cookie Design:**

Cookie stores **opaque sessionId** (NOT JWT payload). Session data lives in Postgres.

**Reference:** Inspired by [next-saas-starter's session.ts](https://github.com/nextjs/saas-starter/blob/main/lib/auth/session.ts) cookie handling pattern, adapted for opaque sessions.

**Cookie Helper Module (`src/features/auth/services/cookie-session.ts`):**

```typescript
// Read sessionId from cookie
function getSessionIdFromRequest(req: Request): string | null;

// Set session cookie after SIWE verification
function setSessionCookie(
  res: Response,
  sessionId: string,
  expiresAt: Date
): void;

// Clear session cookie on logout
function clearSessionCookie(res: Response): void;
```

**Cookie Properties (from next-saas-starter):**

- `httpOnly: true` - XSS protection
- `secure: true` - HTTPS only
- `sameSite: 'lax'` - CSRF protection
- `expires: Date` - From session row's expiresAt

**Key Difference from next-saas-starter:**

- They use JWT (signed token with `{ user: { id }, expires }` payload)
- We use opaque sessionId (Postgres is source of truth)
- Our approach enables proper logout/invalidation (delete row)

---

## Step 4: Updated Endpoint Behavior

### POST /api/v1/wallet/link

**Behavior:**

- Require valid session (middleware enforces)
- Read `accountId` from session
- Ensure account exists + apiKey exists (server-side only)
- Return `{ accountId }` (no apiKey)

### POST /api/v1/ai/completion

**Dual Auth Mode:**

1. **Primary:** Check session cookie → get `accountId` → look up `apiKey` server-side
2. **Fallback:** Check `Authorization: Bearer <apiKey>` header (for programmatic clients)
3. Return 401 if neither present

Construct `LlmCaller { accountId, apiKey }` and proceed with existing completion logic.

---

## Frontend Changes

**SIWE Flow:** Call `/auth/nonce` → wallet signs message → call `/auth/verify` → session cookie set automatically.

**Chat Requests:** Call `/ai/completion` with NO Authorization header (session cookie sent automatically).

**No localStorage** for API keys. Optional: store `accountId` in React context for display only.

---

## Implementation Checklist

### Backend (MVP)

- [ ] Add `sessions` table to database schema
- [ ] Create cookie helper module (`src/features/auth/services/cookie-session.ts`)
  - [ ] `getSessionIdFromRequest(req)` - Read opaque sessionId from cookie
  - [ ] `setSessionCookie(res, sessionId, expiresAt)` - Set HttpOnly cookie
  - [ ] `clearSessionCookie(res)` - Clear cookie on logout
  - [ ] Reference: next-saas-starter's cookie pattern (httpOnly, secure, sameSite=lax)
- [ ] Implement `POST /api/v1/auth/nonce` endpoint with contract
- [ ] Implement `POST /api/v1/auth/verify` endpoint with contract
  - [ ] After SIWE verification, create session row in Postgres
  - [ ] Call `setSessionCookie(res, sessionId, expiresAt)`
- [ ] Create `AuthService` port and adapter (SIWE + session CRUD)
- [ ] Create session lookup helper for protected routes
  - [ ] Call `getSessionIdFromRequest(req)`
  - [ ] Load session row from Postgres
  - [ ] Return `{ accountId, walletAddress, expiresAt }` or null
- [ ] Add session middleware for protected routes
- [ ] Update `/api/v1/wallet/link` to use session auth
- [ ] Update `/api/v1/ai/completion` to support dual auth
- [ ] Add `api_key` column to `accounts` (if not exists)

### Frontend (MVP)

- [ ] Implement SIWE sign-in flow (nonce → sign → verify)
- [ ] Remove localStorage API key storage
- [ ] Remove Authorization header from chat requests
- [ ] Update wallet test page

### POST-MVP

- [ ] Session cleanup job (expired sessions)
- [ ] React context for accountId display (optional UX)
- [ ] Multi-wallet support (`account_wallet_links` table)

---

## Security Properties

### What This Achieves

1. **XSS Protection**: HttpOnly cookies cannot be read by JavaScript
2. **CSRF Protection**: SameSite=Lax prevents cross-origin requests
3. **Credential Separation**: API keys (service credentials) never exposed to clients
4. **Session Management**: Proper logout, expiration, and revocation support
5. **Audit Trail**: Sessions table tracks wallet associations for compliance

### What This Does NOT Cover (Out of Scope)

- Multi-wallet per account (future: `account_wallet_links` table)
- Session refresh/rotation (fixed 7-day expiry for MVP)
- Rate limiting per session
- IP-based session validation
- OAuth/social login
- Two-factor authentication
- Organizations/roles/permissions

---

## Future: Multi-Wallet Support

**Current (MVP):** One wallet per account, stored as `primary_wallet_address` (nullable, non-unique).

**Future:** Multiple wallets per account via join table:

```sql
-- NOT IMPLEMENTED YET, just design intent
CREATE TABLE account_wallet_links (
  id UUID PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  wallet_address TEXT NOT NULL,
  is_primary BOOLEAN DEFAULT false,
  linked_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(account_id, wallet_address)
);
```

**Why not now:**

- MVP only needs one wallet → one account mapping
- `/wallet/link` can evolve to handle multi-wallet later
- No breaking changes to session or auth flow
- Keeps implementation focused

---

## Migration Path

### From Current Insecure State

1. Implement Step 4A (SIWE + sessions)
2. Update Step 4 endpoints to use sessions
3. Deploy backend changes
4. Update frontend to remove localStorage pattern
5. Test end-to-end flow with session-based auth
6. Keep API key auth mode for programmatic clients only

### No Breaking Changes to Downstream

- Billing logic (Stages 5-7) unchanged
- Credits and ledger system unchanged
- LLM integration unchanged
- AccountService interface unchanged (internal apiKey lookup added)

---

## Summary

**One sentence:** Browser authenticates with SIWE-signed message → receives HttpOnly session cookie (opaque sessionId) → server looks up session + apiKey from Postgres for LLM calls.

**Key invariants:**

- API keys never leave the server
- Cookie stores opaque sessionId (NOT JWT payload)
- Postgres sessions table is source of truth
- Session data: `{ accountId, walletAddress, expiresAt }`

**Reference:** Cookie handling inspired by [next-saas-starter](https://github.com/nextjs/saas-starter/blob/main/lib/auth/session.ts), adapted for opaque Postgres-backed sessions instead of JWT.
