# Authentication Architecture (Auth4 Goal)

This document outlines the roadmap to **Auth4**: a standardized, wallet-first authentication flow using **NextAuth v4** and the official **RainbowKit SIWE adapter**.

> [!IMPORTANT]
> This document supersedes previous v5 experiments. We are standardizing on **NextAuth v4** because the official RainbowKit SIWE adapter does not yet support v5.

## 🎯 Goal: Downgrade to NextAuth v4 & Adopt Canonical Adapter

We are downgrading from NextAuth v5 (Beta) to NextAuth v4 to support the official `@rainbow-me/rainbowkit-siwe-next-auth` adapter. This eliminates custom SIWE logic and aligns with the ecosystem standard.

### Version Matrix

| Package                                 | Version   | Notes                                  |
| :-------------------------------------- | :-------- | :------------------------------------- |
| `next-auth`                             | `^4.24.0` | **Downgrade from v5**. Stable release. |
| `@rainbow-me/rainbowkit`                | `^2.2.0`  | Existing dependency.                   |
| `@rainbow-me/rainbowkit-siwe-next-auth` | `^0.7.0`  | **New**. The official adapter.         |
| `siwe`                                  | `^2.0.0`  | Peer dependency for adapter.           |

### Implementation Checklist

- [ ] **1. Downgrade & Dependencies**
  - [ ] Uninstall `next-auth@beta`
  - [ ] Install `next-auth@4`
  - [ ] Install `@rainbow-me/rainbowkit-siwe-next-auth`

- [ ] **2. Refactor Auth Configuration (v4 Style)**
  - [ ] **[MODIFY] `src/auth.ts`**:
    - [ ] Remove `NextAuth()` initialization.
    - [ ] Export `authOptions: NextAuthOptions` instead.
    - [ ] **CRITICAL**: `authOptions.secret` MUST be set to `process.env.AUTH_SECRET`.
    - [ ] Remove `handlers`, `auth`, `signIn`, `signOut` exports.
    - [ ] Keep `Credentials` provider logic (SIWE verification) but adapt types.

  - [ ] **[MODIFY] `src/app/api/auth/[...nextauth]/route.ts`**:
    - [ ] Import `NextAuth` from `next-auth/next`.
    - [ ] Import `authOptions` from `@/auth`.
    - [ ] **CRITICAL**: This is the ONLY place `NextAuth(authOptions)` is called.
    - [ ] Export handler: `const handler = NextAuth(authOptions); export { handler as GET, handler as POST };`

- [ ] **3. Server-Side Session Helper (v4)**
  - [ ] **[NEW] `src/lib/auth/server.ts`**:
    - [ ] Import `getServerSession` from `next-auth`.
    - [ ] Import `authOptions` from `@/auth`.
    - [ ] Export `getServerSessionUser()`:
      ```typescript
      export async function getServerSessionUser() {
        const session = await getServerSession(authOptions);
        // ... enforce wallet-first invariant ...
        return session?.user;
      }
      ```
  - [ ] **[DELETE/MODIFY] `src/app/_lib/auth/session.ts`**:
    - [ ] Make this a thin re-export of `src/lib/auth/server.ts` or delete it and update imports.
  - [ ] **[MIGRATE]** Replace all usages of `auth()` or old helpers:
    - [ ] API Routes -> use `getServerSessionUser()`

- [ ] **4. Update Middleware (Edge)**
  - [ ] **[MODIFY] `src/proxy.ts`** (Do NOT rename):
    - [ ] Remove `auth()` wrapper (v5 specific).
    - [ ] Use `getToken({ req, secret: process.env.AUTH_SECRET })` from `next-auth/jwt`.
    - [ ] **CRITICAL**: Must use `process.env.AUTH_SECRET` explicitly.
    - [ ] Maintain the `/api/v1/ai/*` protection logic.

- [ ] **5. Update Provider Architecture**
  - [ ] **[MODIFY] `src/app/providers/wallet.client.tsx`**:
    - [ ] Import `RainbowKitSiweNextAuthProvider`.
    - [ ] Wrap `RainbowKitProvider` with the SIWE adapter.
    - [ ] Configure `getSiweMessageOptions`.
  - [ ] **Boundary**: `RainbowKitSiweNextAuthProvider` owns the entire SIWE client flow (message, nonce, verify).

- [ ] **6. Refactor WalletConnectButton**
  - [ ] **[MODIFY] `src/components/kit/auth/WalletConnectButton.tsx`**:
    - [ ] Remove custom `handleLogin`, `signMessage`, `signIn` logic.
    - [ ] Remove `useEffect` for auto-login (handled by adapter).
    - [ ] **Keep**: Wallet-session consistency check (force signOut on mismatch).
    - [ ] **Constraint**: This component MUST NOT construct SIWE messages or call `signIn('credentials')`.

---

## 🏗️ Architecture & Context

### Core Principles

- **Strategy**: Wallet-first authentication via SIWE.
- **Engine**: NextAuth v4 (Stable).
- **Adapter**: `@rainbow-me/rainbowkit-siwe-next-auth`.
- **Sessions**: Stateless JWT sessions (no database session table).
- **Secret**: `AUTH_SECRET` is the single source of truth for JWT signing/verification.

### Server-Side Session Helper (v4)

We will replace the v5 `auth()` helper with a dedicated v4-compatible helper to ensure type safety and invariant enforcement.

**`src/lib/auth/server.ts`** (Canonical):

```typescript
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";

export async function getServerSessionUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.walletAddress) return null;
  return session.user;
}
```

### Dev Troubleshooting

#### Ghost Sessions

**Problem**: After a database reset (`pnpm dev:stack:db:reset`), your browser may still hold a valid JWT cookie pointing to a user ID that no longer exists in the database.
**Symptom**: Foreign key constraint violations when creating billing accounts or other resources.
**Policy**:

1.  If a valid JWT session refers to a `userId` that is missing from the `users` table, this is a **ghost session**.
2.  We do **NOT** auto-create users in billing or account adapters to fix this.
3.  The request should fail (500/logged) and developers should clear cookies and re-login.
    **Enforcement**: The billing/account layer (`getOrCreateBillingAccountForUser`) must assume the user row already exists.
