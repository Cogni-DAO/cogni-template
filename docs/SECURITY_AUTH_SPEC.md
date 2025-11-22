# Security & Authentication Specification

**Purpose:** Define the Auth.js + SIWE wallet authentication system for wallet-linked chat.

**Scope:** Session-based authentication using Auth.js Credentials provider with the official `siwe` library for EIP-4361 message verification, replacing the insecure localStorage API key pattern.

**Related:**

- Wallet integration: [INTEGRATION_WALLETS_CREDITS.md](INTEGRATION_WALLETS_CREDITS.md)
- System architecture: [ACCOUNTS_DESIGN.md](ACCOUNTS_DESIGN.md)

---

## One Sentence Summary

User signs SIWE message via RainbowKit → Auth.js Credentials provider creates Postgres session → API routes read session → resolve user.id → billing_account → default virtual_key → LiteLLM call.

---

## True MVP Definition

**What MVP includes:**

- Auth.js session-only authentication (HttpOnly cookies, no Bearer token support)
- SIWE via Credentials provider + `siwe` library
- Session → user.id → billing_account → virtual_key resolution
- LiteLLM virtual key provisioning on first login (via `/key/generate` with master key)
- Credit deduction per LLM request
- Clean database reset (no migration from old schema)

**What MVP explicitly excludes (post-MVP):**

- Programmatic access via `Authorization: Bearer <virtual_key>` header (session-only for MVP)
- Multi-wallet per user
- On-chain payment integration
- Custom `/api/v1/auth/*` endpoints (we only use Auth.js `/api/auth/*`)

---

## API Auth Policy (MVP)

**Architectural Principle:** Versioned APIs (`/api/v1/*`) are protected product surfaces. Unversioned infrastructure/meta endpoints (`/health`, `/openapi.json`, `/meta/*`) are intentionally public and live outside versioned paths.

**MVP supports Auth.js sessions only.** Programmatic access via `Authorization: Bearer <virtual_key>` and an operator/control-plane HTTP API are explicitly post-MVP.

**Public Infrastructure/Meta Endpoints (No Auth Required):**

- `/health` - Healthcheck for liveness/readiness probes
- `/openapi.json` - OpenAPI specification document
- `/meta/route-manifest` - Route manifest for testing/debugging
- `/api/auth/*` - Auth.js routes (signin, signout, session, csrf)

**User Session Required (Versioned Product API):**

- `/api/v1/ai/*` - All LLM and credit-impacting endpoints
  - `/api/v1/ai/completion` - Chat endpoint with credit deduction
- Any new `/api/v1/*` routes that use LLM or affect credits must be session-protected

**Payment Endpoints (User Session Required):**

- `POST /api/v1/payments/resmic/confirm` - Resmic payment confirmation for credit top-ups (SIWE session with HttpOnly cookie, billing_account_id derived from session)

**Provisioning & Operations (Not HTTP in MVP):**

- **Virtual key provisioning:** Happens internally in `src/lib/auth/mapping.ts` via `getOrCreateBillingAccountForUser(user)` using LiteLLM MASTER_KEY, not via HTTP endpoints
- **Credit top-ups (real users):** Handled via Resmic confirm endpoint (`POST /api/v1/payments/resmic/confirm`). The endpoint requires an active SIWE session, resolves `billing_account_id` from the session (not from request body), inserts positive `credit_ledger` entry with `reason='resmic_payment'`, and updates `billing_accounts.balance_credits`. Dev/test environments can seed credits via database fixtures.
- **Future operator API:** Post-MVP may add `/api/operator/*` for key management, analytics, and manual adjustments

**Future On-Chain Watcher (Post-MVP):**

- A Ponder-based on-chain indexer will run as a separate internal service (not a public endpoint) that reads from Base/Base Sepolia RPC and indexes USDC transfers into the DAO wallet.
- Ponder will either connect directly to the same Postgres or expose a private HTTP/GraphQL API for reconciliation jobs.
- All writes to `credit_ledger` still go through our app's business logic; Ponder provides an independent view for observability and fraud detection.
- **Full spec:** See `docs/PAYMENTS_PONDER_VERIFICATION.md`.

---

## Legacy Pattern (Being Replaced)

**What exists today:** `/api/v1/wallet/link` returns `{ accountId, apiKey }` to browser. Frontend stores apiKey in localStorage and sends `Authorization: Bearer <apiKey>` on every request.

**Why replacing:** Exposes service API key to JavaScript (XSS risk), no session management, API key is not a user credential.

**Decision:** Use industry-standard Auth.js with a Credentials provider that implements SIWE (Sign-In with Ethereum) via the official `siwe` library for message parsing and signature verification, instead of maintaining custom authentication code.

---

## Target Architecture: Auth.js + SIWE

### Core Principle

**LiteLLM virtual keys are server-only secrets.**

- Stored in Postgres `virtual_keys` table, linked to `billing_accounts` via FK
- Loaded per-request: Auth.js session → user.id → billing_accounts → virtual_keys → LiteLLM virtual key
- NEVER returned to browser, NEVER in localStorage, NEVER in client JS

**Sessions are the client auth credential.**

- Managed by Auth.js (NextAuth v5)
- Browser holds HttpOnly session cookie (set by Auth.js)
- Server resolves: session cookie → Auth.js `users` table → user.id → `billing_accounts.owner_user_id` → default `virtual_keys` row → LiteLLM virtual key
- Wallet address used for login, then just UX

### Identity Model

**Wallet Address (Primary Identity)**

- User signs in with wallet via SIWE
- Stored in Auth.js user/account tables
- Used to look up billing accountId

**Account ID (`accountId`)**

- Billing tenant identifier (not 1:1 with wallet addresses)
- Derived from wallet address or explicit mapping
- Used internally for credit ledger and LiteLLM routing
- Optional client exposure for UX only (NOT for authorization)

**LiteLLM Virtual Key**

- Stored in `virtual_keys` table, linked to `billing_accounts`
- Server-only secret used for upstream LLM provider calls
- Browser never sees it
- Looked up from billing accountId via FK relationship

---

## Dependencies

### NPM Packages

**Required:**

- `next-auth@beta` (v5) - Core authentication framework
- `@auth/drizzle-adapter` - Postgres session storage via Drizzle ORM
- `siwe` - Official Sign-In with Ethereum library
- `viem` - Already installed (used by SIWE for message verification)

**Already Installed:**

- `wagmi` - Wallet connection (existing)
- `@rainbow-me/rainbowkit` - Wallet UI (existing)
- `drizzle-orm` - Database ORM (existing)

### File Structure

**Configuration:**

- `src/auth.ts` - Auth.js configuration (providers, callbacks, session strategy)
- `src/auth.config.ts` (optional) - Shared auth config for middleware

**Database Schema:**

- Auth.js identity tables (via Drizzle adapter): `users`, `accounts` (Auth.js provider accounts), `sessions`, `verification_tokens`
- Our billing tables: `billing_accounts` (renamed to avoid collision), `virtual_keys`, `credit_ledger`
- See "Database Schema" section below for detailed table structure and LiteLLM integration

**API Routes:**

- `/api/auth/*` - Auth.js built-in routes (handled automatically)
  - `/api/auth/signin` - Triggers SIWE flow
  - `/api/auth/session` - Returns current session
  - `/api/auth/signout` - Clears session
  - `/api/auth/csrf` - CSRF token

**Utilities:**

- `src/lib/auth/helpers.ts` - Session lookup utilities (auth(), getSession())
- `src/lib/auth/mapping.ts` - User → billing account resolution (getOrCreateBillingAccountForUser)

**Implementation Files:**

- `src/middleware.ts` - Auth middleware for route protection
- See "API Auth Policy (MVP)" section above for complete list of public vs protected routes

---

## Authentication Flow

### 1. User Signs In with Wallet

**Client Side:**

1. User clicks "Connect Wallet" (RainbowKit)
2. Wallet connects via wagmi
3. Frontend calls NextAuth sign-in: `signIn('credentials', { address, signature })`
4. RainbowKit/wagmi handles SIWE message signing automatically

**Server Side (Auth.js + SIWE):**

1. Auth.js Credentials provider receives `{ message, signature }` from client
2. Server-side: `new SiweMessage(message).verify({ signature })` using `siwe` library
3. On success: Extract wallet address, create/load Auth.js `users` record
4. Auth.js creates session in Postgres `sessions` table
5. Returns HttpOnly session cookie to browser

**SIWE Implementation Note:**

Auth.js does NOT ship a first-class SIWE provider. We implement SIWE using an Auth.js **Credentials provider** plus the official `siwe` library for parsing and verifying EIP-4361 messages. We do NOT maintain custom `/api/v1/auth/nonce` or `/api/v1/auth/verify` endpoints — all auth flows go through Auth.js standard `/api/auth/*` routes.

**Files Involved:**

- `src/auth.ts` - Auth.js config with Credentials provider + `siwe` verification logic
- `src/app/providers/auth.client.tsx` - SessionProvider wrapper
- Auth.js Drizzle adapter - Writes to `users`, `accounts`, `sessions` tables

### 2. Session Cookie Management

**Handled by Auth.js:**

- Cookie name: `authjs.session-token` (production) or `next-auth.session-token` (dev)
- Security: HttpOnly, Secure, SameSite=Lax
- Expiry: 30 days default (configurable in `src/auth.ts`)
- Storage: Postgres via Drizzle adapter

**No custom cookie code needed** - Auth.js handles all cookie operations.

### 3. Protected API Routes

**Example:** `/api/v1/ai/completion/route.ts`

**MVP Per-Request Resolution Flow (Session-Only):**

1. `const session = await auth()` (Auth.js helper). If no session → return 401.
2. Extract `userId = session.user.id` (Auth.js user ID)
3. Call `getOrCreateBillingAccountForUser(userId)` from `src/lib/auth/mapping.ts`
   - Returns `{ billingAccountId, defaultVirtualKeyId, litellmVirtualKey }`
   - On first login, creates `billing_accounts` row with `owner_user_id = userId` and provisions default virtual key (via LiteLLM `/key/generate` with master key)
4. Load default `virtual_keys` row for that `billingAccountId` where `is_default = true AND active = true`
5. Use `virtual_keys.litellm_virtual_key` when calling LiteLLM
6. After LiteLLM call, record usage in `credit_ledger` with `billing_account_id` and `virtual_key_id`

**Key Point:** The `accountId` in `LlmCaller` is the `billing_accounts.id`. API keys are now LiteLLM virtual keys stored in the `virtual_keys` table, NOT directly in a billing_accounts column.

**Post-MVP: Dual Auth Mode (NOT in initial implementation)**

Future enhancement to support programmatic clients:

- Accept `Authorization: Bearer <litellm_virtual_key>` header
- Look up `virtual_keys` by key, resolve to `billing_accounts`, proceed
- MVP is **session-only**; raw Bearer auth is explicitly post-MVP

### 4. Frontend Session Access

**Pattern:**

React components use Auth.js hooks:

**File:** `src/app/providers/auth.client.tsx`

**Usage:**

- Wrap app in `<SessionProvider>`
- Components call `useSession()` hook
- Access user: `session?.user?.address`
- Display wallet address in UI (NOT for authorization)

**No localStorage needed** - session managed by Auth.js.

---

## Database Schema

### Table Name Collision Resolution

**Decision:** Our billing table is renamed from `accounts` to `billing_accounts` to avoid collision with Auth.js's `accounts` table. Auth.js keeps its default table names.

### Auth.js Identity Tables (Managed by Drizzle Adapter)

**Created automatically when Auth.js runs:**

- `users` - User records (includes wallet address from SIWE)
- `accounts` - Auth.js provider accounts (links users to auth providers)
- `sessions` - Active sessions with expiry
- `verification_tokens` - Email verification (unused for SIWE, but Auth.js creates it)

**Migration:** Auth.js Drizzle adapter auto-migrates these tables.

### Our Billing Tables

**File:** `src/shared/db/schema.ts`

**`billing_accounts` table:**

- `id` (PK) - Billing account identifier
- `owner_user_id` (FK → `users.id`) - Auth.js user who owns this billing account
- `balance_credits` - Remaining credits
- Timestamps: `created_at`, `updated_at`

**`virtual_keys` table:**

- `id` (PK) - Virtual key identifier
- `billing_account_id` (FK → `billing_accounts.id`) - Which billing account owns this key
- `litellm_virtual_key` - The actual LiteLLM virtual key string
- `label` - Human-readable name (e.g., "Default", "Production API")
- `is_default` - Boolean, marks the default key for this billing account
- `active` - Boolean, whether key is enabled
- Timestamps: `created_at`, `updated_at`

**`credit_ledger` table:**

- `id` (PK) - Transaction identifier
- `billing_account_id` (FK → `billing_accounts.id`) - Which billing account
- `virtual_key_id` (FK → `virtual_keys.id`, nullable) - Which key was used
- `amount` - Credit delta (positive = add, negative = deduct)
- `balance_after` - Balance snapshot after transaction
- `description` - Transaction description
- Timestamps: `created_at`

### LiteLLM Integration Model

**Hierarchy:**

- Each `billing_accounts` row owns one or more LiteLLM virtual keys (stored in `virtual_keys` table)
- LiteLLM Teams/Users are optional analytics labels (not used in MVP)
- MVP: 1 Auth.js user → 1 billing account → 1+ virtual keys

**User → Billing Account Mapping (MVP Rule):**

1. Auth.js manages `users` (identity, wallet address from SIWE)
2. On first successful login for `user.id`, we create a `billing_accounts` row if none exists:
   - Set `owner_user_id = user.id`
   - Call LiteLLM `/key/generate` with master key to provision a default virtual key
   - Create one default `virtual_keys` row with `is_default = true`, storing the LiteLLM key string
3. For MVP, each user has exactly one billing account and at least one virtual key
4. This mapping logic lives in `src/lib/auth/mapping.ts` via `getOrCreateBillingAccountForUser(user)`

---

## Implementation Checklist

### Phase 0: Database Reset & Route Restructuring (Fresh Start)

**Context:** No production users yet. Clean slate for Auth.js + new billing schema + cleaner API structure.

**Route Moves (Infrastructure/Meta Endpoints):**

- [x] Move `src/app/api/v1/meta/health/route.ts` → `src/app/health/route.ts`
- [x] Move `src/app/api/v1/meta/openapi/route.ts` → `src/app/openapi.json/route.ts`
- [x] Move `src/app/api/v1/meta/route-manifest/route.ts` → `src/app/meta/route-manifest/route.ts`
- [ ] Update any tests/docs referencing old paths

**Database Reset:**

- [x] Drop all existing tables from database
- [x] Delete all migration files in `src/shared/db/migrations/` or equivalent
- [x] Update `src/shared/db/schema.ts` to define new schema:
  - Remove old `accounts` table definition
  - Add `billing_accounts` table (with `owner_user_id`, `balance_credits`)
  - Add `virtual_keys` table (with `billing_account_id`, `litellm_virtual_key`, `label`, `is_default`, `active`)
  - Keep/update `credit_ledger` table (with `billing_account_id`, `virtual_key_id`)
- [x] Generate fresh migrations for new schema (see `src/adapters/server/db/migrations/0000_silly_siren.sql`)
- [x] Let Auth.js Drizzle adapter create its own tables (`users`, `accounts`, `sessions`, `verification_tokens`)

**API Routes to Remove (v0 MVP patterns):**

- [x] Delete `src/app/api/v1/wallet/link/` directory and route
- [x] Delete `src/app/api/admin/accounts/register-litellm-key/` directory and route
- [x] Delete `src/app/api/admin/accounts/[accountId]/credits/topup/` directory and route

**API Routes to Update:**

- [x] Update `src/app/api/v1/ai/completion/route.ts` to use session auth (not Authorization header)

**Database Layer:**

- [x] Update `src/shared/db/schema.ts` - Replace `accounts` with `billing_accounts` + `virtual_keys`
- [x] Update `src/adapters/server/accounts/drizzle.adapter.ts` - Work with new schema

**Tests to Remove (v0 patterns):**

- [x] Delete `tests/unit/contracts/wallet.link.v1.contract.test.ts`
- [x] Delete `tests/unit/app/_facades/wallet/link.test.ts`
- [x] Delete `tests/stack/api/wallet/link.stack.test.ts`
- [x] Delete `tests/stack/api/admin/accounts.stack.test.ts`
- [x] Delete `tests/unit/app/_facades/accounts/topup.test.ts`
- [x] Delete `tests/unit/app/_facades/accounts/register.test.ts`
- [x] Delete `tests/stack/api/admin/account-id-invariant.stack.test.ts`
- [x] Delete `tests/stack/api/accounts/provisioning.stack.test.ts`

**Tests to Update (new schema):**

- [ ] Update `tests/unit/shared/util/account-id.test.ts` - New ID derivation if needed
- [x] Update `tests/unit/features/ai/services/completion.test.ts` - Session-based auth
- [ ] Update `tests/unit/core/accounts/model.test.ts` - New schema
- [ ] Update `tests/stack/api/completion.route.stack.test.ts` - Session auth
- [ ] Update `tests/integration/db/drizzle.client.int.test.ts` - New tables
- [x] Update `tests/contract/app/ai.completion.facade.test.ts` - Session flow

### Phase 1: Auth.js Setup

- [x] Install dependencies: `next-auth@beta`, `@auth/drizzle-adapter`, `siwe`
- [x] Create `src/auth.ts` with SIWE provider configuration
- [x] Configure Drizzle adapter to use existing Postgres connection
- [x] Add `SESSION_SECRET` to `.env` (for JWT signing)
- [x] Expose Auth.js handler (`/api/auth/[...nextauth]`) and rely on built-in `/api/auth/session` for session checks

### Phase 2: Frontend Integration

- [x] Create `src/app/providers/auth.client.tsx` with SessionProvider
- [x] Update root layout to wrap app in SessionProvider (see `src/app/providers/app-providers.client.tsx`)
- [ ] Wire RainbowKit sign-in to Auth.js `signIn()` method (frontend implementation pending)
- [ ] Add sign-out button calling `signOut()` (frontend implementation pending)
- [x] Test: Stack test validates session → billing → LLM flow (see `tests/stack/auth/auth-flow.stack.test.ts`)

### Phase 3: Billing Integration

- [x] Create `src/lib/auth/mapping.ts` with `getOrCreateBillingAccountForUser(user)` function
  - On first login, provisions LiteLLM virtual key via `/key/generate` with MASTER_KEY
  - Creates `billing_accounts` row with `owner_user_id`
  - Creates default `virtual_keys` row with `is_default = true`, storing the LiteLLM key string
- [x] Update `src/adapters/server/accounts/drizzle.adapter.ts` to work with `billing_accounts` + `virtual_keys`
- [x] Update `/api/v1/ai/completion` to use session-only auth
  - Replace `Authorization` header logic with `getSessionUser()` call
  - Implement session → user → billing_account → virtual_key resolution
- [x] Test: Stack test validates complete flow (see `tests/stack/auth/auth-flow.stack.test.ts`)

### Phase 4: Route Protection

- [x] Implement session auth on `/api/v1/ai/*` routes per "API Auth Policy (MVP)" section
- [x] Ensure public routes remain accessible: `/api/auth/*`, `/health`, `/openapi.json`, `/meta/route-manifest`
- [x] Test: Stack test validates session requirement (see `tests/stack/auth/auth-flow.stack.test.ts`)
- [ ] Test: expired sessions are rejected (integration test pending)
- [x] Test: public infrastructure routes remain accessible without auth (existing tests pass)

### Phase 5: Cleanup

- [x] Remove any localStorage API key handling from frontend (no localStorage code found)
- [x] Remove any `Authorization` header code from chat requests
- [x] Update docs and environment variable examples (SESSION_SECRET added to .env.example)
- [x] Verify no legacy custom auth endpoints remain (all removed in Phase 0)

---

## Security Properties

### What Auth.js Provides

1. **Battle-tested Security**: Industry-standard auth framework, audited and maintained
2. **XSS Protection**: HttpOnly cookies cannot be read by JavaScript
3. **CSRF Protection**: Built-in CSRF tokens and SameSite cookies
4. **Session Management**: Automatic expiry, rotation, and revocation
5. **Provider Abstraction**: Easy to add OAuth/social login later

### What We Add

1. **Credential Separation**: LiteLLM virtual keys never exposed to clients
2. **Wallet Authentication**: SIWE proves wallet ownership without passwords
3. **Billing Integration**: Session → user → billing_account → virtual_key → LiteLLM
4. **LiteLLM Integration**: Billing accounts own LiteLLM virtual keys, tracked in our ledger

### What This Does NOT Cover (Out of Scope)

- Multi-wallet per account (future enhancement)
- Rate limiting per session (add middleware if needed)
- IP-based session validation
- Two-factor authentication
- Organizations/roles/permissions (single-tenant billing for now)

---

## Migration Path

### Clean Slate Approach

**Context:** No production users yet, so we're doing a full database reset rather than gradual migration.

1. **Phase 0: Database Reset** - Drop existing tables, delete migrations, define new schema
2. **Phase 1: Auth.js Setup** - Install dependencies, create auth config
3. **Phase 2: Frontend Integration** - Wire RainbowKit to Auth.js
4. **Phase 3: Billing Integration** - Implement billing_accounts + virtual_keys + LiteLLM provisioning
5. **Phase 4: Protection** - Add middleware and session checks
6. **Phase 5: Cleanup** - Remove any legacy localStorage code

### Changes to Billing Layer

- Table renamed: `accounts` → `billing_accounts`
- New table: `virtual_keys` (replaces direct apiKey column)
- Updated: `credit_ledger` now links to `billing_account_id` + `virtual_key_id`
- `LlmCaller` interface updated to source keys from `virtual_keys` table
- Auth resolution: session → user.id → billing_account → virtual_key → LiteLLM

---

## Key Design Decisions

### Why Auth.js Over Custom Implementation?

**Reasons:**

- Less custom security code to maintain
- Better ecosystem compatibility (works with RainbowKit, wagmi)
- Standard patterns users expect and trust
- Built-in features (CSRF, session rotation, logout)
- Easy to add OAuth/social login later if needed

**Trade-offs:**

- Auth.js tables (users, accounts, sessions) added to schema
- Learn Auth.js API and conventions
- Slightly less control over session format

**Verdict:** Worth it for security and maintainability.

### Why SIWE (Sign-In with Ethereum)?

**Reasons:**

- Wallet-native authentication (no email/password)
- Cryptographic proof of wallet ownership
- Works seamlessly with existing wagmi/RainbowKit setup
- Standard EIP-4361 message format

**Implementation Note:**

Auth.js does NOT provide a built-in SIWE provider. We implement SIWE via:

- Auth.js **Credentials provider** configured in `src/auth.ts`
- Official `siwe` library for message parsing and signature verification
- Custom authorize() function that validates EIP-4361 messages
- RainbowKit provides UI for wallet signing
- All auth flows go through Auth.js `/api/auth/*` routes (no custom endpoints)

### Session vs JWT Strategy

**Our Choice:** Database sessions (not JWT)

**Reasons:**

- Proper logout/revocation (delete session row)
- Audit trail (who's logged in, when)
- No token size limits (can store more data if needed)

**Configured in:** `src/auth.ts` with `strategy: "database"`

---

## Key Invariants

- LiteLLM virtual keys never leave the server (stored in `virtual_keys` table)
- Auth.js manages all session operations (cookies, storage, expiry)
- SIWE (via Credentials provider + `siwe` library) proves wallet ownership
- Billing layer owns LiteLLM virtual keys (`billing_accounts` → `virtual_keys`)
- Each user has one billing account with one default virtual key (MVP)
- All credit changes flow through `credit_ledger` (append-only audit log)

**Reference:** Auth.js docs at [authjs.dev](https://authjs.dev), SIWE spec at [eips.ethereum.org/EIPS/eip-4361](https://eips.ethereum.org/EIPS/eip-4361)
