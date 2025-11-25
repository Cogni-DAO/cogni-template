# Authentication Architecture

This document outlines the wallet-first authentication flow using Sign-In with Ethereum (SIWE).

## Core Principles

- **Strategy**: Wallet-first authentication via SIWE, managed by Auth.js v5.
- **Sessions**: Stateless JWT sessions, not database sessions.
- **Core Invariant**: A valid, authenticated session **must** contain both a `userId` and a `walletAddress`.

## End-to-End Flow

1. **Connect & Sign**: The user connects their wallet. The UI automatically triggers a SIWE signature request.
   - _Component_: `src/components/kit/auth/WalletConnectButton.tsx`

2. **Auth.js Callback**: The signature is POSTed to the `/api/auth/callback/siwe` endpoint. Auth.js verifies the signature and creates a user record if one doesn't exist.
   - _Logic_: `src/auth.ts`

3. **JWT Session**: Upon successful verification, Auth.js creates a JWT session containing the `userId` and `walletAddress` and sets it as a secure, HTTP-only cookie.

## Enforcement

Authentication and the core invariant are enforced at three levels:

1. **Protected UI Routes (`/app/*`)**:
   - The root layout for the `(app)` group (`src/app/(app)/layout.tsx`) uses the `useSession` hook.
   - It redirects unauthenticated users.
   - It forces a `signOut()` if a session exists but is invalid (e.g., missing `walletAddress`).

2. **Protected API Routes (`/api/v1/ai/*`)**:
   - A root proxy (`src/proxy.ts`) provides an initial guard, rejecting any unauthenticated requests to these routes with a `401`.
   - Each route handler performs a final auth check using server-side helpers to ensure deep security.

3. **Session Consistency**:
   - The `WalletConnectButton` continuously checks for mismatches between the connected wallet and the session. If the user disconnects or switches wallets, it forces a `signOut()` to invalidate the session.
   - _Helpers_: `src/shared/auth/wallet-session.ts`, `src/app/_lib/auth/session.ts`

## Dev Troubleshooting

### Ghost Sessions / Foreign Key Errors

If you ever see a foreign key error creating a billing account in dev after schema resets, this is likely due to a "ghost session". This happens when your browser still has a valid Auth.js session cookie, but the corresponding user record has been deleted from the `users` table after a database reset.

**The Fix:** Clear your browser cookies to remove stale JWT sessions. This will invalidate the "ghost session" and allow you to perform a fresh sign-in, which will correctly create a new user record. This is a local development artifact and should not occur in a production environment with a stable database. Do NOT claim billing has special handling for this yet, as it's an auth boundary issue.
