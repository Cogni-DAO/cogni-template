---
id: wallet-auth-setup-guide
type: guide
title: Wallet Auth Setup
status: draft
trust: draft
summary: How wallet connectivity (wagmi/RainbowKit), HTTP contracts, and provider wiring are set up — covers completed Steps 1-3 of the MVP wallet loop.
read_when: Working on wallet features or need to understand the current wallet provider setup.
owner: derekg1729
created: 2026-02-06
verified: 2026-02-06
tags: [wallet, auth, frontend]
---

# Wallet Auth Setup

## When to Use This

You need to understand or extend the current wallet connectivity setup (wagmi/RainbowKit providers, wallet link contract, backend route). For the **next phase** (SIWE authentication, session management, session-based chat), see the [Accounts & API Keys Initiative](../../work/initiatives/ini.accounts-api-keys.md).

## Preconditions

- [ ] Familiar with [Accounts Design](../ACCOUNTS_DESIGN.md) and [Security Auth Spec](../spec/security-auth.md)
- [ ] `pnpm install` completed (wallet dependencies are in the lockfile)

## Steps

### Overview

The MVP wallet loop has 4 major steps. **Steps 1-3 are complete** (covered here). Steps 4A and 4 (SIWE auth + session-based chat) are planned work tracked in the [Accounts & API Keys Initiative](../../work/initiatives/ini.accounts-api-keys.md).

### Step 1: Define shared HTTP contract for /api/v1/wallet/link ✅ COMPLETE

**Contract (TARGET - Secure):**

- Request: `WalletLinkRequest { address: string }`
- Response: `WalletLinkResponse { accountId: string }` (no apiKey)

**Legacy (being replaced):** Old contract returned `{ accountId, apiKey }` to browser. This is insecure and being replaced by session-based auth in Step 4A.

**Files Created:**

- [ ] `src/contracts/wallet.link.v1.contract.ts` - Contract with Zod schemas
- [ ] `tests/unit/contracts/wallet.link.v1.contract.test.ts` - Unit tests

### Step 2: Implement /api/v1/wallet/link backend route ✅ COMPLETE

**Legacy (insecure):** Current implementation returns `{ accountId, apiKey }` to browser. Being replaced in Step 4.1 with session-based auth that returns `{ accountId }` only.

**Files Created:**

- [ ] `src/app/api/v1/wallet/link/route.ts` - POST endpoint
- [ ] `src/app/_facades/wallet/link.server.ts` - Facade
- [ ] `tests/stack/api/wallet/link.stack.test.ts` - Stack tests

### Step 3: Install wallet libraries and add global providers ✅ COMPLETE

- [x] Add dependencies: wagmi@2.19.5, viem@2.39.3, @rainbow-me/rainbowkit@2.2.9, @tanstack/react-query@5.90.10 (pinned)
- [x] Create src/app/providers/ subdomain for client-side provider composition
- [x] Create WalletProvider with dynamic connector imports (wagmi config created in useEffect)
- [x] Create QueryProvider, WalletProvider, and AppProviders composition
- [x] Wrap root app layout with AppProviders (inside ThemeProvider)
- [x] Configure client env schema with NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID (optional)
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

### Next: SIWE Authentication & Session-Based Chat (Steps 4A + 4)

> All remaining work (SIWE auth endpoints, session storage, session middleware, frontend SIWE flow, dual-auth completion, session-based chat UI, and e2e verification) is tracked in the [Accounts & API Keys Initiative](../../work/initiatives/ini.accounts-api-keys.md).

**Security Invariant:** API key never leaves the server. Browser authenticates with HttpOnly session cookie only.

### Current Architecture

#### Libraries

- **RainbowKit**: wallet connect UI
- **wagmi**: React hooks for EVM account/chain, including `signMessage` for SIWE
- **viem**: underlying EVM client (bundled with wagmi)

#### Providers (Implemented)

In `src/app/layout.tsx`:

- `<AppProviders>` client component wraps the app
- AppProviders composes: QueryProvider → WalletProvider
- WalletProvider wraps children with WagmiProvider + RainbowKitProvider
- Configured for Ethereum Sepolia (11155111) primary, Base Sepolia (84532) secondary
- Uses dynamic imports for connectors (SSR-safe pattern)

#### Connect Button (Available)

- RainbowKit's `<ConnectButton />` component available
- Test implementation in `src/app/wallet-test/page.tsx`

#### Backend Layers

| Layer    | Files                                                                                          |
| -------- | ---------------------------------------------------------------------------------------------- |
| App      | `/api/v1/wallet/link/route.ts`, `/api/v1/ai/completion/route.ts`                               |
| Feature  | `src/features/ai/services/completion.ts`                                                       |
| Ports    | `LlmService` (`src/ports/llm.port.ts`), `AccountService` (`src/ports/accounts.port.ts`)        |
| Adapters | `src/adapters/server/ai/litellm.adapter.ts`, `src/adapters/server/accounts/drizzle.adapter.ts` |

#### Credits & Ledger

- `AccountService.ensureAccountExists(accountId)` — called from wallet link before usage
- `AccountService.debitForUsage(...)` — called after LLM usage, runs in DB transaction
- `AccountService.creditAccount(...)` — manual top-ups (MVP); later: on-chain USDC watcher
- Frontend never directly manipulates balances

## Verification

```bash
pnpm check          # Full lint + type + format validation
pnpm test           # Verify wallet contract and provider tests pass
```

Visit `http://localhost:3000/wallet-test` to verify wallet connection works in the dev environment.

## Troubleshooting

### Problem: `indexedDB is not defined` during Next.js build/SSR

**Solution:** WalletConnect uses IndexedDB and is not SSR-safe. Ensure connectors are loaded via the dynamic import pattern in `useEffect` (see Step 3 above). The wagmi config must have `ssr: false`.

### Problem: Wallet connect button doesn't appear

**Solution:** Verify `<AppProviders>` wraps the app in `layout.tsx` and that RainbowKit CSS is imported (`import '@rainbow-me/rainbowkit/styles.css'`).

## Related

- [Accounts & API Keys Initiative](../../work/initiatives/ini.accounts-api-keys.md) — SIWE auth, session management, and session-based chat roadmap (Steps 4A + 4)
- [Accounts Design](../ACCOUNTS_DESIGN.md) — system architecture for accounts and credits
- [API Key Endpoints](../ACCOUNTS_API_KEY_ENDPOINTS.md) — API contracts for account/key management
- [Security Auth Spec](../spec/security-auth.md) — authentication architecture and security invariants
- [Billing Evolution Spec](../spec/billing-evolution.md) — billing system stages 5-7
