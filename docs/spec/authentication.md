---
id: authentication-spec
type: spec
title: Authentication
status: active
spec_state: draft
trust: draft
summary: SIWE-based wallet authentication with RainbowKit, enforcing wallet-session coherence.
read_when: Working on login flow, wallet connection, or session management.
owner: derekg1729
created: 2026-02-06
verified: 2026-02-06
tags: [auth]
---

# Authentication

## Context

The platform uses crypto wallets as the canonical identity for billing and credits. Authentication must enforce strict coherence between the connected wallet and the active session to prevent billing confusion (e.g., user thinks they are paying with Wallet A but are actually signed in as Wallet B).

## Goal

Provide SIWE-based (Sign-In with Ethereum) authentication via RainbowKit that ties wallet identity to NextAuth sessions, with strict disconnect-on-switch behavior.

## Non-Goals

- Email/password authentication
- Social login providers
- Custom SIWE message creation (uses RainbowKit SIWE adapter)

## Core Invariants

1. **WALLET_SESSION_COHERENCE**: Disconnecting or switching the wallet invalidates the SIWE session. If the wallet disconnects, the session is signed out. If the wallet switches to a different address, the session is signed out.

2. **SIWE_CANONICAL_IDENTITY**: The wallet address from the SIWE signature is the canonical user identity for billing, credits, and all account operations.

3. **RAINBOWKIT_ADAPTER_ONLY**: Authentication uses the stock RainbowKit SIWE adapter. No bespoke SIWE message creation or custom signature flows.

## Design

### Current UX (MVP): Connect vs Verify vs Session

The current authentication flow involves a 2-step sequence after a true disconnect or permission revocation:

1.  **Wallet Connection**: The user approves the site in their wallet (e.g., MetaMask "Connect this website").
2.  **Session Verification**: The user is presented with the "Verify your account" modal (RainbowKit's built-in SIWE UI) and must click "Sign message" to trigger the wallet signature prompt.

This "Verify your account" modal appears when the wallet is **connected** but the NextAuth session is **unauthenticated**. It is a standard part of the [RainbowKit Authentication](https://rainbowkit.com/docs/authentication) flow and ensures the user explicitly consents to signing in.

We use the stock [RainbowKit ConnectButton](https://rainbowkit.com/docs/connect-button) for the MVP, which enforces this behavior.

### Known UX Limitations (Intentional, MVP-Tolerated)

#### Problem A — Sign-in has two steps

- **Section 1**: MetaMask "Connect this website" (wallet permission).
- **Section 2**: RainbowKit "Verify your account" modal + MetaMask SIWE "Sign-in request" (signature).
- **Issue**: This feels disjoint because the intermediate step is a separate in-app modal requiring another click ("Sign message").

#### Problem B — Only Disconnect exists (no session-only Sign Out)

- We currently rely on RainbowKit "Disconnect", which removes the wallet connection/permission.
- **Result**: Next time, the user must do both steps again (connect approval + SIWE signature).
- **Desired future**: Add a session-only "Sign out" that clears the NextAuth session but leaves the wallet connected, so re-login is typically just one SIWE signature prompt.

### Planned Evolution (Post-MVP)

To remove the extra click and disjoint flow:

1.  Adopt [RainbowKit Custom ConnectButton](https://rainbowkit.com/docs/custom-connect-button) (`ConnectButton.Custom`) to gain full control over the UI.
2.  Automatically trigger the SIWE signature prompt immediately after wallet connection, bypassing the "Verify your account" modal step.
3.  Add two explicit actions in the UI:
    - **Sign out**: Clears the NextAuth session (using [NextAuth client API](https://next-auth.js.org/getting-started/client)).
    - **Disconnect wallet**: Fully disconnects the wallet.

This evolution is UI-level only; it will **not** introduce bespoke SIWE message creation or bypass the RainbowKit SIWE adapter.

### File Pointers

| File                              | Purpose                           |
| --------------------------------- | --------------------------------- |
| `src/app/_providers/`             | RainbowKit + SIWE provider wiring |
| `src/app/api/auth/[...nextauth]/` | NextAuth route with SIWE adapter  |

## Acceptance Checks

**Manual:**

1. Connect wallet → verify session is created with correct address
2. Switch wallet address → verify session is invalidated
3. Disconnect wallet → verify session is destroyed

## Open Questions

_(none)_

## Related

- [Security Auth](./security-auth.md)
- [DAO Enforcement](./dao-enforcement.md)
